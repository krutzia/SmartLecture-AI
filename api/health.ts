import type { VercelRequest, VercelResponse } from "./lib/gemini.ts";
import { getGemini, jsonError } from "./lib/gemini.ts";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonError(res, 500, "GEMINI_API_KEY is not set in environment variables");
  }
  if (apiKey.length < 10) {
    return jsonError(res, 500, "GEMINI_API_KEY appears invalid (too short). Get a valid key from https://aistudio.google.com/apikey");
  }
  if (!apiKey.startsWith("AIza")) {
    return jsonError(res, 500, `GEMINI_API_KEY has wrong format (starts with "${apiKey.slice(0, 4)}..."). It should start with "AIzaSy". Get a valid key from https://aistudio.google.com/apikey`);
  }

  try {
    const model = getGemini();
    await model.generateContent("Reply with 'OK'");
    return res.status(200).json({
      ok: true,
      keyPrefix: apiKey.slice(0, 8) + "...",
      message: "API key is valid and Gemini API calls are working successfully.",
    });
  } catch (e: any) {
    return jsonError(res, 500, `Gemini API test failed: ${e?.message ?? e}`);
  }
}
