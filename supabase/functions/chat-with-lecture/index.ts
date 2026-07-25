import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { lectureId, userId, messages } = await req.json();
    if (!lectureId || !userId || !Array.isArray(messages)) throw new Error("lectureId, userId and messages required");

    const { data: lecture } = await admin.from("lectures").select("id,title,user_id").eq("id", lectureId).eq("user_id", userId).single();
    if (!lecture) throw new Error("Lecture not found");

    const [{ data: transcript }, { data: summary }, { data: concepts }] = await Promise.all([
      admin.from("transcripts").select("full_text,segments").eq("lecture_id", lectureId).maybeSingle(),
      admin.from("summaries").select("quick,detailed,bullets,takeaways").eq("lecture_id", lectureId).maybeSingle(),
      admin.from("concepts").select("term,definition").eq("lecture_id", lectureId),
    ]);

    const transcriptText = (transcript?.full_text ?? "").slice(0, 22000);
    const summaryText = summary?.detailed ?? summary?.quick ?? "";
    const bullets = Array.isArray(summary?.bullets) ? (summary!.bullets as string[]) : [];
    const conceptList = (concepts ?? [])
      .map((c: any) => `- ${c.term}${c.definition ? `: ${c.definition}` : ""}`)
      .join("\n");

    // Build pseudo-"slides" by chunking the detailed notes / bullets so the
    // model can answer "Explain slide N" referentially. If detailed notes
    // exist, split by blank lines; otherwise fall back to bullets.
    const slideChunks: string[] = (() => {
      if (summary?.detailed) {
        return summary.detailed
          .split(/\n{2,}/)
          .map((s: string) => s.trim())
          .filter(Boolean)
          .slice(0, 30);
      }
      return bullets.slice(0, 30);
    })();
    const slideIndex = slideChunks.length
      ? slideChunks.map((s, i) => `Slide ${i + 1}: ${s.slice(0, 400)}`).join("\n\n")
      : "(no slides available)";
    const slideCount = slideChunks.length;

    const systemPrompt = `You are a lecture-aware study buddy for the lecture titled "${lecture.title}". You ONLY answer using the lecture material below. If something is not covered, say so plainly instead of inventing.

Command handling (recognise these regardless of casing/phrasing):
- "Explain slide N" / "what's on slide N" / "go deeper on slide N": there are ${slideCount} slides/sections. Quote the matching "Slide N" block below, then explain it in plain language with an example. If N > ${slideCount} or no slides exist, say how many slides are available and offer the closest one.
- "Summarize again" / "recap" / "TL;DR" / "summarize in simpler terms": re-summarize the lecture FRESH — do not repeat your earlier wording. Give a one-line TL;DR, 4-6 key bullets, and one "why it matters" line. If the user asks for a different depth (shorter/simpler/more detail/ELI5), adapt accordingly.
- "What did the professor say about X": search the transcript, quote the relevant line(s) verbatim in a blockquote, and cite the slide number when you can.
- "Give me examples": concrete examples drawn from the lecture, or analogies tied to its content.
- "Ask me questions" / "Quiz me": Socratic mode — ask ONE focused question at a time grounded in the lecture, wait for the answer, give brief feedback (correct / partial / incorrect + why), then the next. After ~5 questions give a tiny recap of strengths and gaps.

General:
- Answer questions about specific concepts, examples, or quotes from the lecture.

- When asked for examples, give concrete ones from the lecture or analogies tied to its content.
- Use markdown (headings, lists, **bold**, code blocks where relevant). Be warm, concise, and clear.

=== LECTURE QUICK SUMMARY ===
${summary?.quick ?? "(none)"}

=== KEY CONCEPTS ===
${conceptList || "(none)"}

=== SLIDES / SECTIONS ===
${slideIndex}

=== DETAILED NOTES ===
${summaryText || "(none)"}

=== FULL TRANSCRIPT ===
${transcriptText || "(none)"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached, please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e: any) {
    console.error("chat-with-lecture error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
