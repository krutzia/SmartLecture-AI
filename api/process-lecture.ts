import type { VercelRequest, VercelResponse } from "./lib/ai.ts";
import { getAI, DEFAULT_MODEL, cleanAndParseJson, extractArray, jsonError, readBody } from "./lib/ai.ts";

export const maxDuration = 60;
export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return jsonError(res, 405, "Method not allowed");

  try {
    const body = await readBody(req);
    const { lectureId, userId, transcript, title } = body;

    if (!lectureId || !userId) {
      return jsonError(res, 400, "lectureId and userId are required");
    }

    const text = transcript || "";
    const lectureTitle = title || "Untitled Lecture";

    console.log("=== API PROCESS LECTURE (OPENROUTER/DEEPSEEK) ===");
    console.log(`Transcript Length: ${text.length} characters`);
    console.log(`First 500 characters sent to OpenRouter:\n${text.slice(0, 500)}`);
    console.log("==================================================");

    const ai = getAI();

    const summaryPrompt = `You are a lecture summarizer. Generate a study summary for the lecture titled "${lectureTitle}".

LECTURE TEXT:
${text.slice(0, 30000)}

Return ONLY valid JSON with this exact structure:
{
  "quick": "2-3 sentence summary",
  "detailed": "Detailed markdown summary with ## headers and paragraphs",
  "bullets": ["bullet point 1", "bullet point 2", ... up to 8],
  "takeaways": ["key takeaway 1", ... up to 5]
}`;

    const conceptsPrompt = `Extract key concepts from this lecture titled "${lectureTitle}".

LECTURE TEXT:
${text.slice(0, 30000)}

Return ONLY valid JSON as an object with key "concepts" containing an array of concepts:
{
  "concepts": [
    { "term": "Concept Name", "definition": "Clear definition from the lecture", "kind": "concept|definition|keyword", "cluster": "Suggested cluster name" }
  ]
}
Aim for 10-20 concepts. Kinds should be: "definition" for terms defined with "X is a/an Y", "concept" for major ideas, "keyword" for important terms.`;

    const flashcardsPrompt = `Create flashcards from this lecture titled "${lectureTitle}".

LECTURE TEXT:
${text.slice(0, 30000)}

Return ONLY valid JSON as an object with key "flashcards" containing an array:
{
  "flashcards": [
    { "question": "Clear, specific question", "answer": "Concise but complete answer from the lecture" }
  ]
}
Create 10-15 flashcards covering the most important material.`;

    const quizPrompt = `Generate quiz questions for this lecture titled "${lectureTitle}".

LECTURE TEXT:
${text.slice(0, 30000)}

Return ONLY valid JSON as an object with key "questions" containing an array of 8 questions:
{
  "questions": [
    { "type": "mcq", "question": "...", "topic": "${lectureTitle}", "options": ["correct answer", "wrong1", "wrong2", "wrong3"], "correct_index": 0, "explanation": "Why the correct answer is right" },
    { "type": "tf", "question": "True/false statement", "topic": "${lectureTitle}", "answer": true, "explanation": "..." },
    { "type": "fib", "question": "Fill in the blank: _____ is ...", "topic": "${lectureTitle}", "answer": "the term", "explanation": "..." }
  ]
}
Mix MCQ, true/false, and fill-in-the-blank types. Make questions that test real understanding.`;

    const results = await Promise.allSettled([
      ai.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [{ role: "user", content: summaryPrompt }],
        response_format: { type: "json_object" },
      }),
      ai.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [{ role: "user", content: conceptsPrompt }],
        response_format: { type: "json_object" },
      }),
      ai.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [{ role: "user", content: flashcardsPrompt }],
        response_format: { type: "json_object" },
      }),
      ai.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [{ role: "user", content: quizPrompt }],
        response_format: { type: "json_object" },
      }),
    ]);

    const summaryText = results[0].status === "fulfilled" ? results[0].value.choices[0]?.message?.content || "" : "";
    const conceptsText = results[1].status === "fulfilled" ? results[1].value.choices[0]?.message?.content || "" : "";
    const flashcardsText = results[2].status === "fulfilled" ? results[2].value.choices[0]?.message?.content || "" : "";
    const quizText = results[3].status === "fulfilled" ? results[3].value.choices[0]?.message?.content || "" : "";

    let summary: any = null;
    try {
      if (summaryText) summary = cleanAndParseJson(summaryText);
    } catch (err) {
      console.error("Failed to parse summary JSON:", err);
    }
    if (!summary) {
      summary = {
        quick: `Summary of ${lectureTitle}`,
        detailed: `## ${lectureTitle}\n\n${text.slice(0, 1000)}...`,
        bullets: ["Key lecture content discussed"],
        takeaways: [`Understand ${lectureTitle}`],
      };
    }

    let concepts: any[] = [];
    try {
      if (conceptsText) concepts = extractArray(cleanAndParseJson(conceptsText));
    } catch (err) {
      console.error("Failed to parse concepts JSON:", err);
    }

    let flashcards: any[] = [];
    try {
      if (flashcardsText) flashcards = extractArray(cleanAndParseJson(flashcardsText));
    } catch (err) {
      console.error("Failed to parse flashcards JSON:", err);
    }

    let questions: any[] = [];
    try {
      if (quizText) questions = extractArray(cleanAndParseJson(quizText));
    } catch (err) {
      console.error("Failed to parse quiz JSON:", err);
    }

    return res.status(200).json({
      summary,
      concepts,
      flashcards,
      quiz: { questions },
    });
  } catch (e: any) {
    console.error("process-lecture error:", e);
    const msg = e?.message ?? String(e);
    const isRateLimit = msg.includes("429") || msg.includes("rate_limit") || msg.includes("Quota") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Too Many Requests");
    return jsonError(res, isRateLimit ? 429 : 500, isRateLimit ? "OpenRouter API rate limit reached. Please wait a minute and try again." : msg);
  }
}
