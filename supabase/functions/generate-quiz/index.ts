import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const lectureId = body?.lectureId;
    const numQuestions = Math.min(Math.max(Number(body?.numQuestions) || 8, 3), 15);
    if (!lectureId || typeof lectureId !== "string") {
      return new Response(JSON.stringify({ error: "lectureId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify ownership and load context
    const { data: lecture } = await admin
      .from("lectures")
      .select("id,title,user_id")
      .eq("id", lectureId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!lecture) {
      return new Response(JSON.stringify({ error: "Lecture not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: transcript }, { data: summary }, { data: concepts }] = await Promise.all([
      admin.from("transcripts").select("full_text").eq("lecture_id", lectureId).maybeSingle(),
      admin.from("summaries").select("quick,detailed,bullets,takeaways").eq("lecture_id", lectureId).maybeSingle(),
      admin.from("concepts").select("term,definition").eq("lecture_id", lectureId),
    ]);

    const context = [
      summary?.quick ? `QUICK SUMMARY:\n${summary.quick}` : "",
      summary?.detailed ? `DETAILED NOTES:\n${summary.detailed}` : "",
      Array.isArray(summary?.bullets) && summary!.bullets.length
        ? `BULLETS:\n${(summary!.bullets as string[]).join("\n- ")}`
        : "",
      concepts?.length
        ? `KEY CONCEPTS:\n${concepts.map((c: any) => `- ${c.term}: ${c.definition ?? ""}`).join("\n")}`
        : "",
      transcript?.full_text ? `TRANSCRIPT:\n${(transcript.full_text as string).slice(0, 12000)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    if (!context.trim()) {
      return new Response(JSON.stringify({ error: "No lecture content to quiz on yet." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiRes = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are an expert teacher. Create rigorous but fair multiple-choice quiz questions strictly grounded in the provided lecture material. Each question must have exactly 4 options with one clearly correct answer. Vary difficulty. Always include a brief explanation citing the material.",
          },
          {
            role: "user",
            content: `Generate ${numQuestions} multiple-choice questions for the lecture titled "${lecture.title}".\n\nLECTURE MATERIAL:\n${context}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_quiz",
              description: "Return a multiple-choice quiz",
              parameters: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: { type: "string" },
                        topic: { type: "string", description: "Short 1-3 word topic label for analytics" },
                        options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
                        correct_index: { type: "integer", minimum: 0, maximum: 3 },
                        explanation: { type: "string" },
                      },
                      required: ["question", "topic", "options", "correct_index", "explanation"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["questions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_quiz" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached, try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway ${aiRes.status}: ${t}`);
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No quiz returned");
    const args = JSON.parse(toolCall.function.arguments);
    const questions = (args.questions ?? []).filter(
      (q: any) =>
        q && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.correct_index),
    );

    if (questions.length === 0) throw new Error("Quiz had no valid questions");

    const { data: inserted, error: insErr } = await admin
      .from("quizzes")
      .insert({
        user_id: userId,
        lecture_id: lectureId,
        title: `Quiz · ${new Date().toLocaleDateString()}`,
        questions,
        question_count: questions.length,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ quizId: inserted.id, questions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-quiz error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
