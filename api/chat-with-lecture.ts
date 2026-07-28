import type { VercelRequest, VercelResponse } from "./lib/ai.ts";
import { getAI, DEFAULT_MODEL, splitIntoSlides, buildChatPrompt, jsonError, readBody, type ChatMessage } from "./lib/ai.ts";

export const maxDuration = 60;
export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return jsonError(res, 405, "Method not allowed");
  }

  try {
    const body = await readBody(req);
    const { lectureId, userId, messages, transcript, mode } = body;

    if (!lectureId || !userId) {
      return jsonError(res, 400, "lectureId and userId are required");
    }

    if (mode === "slides") {
      const text = transcript || "";
      const slides = splitIntoSlides(text);
      return res.status(200).json({ slides });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return jsonError(res, 400, "messages array is required");
    }

    const transcriptText = transcript || "";
    const systemPrompt = buildChatPrompt(transcriptText, messages as ChatMessage[]);

    console.log("=== API CHAT WITH LECTURE (OPENROUTER/DEEPSEEK) ===");
    console.log(`Transcript Length: ${transcriptText.length} characters`);
    console.log(`First 500 characters sent to OpenRouter:\n${transcriptText.slice(0, 500)}`);
    console.log(`System Prompt sent to OpenRouter:\n${systemPrompt}`);
    console.log(`Last User Message: ${messages[messages.length - 1]?.content}`);
    console.log("====================================================");

    const ai = getAI();

    const aiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    for (const m of messages as ChatMessage[]) {
      if (!m.content || !m.content.trim()) continue;
      const role = m.role === "assistant" ? "assistant" : "user";
      aiMessages.push({ role, content: m.content });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const stream = await ai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: aiMessages,
      stream: true,
    });

    let accumulatedResponse = "";
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) {
        accumulatedResponse += text;
        const sseData = JSON.stringify({ choices: [{ delta: { content: text } }] });
        res.write(`data: ${sseData}\n\n`);
      }
    }

    console.log("=== Chat Response Received ===");
    console.log(accumulatedResponse);
    console.log("==============================");

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (e: any) {
    console.error("chat-with-lecture error:", e);
    const msg = e?.message ?? String(e);
    const isRateLimit = msg.includes("429") || msg.includes("rate_limit") || msg.includes("Quota") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Too Many Requests");
    const status = isRateLimit ? 429 : 500;
    const userMsg = isRateLimit
      ? "OpenRouter API rate limit reached. Please wait a minute before sending another message."
      : msg;
    if (!res.headersSent) {
      jsonError(res, status, userMsg);
    } else {
      res.end();
    }
  }
}

