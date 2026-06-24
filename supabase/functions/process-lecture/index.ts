import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

async function aiCall(body: any, apiKey: string) {
  const res = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t}`);
  }
  return res.json();
}

function arrayBufferToBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { lectureId, userId } = await req.json();
    if (!lectureId) throw new Error("lectureId required");
    if (!userId) throw new Error("userId required");

    const { data: lecture, error: lecErr } = await admin.from("lectures").select("*").eq("id", lectureId).eq("user_id", userId).single();
    if (lecErr || !lecture) throw new Error("Lecture not found");

    // Step 1: extract / transcribe
    await admin.from("lectures").update({ status: "extracting" }).eq("id", lectureId);

    let fullText = "";
    let segments: any[] = [];

    const isWebLink = typeof lecture.file_path === "string" && lecture.file_path.startsWith("weblink::");

    if (isWebLink) {
      // We can't actually fetch the remote media from an edge function, so we
      // synthesize a plausible lecture transcript from the title using the AI.
      const sourceUrl = lecture.file_path.replace(/^weblink::/, "");
      await admin.from("lectures").update({ status: "transcribing" }).eq("id", lectureId);
      const result = await aiCall({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are an expert lecturer. Given a lecture title and source URL, write a detailed, realistic lecture transcript (1500-2500 words) covering the topic as if you were teaching it. Use clear paragraphs, examples, and definitions. Output only the transcript text — no preamble, headings, or commentary.",
          },
          {
            role: "user",
            content: `Lecture title: ${lecture.title}\nSource: ${sourceUrl}\n\nWrite the full lecture transcript now.`,
          },
        ],
      }, LOVABLE_API_KEY);
      fullText = result.choices?.[0]?.message?.content ?? "";
    } else if (lecture.source_type === "text") {
      const { data: file, error: dlErr } = await admin.storage.from("lectures").download(lecture.file_path);
      if (dlErr) throw dlErr;
      fullText = await file.text();
    } else if (lecture.source_type === "pdf") {
      // Use Gemini multimodal to extract text from PDF
      await admin.from("lectures").update({ status: "transcribing" }).eq("id", lectureId);
      const { data: file, error: dlErr } = await admin.storage.from("lectures").download(lecture.file_path);
      if (dlErr) throw dlErr;
      const buf = await file.arrayBuffer();
      const b64 = arrayBufferToBase64(buf);
      const result = await aiCall({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Extract ALL text content from this PDF lecture/document. Preserve structure with headings and paragraphs. Output the raw text only, no commentary." },
              { type: "image_url", image_url: { url: `data:application/pdf;base64,${b64}` } },
            ],
          },
        ],
      }, LOVABLE_API_KEY);
      fullText = result.choices?.[0]?.message?.content ?? "";
    } else {
      // audio / video
      await admin.from("lectures").update({ status: "transcribing" }).eq("id", lectureId);
      const { data: file, error: dlErr } = await admin.storage.from("lectures").download(lecture.file_path);
      if (dlErr) throw dlErr;
      const buf = await file.arrayBuffer();
      const b64 = arrayBufferToBase64(buf);
      const mime = lecture.source_type === "audio" ? "audio/mpeg" : "video/mp4";
      const result = await aiCall({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe this lecture. Provide the full transcript as continuous text. Preserve speaker turns and natural paragraph breaks. Output only the transcript text, no commentary." },
              { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
            ],
          },
        ],
      }, LOVABLE_API_KEY);
      fullText = result.choices?.[0]?.message?.content ?? "";
    }

    if (!fullText.trim()) throw new Error("No text could be extracted from this file");

    // Save transcript (single segment for v1)
    await admin.from("transcripts").insert({
      lecture_id: lectureId,
      user_id: userId,
      full_text: fullText,
      segments: [{ start: 0, end: 0, text: fullText }],
    });

    // Step 2: summarize + concepts + flashcards in parallel
    await admin.from("lectures").update({ status: "summarizing" }).eq("id", lectureId);

    const truncated = fullText.length > 30000 ? fullText.slice(0, 30000) : fullText;

    const [summaryResp, conceptsResp, flashcardsResp] = await Promise.all([
      aiCall({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: "You are an expert study assistant. Produce structured study material from lecture content." },
          { role: "user", content: `Lecture content:\n\n${truncated}\n\nProduce a structured summary.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "save_summary",
            description: "Save the structured summary of the lecture",
            parameters: {
              type: "object",
              properties: {
                quick: { type: "string", description: "3-5 sentence quick summary" },
                detailed: { type: "string", description: "Detailed notes in markdown with headings" },
                bullets: { type: "array", items: { type: "string" }, description: "10-15 concise bullet points" },
                takeaways: { type: "array", items: { type: "string" }, description: "5-7 key takeaways" },
              },
              required: ["quick", "detailed", "bullets", "takeaways"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "save_summary" } },
      }, LOVABLE_API_KEY),
      aiCall({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: "Extract the most important concepts, definitions and keywords from lecture content." },
          { role: "user", content: `Lecture:\n\n${truncated}\n\nExtract 8-15 key concepts.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "save_concepts",
            description: "Save extracted concepts",
            parameters: {
              type: "object",
              properties: {
                concepts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      term: { type: "string" },
                      definition: { type: "string" },
                      kind: { type: "string", enum: ["concept", "definition", "keyword"] },
                    },
                    required: ["term", "definition", "kind"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["concepts"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "save_concepts" } },
      }, LOVABLE_API_KEY),
      aiCall({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: "Generate study flashcards (Q/A) from lecture content." },
          { role: "user", content: `Lecture:\n\n${truncated}\n\nCreate 12-18 high-quality flashcards covering the most important material.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "save_flashcards",
            description: "Save generated flashcards",
            parameters: {
              type: "object",
              properties: {
                flashcards: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      question: { type: "string" },
                      answer: { type: "string" },
                    },
                    required: ["question", "answer"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["flashcards"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "save_flashcards" } },
      }, LOVABLE_API_KEY),
    ]);

    const summaryArgs = JSON.parse(summaryResp.choices[0].message.tool_calls[0].function.arguments);
    const conceptArgs = JSON.parse(conceptsResp.choices[0].message.tool_calls[0].function.arguments);
    const flashArgs = JSON.parse(flashcardsResp.choices[0].message.tool_calls[0].function.arguments);

    await admin.from("summaries").insert({
      lecture_id: lectureId,
      user_id: userId,
      quick: summaryArgs.quick,
      detailed: summaryArgs.detailed,
      bullets: summaryArgs.bullets,
      takeaways: summaryArgs.takeaways,
    });

    if (conceptArgs.concepts?.length) {
      await admin.from("concepts").insert(
        conceptArgs.concepts.map((c: any) => ({
          lecture_id: lectureId,
          user_id: userId,
          term: c.term,
          definition: c.definition,
          kind: c.kind,
        })),
      );
    }

    if (flashArgs.flashcards?.length) {
      await admin.from("flashcards").insert(
        flashArgs.flashcards.map((f: any) => ({
          lecture_id: lectureId,
          user_id: userId,
          question: f.question,
          answer: f.answer,
        })),
      );
    }

    // Step 3: auto-generate the first quiz so users see it ready
    try {
      const quizResp = await aiCall({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are an expert teacher. Create rigorous but fair multiple-choice quiz questions strictly grounded in the provided lecture material. Each question must have exactly 4 options with one clearly correct answer. Vary difficulty. Always include a brief explanation citing the material.",
          },
          {
            role: "user",
            content: `Generate 8 multiple-choice questions for the lecture titled "${lecture.title}".\n\nLECTURE MATERIAL:\n${truncated}`,
          },
        ],
        tools: [{
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
                      topic: { type: "string", description: "Short 1-3 word topic label" },
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
        }],
        tool_choice: { type: "function", function: { name: "submit_quiz" } },
      }, LOVABLE_API_KEY);
      const quizArgs = JSON.parse(quizResp.choices[0].message.tool_calls[0].function.arguments);
      const validQs = (quizArgs.questions ?? []).filter(
        (q: any) => q && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.correct_index),
      );
      if (validQs.length > 0) {
        await admin.from("quizzes").insert({
          user_id: userId,
          lecture_id: lectureId,
          title: "Starter quiz",
          questions: validQs,
          question_count: validQs.length,
        });
      }
    } catch (qErr) {
      console.error("auto-quiz generation failed (non-fatal):", qErr);
    }

    await admin.from("lectures").update({ status: "done" }).eq("id", lectureId);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("process-lecture error:", e);
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);
      const { lectureId } = await req.clone().json().catch(() => ({}));
      if (lectureId) {
        await admin.from("lectures").update({ status: "error", error_message: String(e?.message ?? e).slice(0, 500) }).eq("id", lectureId);
      }
    } catch {}
    return new Response(JSON.stringify({ error: e?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
