import type { VercelRequest, VercelResponse } from "./lib/gemini";
import { getGemini, jsonError, readBody } from "./lib/gemini";

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

    const model = getGemini();
    const conceptText = conceptList
      .map((c: any, i: number) => `${i + 1}. [${c.id}] "${c.term}" - ${(c.definition || "").slice(0, 150)}`)
      .join("\n");

    const result = await model.generateContent(`Group these lecture concepts into meaningful clusters.

CONCEPTS:
${conceptText}

Return ONLY valid JSON (no markdown, no code fences) as an array of clusters:
[
  { "name": "Cluster Name", "conceptIds": ["id1", "id2"] }
]
Group related concepts together. Create 3-6 clusters with descriptive names.`);

    let clusters: { name: string; conceptIds: string[] }[];
    try {
      let cleaned = result.response.text().trim();
      if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      clusters = JSON.parse(cleaned);
      if (!Array.isArray(clusters)) throw new Error("not array");
    } catch {
      const match = result.response.text().match(/\[[\s\S]*\]/);
      clusters = match ? JSON.parse(match[0]) : [];
    }

    return res.status(200).json({ clusters });
  } catch (e: any) {
    console.error("cluster-concepts error:", e);
    return jsonError(res, 500, e?.message ?? "Internal server error");
  }
}
