import type { VercelRequest, VercelResponse } from "./lib/gemini.ts";
import { getGemini, splitIntoSlides, buildChatPrompt, jsonError, readBody, type ChatMessage } from "./lib/gemini.ts";

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

    console.log("=== API CHAT WITH LECTURE ===");
    console.log(`Transcript Length: ${transcriptText.length} characters`);
    console.log(`First 500 characters sent to Gemini:\n${transcriptText.slice(0, 500)}`);
    console.log(`System Prompt sent to Gemini:\n${systemPrompt}`);
    console.log(`Last User Message: ${messages[messages.length - 1]?.content}`);
    console.log("=============================");

    const model = getGemini({ systemInstruction: systemPrompt });

    const rawHistory = (messages as ChatMessage[]).slice(0, -1);
    const formattedHistory: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

    for (const m of rawHistory) {
      if (!m.content || !m.content.trim()) continue;
      const role: "user" | "model" = m.role === "assistant" ? "model" : "user";

      if (formattedHistory.length === 0) {
        if (role === "user") {
          formattedHistory.push({ role, parts: [{ text: m.content }] });
        }
      } else {
        const last = formattedHistory[formattedHistory.length - 1];
        if (last.role === role) {
          last.parts[0].text += "\n\n" + m.content;
        } else {
          formattedHistory.push({ role, parts: [{ text: m.content }] });
        }
      }
    }

    if (formattedHistory.length > 0 && formattedHistory[formattedHistory.length - 1].role === "user") {
      formattedHistory.pop();
    }

    const lastUserMsg = messages[messages.length - 1];
    if (!lastUserMsg || lastUserMsg.role !== "user") {
      return jsonError(res, 400, "Last message must be from user");
    }

    const chat = model.startChat({ history: formattedHistory });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const result = await chat.sendMessageStream(lastUserMsg.content);

    let accumulatedResponse = "";
    for await (const chunk of result.stream) {
      const text = chunk.text();
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
    const isRateLimit = msg.includes("429") || msg.includes("Quota") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Too Many Requests");
    const status = isRateLimit ? 429 : 500;
    const userMsg = isRateLimit
      ? "Gemini API rate limit or free quota reached. Please wait a minute before sending another message."
      : msg;
    if (!res.headersSent) {
      jsonError(res, status, userMsg);
    } else {
      res.end();
    }
  }
}
