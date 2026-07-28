import type { VercelRequest, VercelResponse } from "./lib/ai";
import { getAI, DEFAULT_MODEL, jsonError } from "./lib/ai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return jsonError(res, 500, "OPENROUTER_API_KEY is not set in environment variables");
  }
  if (apiKey.length < 10) {
    return jsonError(res, 500, "OPENROUTER_API_KEY appears invalid (too short). Get a valid key from https://openrouter.ai/keys");
  }
  if (!apiKey.startsWith("sk-or-")) {
    return jsonError(res, 500, `OPENROUTER_API_KEY has wrong format (starts with "${apiKey.slice(0, 6)}..."). It should start with "sk-or-". Get a valid key from https://openrouter.ai/keys`);
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
