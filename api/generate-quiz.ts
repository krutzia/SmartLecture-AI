import type { VercelRequest, VercelResponse } from "./lib/ai";
import { getAI, DEFAULT_MODEL, cleanAndParseJson, extractArray, jsonError, readBody } from "./lib/ai";

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

    console.log("=== API GENERATE QUIZ (OPENROUTER/DEEPSEEK) ===");
    console.log(`Transcript Length: ${text.length} characters`);
    console.log(`First 500 characters sent to OpenRouter:\n${text.slice(0, 500)}`);
    console.log("================================================");

    const ai = getAI();
    const quizPrompt = `Generate ${n} quiz questions${topic} from this lecture.

LECTURE TEXT:
${text.slice(0, 30000)}

Return ONLY valid JSON as an object with key "questions" containing an array of ${n} questions:
{
  "questions": [
    { "type": "mcq", "question": "...", "topic": "${focusTopic || "General"}", "options": ["correct", "wrong1", "wrong2", "wrong3"], "correct_index": 0, "explanation": "Why correct" },
    { "type": "tf", "question": "...", "topic": "${focusTopic || "General"}", "answer": true, "explanation": "..." },
    { "type": "fib", "question": "Fill in the blank: _____ is ...", "topic": "${focusTopic || "General"}", "answer": "term", "explanation": "..." }
  ]
}
Mix question types. Ensure answers are accurate to the lecture content.`;

    console.log("--- Quiz Prompt sent to OpenRouter ---");
    console.log(quizPrompt);
    console.log("--------------------------------------");

    const result = await ai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [{ role: "user", content: quizPrompt }],
      response_format: { type: "json_object" },
    });
    const resultText = result.choices[0]?.message?.content || "";

    console.log("=== Quiz Response Received ===");
    console.log(resultText);
    console.log("==============================");

    let questions: any[];
    try {
      questions = extractArray(cleanAndParseJson(resultText));
    } catch {
      questions = [];
    }

    const quizId = crypto.randomUUID();

    return res.status(200).json({ quizId, questions });
  } catch (e: any) {
    console.error("generate-quiz error:", e);
    const msg = e?.message ?? String(e);
    const isRateLimit = msg.includes("429") || msg.includes("rate_limit") || msg.includes("Quota") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Too Many Requests");
    return jsonError(res, isRateLimit ? 429 : 500, isRateLimit ? "OpenRouter API rate limit reached. Please wait a minute and try again." : msg);
  }
}
