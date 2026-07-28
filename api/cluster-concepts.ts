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
    const { lectureId, concepts } = body;

    if (!lectureId) {
      return jsonError(res, 400, "lectureId is required");
    }

    const conceptList = Array.isArray(concepts) ? concepts : [];

    if (conceptList.length === 0) {
      return res.status(200).json({ clusters: [] });
    }

    const model = getGemini({ jsonMode: true });
    const conceptText = conceptList
      .map((c: any, i: number) => `${i + 1}. [${c.id}] "${c.term}" - ${(c.definition || "").slice(0, 150)}`)
      .join("\n");

    const result = await model.generateContent(`Group these lecture concepts into meaningful clusters.

CONCEPTS:
${conceptText}

Return ONLY valid JSON as an array of clusters:
[
  { "name": "Cluster Name", "conceptIds": ["id1", "id2"] }
]
Group related concepts together. Create 3-6 clusters with descriptive names.`);

    let clusters: { name: string; conceptIds: string[] }[];
    try {
      clusters = cleanAndParseJson(result.response.text());
      if (!Array.isArray(clusters)) clusters = [];
    } catch {
      clusters = [];
    }

    return res.status(200).json({ clusters });
  } catch (e: any) {
    console.error("cluster-concepts error:", e);
    const msg = e?.message ?? String(e);
    const isRateLimit = msg.includes("429") || msg.includes("Quota") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Too Many Requests");
    return jsonError(res, isRateLimit ? 429 : 500, isRateLimit ? "Gemini API rate limit or quota reached. Please wait a minute and try again." : msg);
  }
}
