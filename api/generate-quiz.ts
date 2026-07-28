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
    const { lectureId, userId, numQuestions, focusTopic, transcript } = body;

    if (!lectureId || !userId) {
      return jsonError(res, 400, "lectureId and userId are required");
    }

    const text = transcript || "";
    const n = Math.min(Math.max(numQuestions || 8, 1), 20);
    const topic = focusTopic ? ` focusing on "${focusTopic}"` : "";
    const model = getGemini({ jsonMode: true });

    const result = await model.generateContent(`Generate ${n} quiz questions${topic} from this lecture.

LECTURE TEXT:
${text.slice(0, 30000)}

Return ONLY valid JSON as an array of ${n} questions:
[
  { "type": "mcq", "question": "...", "topic": "${focusTopic || "General"}", "options": ["correct", "wrong1", "wrong2", "wrong3"], "correct_index": 0, "explanation": "Why correct" },
  { "type": "tf", "question": "...", "topic": "${focusTopic || "General"}", "answer": true, "explanation": "..." },
  { "type": "fib", "question": "Fill in the blank: _____ is ...", "topic": "${focusTopic || "General"}", "answer": "term", "explanation": "..." }
]
Mix question types. Ensure answers are accurate to the lecture content.`);

    let questions: any[];
    try {
      questions = cleanAndParseJson(result.response.text());
      if (!Array.isArray(questions)) questions = [];
    } catch {
      questions = [];
    }

    const quizId = crypto.randomUUID();

    return res.status(200).json({ quizId, questions });
  } catch (e: any) {
    console.error("generate-quiz error:", e);
    const msg = e?.message ?? String(e);
    const isRateLimit = msg.includes("429") || msg.includes("Quota") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Too Many Requests");
    return jsonError(res, isRateLimit ? 429 : 500, isRateLimit ? "Gemini API rate limit or quota reached. Please wait a minute and try again." : msg);
  }
}
