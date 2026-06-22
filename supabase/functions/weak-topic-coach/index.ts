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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const userId = body?.userId;
    if (!userId) {
      return new Response(JSON.stringify({ error: "userId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the user's weakest topic over the last 60 days (min 3 attempts)
    const since = new Date();
    since.setDate(since.getDate() - 60);
    const { data: attempts } = await admin
      .from("quiz_attempts")
      .select("topic,correct,lecture_id,created_at")
      .eq("user_id", userId)
      .gte("created_at", since.toISOString());

    if (!attempts || attempts.length === 0) {
      return new Response(JSON.stringify({ error: "Not enough quiz history yet. Take a quiz first!" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    type Bucket = { c: number; t: number; lectureCounts: Map<string, number> };
    const map = new Map<string, Bucket>();
    for (const a of attempts) {
      const topic = (a.topic ?? "").trim();
      if (!topic) continue;
      const b = map.get(topic) ?? { c: 0, t: 0, lectureCounts: new Map() };
      b.t += 1;
      if (a.correct) b.c += 1;
      if (a.lecture_id) b.lectureCounts.set(a.lecture_id, (b.lectureCounts.get(a.lecture_id) ?? 0) + 1);
      map.set(topic, b);
    }

    const ranked = Array.from(map.entries())
      .filter(([, b]) => b.t >= 3)
      .map(([topic, b]) => ({
        topic,
        accuracy: b.c / b.t,
        attempts: b.t,
        lectureId: Array.from(b.lectureCounts.entries()).sort((a, z) => z[1] - a[1])[0]?.[0],
      }))
      .filter((r) => r.accuracy < 0.7 && r.lectureId)
      .sort((a, b) => a.accuracy - b.accuracy);

    if (ranked.length === 0) {
      return new Response(
        JSON.stringify({ error: "No weak topics yet — keep practicing to surface areas to improve." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const weakest = ranked[0];

    // Pull lecture context
    const [{ data: lecture }, { data: transcript }, { data: summary }, { data: concepts }] = await Promise.all([
      admin.from("lectures").select("id,title").eq("id", weakest.lectureId!).maybeSingle(),
      admin.from("transcripts").select("full_text").eq("lecture_id", weakest.lectureId!).maybeSingle(),
      admin.from("summaries").select("quick,detailed,bullets").eq("lecture_id", weakest.lectureId!).maybeSingle(),
      admin.from("concepts").select("term,definition").eq("lecture_id", weakest.lectureId!),
    ]);

    if (!lecture) {
      return new Response(JSON.stringify({ error: "Source lecture not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const context = [
      summary?.quick ? `QUICK SUMMARY:\n${summary.quick}` : "",
      summary?.detailed ? `DETAILED NOTES:\n${summary.detailed}` : "",
      Array.isArray(summary?.bullets) && summary!.bullets.length
        ? `BULLETS:\n- ${(summary!.bullets as string[]).join("\n- ")}`
        : "",
      concepts?.length
        ? `KEY CONCEPTS:\n${concepts.map((c: any) => `- ${c.term}: ${c.definition ?? ""}`).join("\n")}`
        : "",
      transcript?.full_text ? `TRANSCRIPT:\n${(transcript.full_text as string).slice(0, 8000)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const aiRes = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a friendly, encouraging study coach. The student is struggling with a specific topic from a lecture. Write a short, focused mini-lesson grounded ONLY in the provided lecture material, then create 5 multiple-choice questions targeting that topic.",
          },
          {
            role: "user",
            content: `The student's weakest topic is "${weakest.topic}" (current accuracy: ${Math.round(weakest.accuracy * 100)}% over ${weakest.attempts} attempts) from the lecture "${lecture.title}". Produce a coaching lesson and 5 MCQs.\n\nLECTURE MATERIAL:\n${context}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "submit_coaching",
            description: "Return a mini-lesson and 5 focused MCQs",
            parameters: {
              type: "object",
              properties: {
                headline: { type: "string", description: "Short encouraging headline (max 8 words)" },
                lesson: {
                  type: "string",
                  description: "Markdown mini-lesson, 150-300 words, focused on the topic. Use headings and bullets.",
                },
                key_points: {
                  type: "array",
                  items: { type: "string" },
                  description: "3-5 bullet 'remember this' points",
                },
                questions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      question: { type: "string" },
                      topic: { type: "string" },
                      options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
                      correct_index: { type: "integer", minimum: 0, maximum: 3 },
                      explanation: { type: "string" },
                    },
                    required: ["question", "topic", "options", "correct_index", "explanation"],
                    additionalProperties: false,
                  },
                  minItems: 5,
                  maxItems: 5,
                },
              },
              required: ["headline", "lesson", "key_points", "questions"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "submit_coaching" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached. Try again soon." }), {
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
    if (!toolCall) throw new Error("No coaching returned");
    const args = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify({
        topic: weakest.topic,
        accuracy: weakest.accuracy,
        attempts: weakest.attempts,
        lecture: { id: lecture.id, title: lecture.title },
        headline: args.headline,
        lesson: args.lesson,
        key_points: args.key_points ?? [],
        questions: args.questions ?? [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("weak-topic-coach error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
