import type { VercelRequest, VercelResponse } from "./lib/gemini";
import { getGemini, splitIntoSlides, buildChatPrompt, jsonError, readBody, type ChatMessage } from "./lib/gemini";

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

    const model = getGemini();
    const transcriptText = transcript || "";
    const systemPrompt = buildChatPrompt(transcriptText, messages as ChatMessage[]);

    const history = (messages as ChatMessage[]).slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const lastUserMsg = messages[messages.length - 1];
    if (!lastUserMsg || lastUserMsg.role !== "user") {
      return jsonError(res, 400, "Last message must be from user");
    }

    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "model", parts: [{ text: "I understand. I'm ready to help the student study this lecture. I'll answer based only on the lecture content and use [[slide:N]] markers when referencing specific sections." }] },
        ...history.map((h) => ({
          role: h.role as "user" | "model",
          parts: h.parts,
        })),
      ],
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const result = await chat.sendMessageStream(lastUserMsg.content);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        const sseData = JSON.stringify({ choices: [{ delta: { content: text } }] });
        res.write(`data: ${sseData}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (e: any) {
    console.error("chat-with-lecture error:", e);
    if (!res.headersSent) {
      jsonError(res, 500, e?.message ?? "Internal server error");
    } else {
      res.end();
    }
  }
}
