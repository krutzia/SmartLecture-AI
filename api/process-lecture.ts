import type { VercelRequest, VercelResponse } from "./lib/gemini.ts";
import { getGemini, cleanAndParseJson, jsonError, readBody } from "./lib/gemini.ts";

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
    const model = getGemini({ jsonMode: true });

    const [summaryResult, conceptsResult, flashcardsResult, quizResult] = await Promise.all([
      model.generateContent(`You are a lecture summarizer. Generate a study summary for the lecture titled "${lectureTitle}".

LECTURE TEXT:
${text.slice(0, 30000)}

Return ONLY valid JSON with this exact structure:
{
  "quick": "2-3 sentence summary",
  "detailed": "Detailed markdown summary with ## headers and paragraphs",
  "bullets": ["bullet point 1", "bullet point 2", ... up to 8],
  "takeaways": ["key takeaway 1", ... up to 5]
}`),

      model.generateContent(`Extract key concepts from this lecture titled "${lectureTitle}".

LECTURE TEXT:
${text.slice(0, 30000)}

Return ONLY valid JSON as an array of concepts:
[
  { "term": "Concept Name", "definition": "Clear definition from the lecture", "kind": "concept|definition|keyword", "cluster": "Suggested cluster name" }
]
Aim for 10-20 concepts. Kinds should be: "definition" for terms defined with "X is a/an Y", "concept" for major ideas, "keyword" for important terms.`),

      model.generateContent(`Create flashcards from this lecture titled "${lectureTitle}".

LECTURE TEXT:
${text.slice(0, 30000)}

Return ONLY valid JSON as an array:
[
  { "question": "Clear, specific question", "answer": "Concise but complete answer from the lecture" }
]
Create 10-15 flashcards covering the most important material.`),

      model.generateContent(`Generate quiz questions for this lecture titled "${lectureTitle}".

LECTURE TEXT:
${text.slice(0, 30000)}

Return ONLY valid JSON as an array of 8 questions:
[
  { "type": "mcq", "question": "...", "topic": "${lectureTitle}", "options": ["correct answer", "wrong1", "wrong2", "wrong3"], "correct_index": 0, "explanation": "Why the correct answer is right" },
  { "type": "tf", "question": "True/false statement", "topic": "${lectureTitle}", "answer": true, "explanation": "..." },
  { "type": "fib", "question": "Fill in the blank: _____ is ...", "topic": "${lectureTitle}", "answer": "the term", "explanation": "..." }
]
Mix MCQ, true/false, and fill-in-the-blank types. Make questions that test real understanding.`),
    ]);

    const summary = cleanAndParseJson(summaryResult.response.text());
    const concepts = cleanAndParseJson(conceptsResult.response.text());
    const flashcards = cleanAndParseJson(flashcardsResult.response.text());
    const questions = cleanAndParseJson(quizResult.response.text());

    return res.status(200).json({
      summary,
      concepts: Array.isArray(concepts) ? concepts : [],
      flashcards: Array.isArray(flashcards) ? flashcards : [],
      quiz: { questions: Array.isArray(questions) ? questions : [] },
    });
  } catch (e: any) {
    console.error("process-lecture error:", e);
    const msg = e?.message ?? String(e);
    const isRateLimit = msg.includes("429") || msg.includes("Quota") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Too Many Requests");
    return jsonError(res, isRateLimit ? 429 : 500, isRateLimit ? "Gemini API rate limit or quota reached. Please wait a minute and try again." : msg);
  }
}
