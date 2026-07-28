import type { VercelRequest, VercelResponse } from "./lib/ai";
import { jsonError, readBody } from "./lib/ai";
import { YoutubeTranscript } from "youtube-transcript";

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const parts = u.pathname.split("/");
      const idx = parts.findIndex((p) => ["embed", "shorts", "v"].includes(p));
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    }
    return null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return jsonError(res, 405, "Method not allowed");

  try {
    const body = await readBody(req);
    const { url } = body;

    if (!url) return jsonError(res, 400, "url is required");

    const videoId = extractVideoId(url);
    if (!videoId) {
      return jsonError(res, 400, "Could not extract a YouTube video ID from the provided URL.");
    }

    console.log(`=== FETCH YOUTUBE TRANSCRIPT ===`);
    console.log(`Video ID: ${videoId}`);
    console.log(`URL: ${url}`);

    let transcriptItems: Array<{ text: string; duration: number; offset: number }>;
    try {
      transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
    } catch (fetchErr: any) {
      const msg = fetchErr?.message ?? String(fetchErr);
      console.error("YoutubeTranscript.fetchTranscript failed:", msg);
      if (msg.includes("disabled") || msg.includes("Transcripts are disabled")) {
        return jsonError(res, 422, "This video does not have transcripts or captions enabled by the uploader.");
      }
      if (msg.includes("not found") || msg.includes("Could not find")) {
        return jsonError(res, 404, "Video not found or is private/unavailable.");
      }
      return jsonError(res, 502, `Failed to fetch YouTube transcript: ${msg}`);
    }

    if (!transcriptItems || transcriptItems.length === 0) {
      return jsonError(res, 422, "No transcript content was found for this video. The video may not have captions.");
    }

    // Join transcript segments into clean paragraphs
    const fullText = transcriptItems
      .map((item) => item.text.replace(/\[.*?\]/g, "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();

    console.log(`Transcript fetched: ${fullText.length} characters`);
    console.log(`First 500 chars:\n${fullText.slice(0, 500)}`);
    console.log(`================================`);

    return res.status(200).json({ transcript: fullText, videoId });
  } catch (e: any) {
    console.error("fetch-youtube-transcript error:", e);
    return jsonError(res, 500, e?.message ?? "Internal server error");
  }
}
