import type { VercelRequest, VercelResponse } from "./lib/ai.js";
import { getAI, DEFAULT_MODEL, jsonError } from "./lib/ai.js";

export const maxDuration = 60;
export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return jsonError(res, 500, "OPENROUTER_API_KEY is not set in environment variables");
  }
  if (apiKey.length < 8) {
    return jsonError(res, 500, "OPENROUTER_API_KEY appears invalid (too short). Get a valid key from https://openrouter.ai/keys");
  }

  try {
    const ai = getAI();
    await ai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [{ role: "user", content: "Reply with 'OK'" }],
      max_tokens: 10,
    });
    return res.status(200).json({
      ok: true,
      keyPrefix: apiKey.slice(0, 12) + "...",
      message: "API key is valid and OpenRouter (DeepSeek) API calls are working successfully.",
    });
  } catch (e: any) {
    return jsonError(res, 500, `OpenRouter API test failed: ${e?.message ?? e}`);
  }
}
