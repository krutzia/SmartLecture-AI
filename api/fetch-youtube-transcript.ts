import type { VercelRequest, VercelResponse } from "./lib/ai";
import { jsonError, readBody } from "./lib/ai";
import { YoutubeTranscript } from "youtube-transcript";

export const maxDuration = 60;
export const config = { maxDuration: 60 };

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("?")[0] || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const parts = u.pathname.split("/");
      const idx = parts.findIndex((p) => ["embed", "shorts", "v"].includes(p));
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1].split("?")[0];
    }
    return null;
  } catch {
    // If raw 11-char video ID is passed
    if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) return url.trim();
    return null;
  }
}

async function getTranscriptWithFallbacks(videoId: string): Promise<string> {
  const errors: string[] = [];

  // Strategy 1: YoutubeTranscript with English preferred
  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" });
    if (items && items.length > 0) {
      const text = items
        .map((item) => item.text.replace(/\[.*?\]/g, "").trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (text.length > 30) return text;
    }
  } catch (e: any) {
    errors.push(`Strategy 1 (lang: en): ${e?.message ?? e}`);
  }

  // Strategy 2: YoutubeTranscript default
  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId);
    if (items && items.length > 0) {
      const text = items
        .map((item) => item.text.replace(/\[.*?\]/g, "").trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (text.length > 30) return text;
    }
  } catch (e: any) {
    errors.push(`Strategy 2 (default): ${e?.message ?? e}`);
  }

  // Strategy 3: Direct page scraping with desktop User-Agent + captionTracks XML parsing
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageRes = await fetch(watchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const html = await pageRes.text();
    const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
    if (match) {
      const json = JSON.parse(match[1]);
      const tracks = json?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks && tracks.length > 0) {
        const enTrack =
          tracks.find((t: any) => t.languageCode === "en" || t.vssId?.includes(".en")) || tracks[0];
        const capRes = await fetch(enTrack.baseUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });
        const xmlText = await capRes.text();
        const matches = [...xmlText.matchAll(/<text[^>]*>(.*?)<\/text>/gs)];
        if (matches.length > 0) {
          const lines = matches
            .map((m) =>
              m[1]
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/<[^>]+>/g, "")
                .trim(),
            )
            .filter(Boolean);
          const text = lines.join(" ").replace(/\s{2,}/g, " ").trim();
          if (text.length > 30) return text;
        }
      }
    }
  } catch (e: any) {
    errors.push(`Strategy 3 (direct scraping): ${e?.message ?? e}`);
  }

  // Strategy 4: Direct YouTube timedtext API endpoint fallback
  try {
    const timedtextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`;
    const res = await fetch(timedtextUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });
    const xmlText = await res.text();
    const matches = [...xmlText.matchAll(/<text[^>]*>(.*?)<\/text>/gs)];
    if (matches.length > 0) {
      const lines = matches
        .map((m) =>
          m[1]
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/<[^>]+>/g, "")
            .trim(),
        )
        .filter(Boolean);
      const text = lines.join(" ").replace(/\s{2,}/g, " ").trim();
      if (text.length > 30) return text;
    }
  } catch (e: any) {
    errors.push(`Strategy 4 (timedtext endpoint): ${e?.message ?? e}`);
  }

  console.error("All YouTube transcript extraction strategies failed:", errors);
  throw new Error(
    "Could not extract transcript content from this video. The video may not have captions enabled or YouTube blocked automated extraction."
  );
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

    const fullText = await getTranscriptWithFallbacks(videoId);

    console.log(`Transcript fetched: ${fullText.length} characters`);
    console.log(`First 500 chars:\n${fullText.slice(0, 500)}`);
    console.log(`================================`);

    return res.status(200).json({ transcript: fullText, videoId });
  } catch (e: any) {
    console.error("fetch-youtube-transcript error:", e);
    const msg = e?.message ?? String(e);
    if (msg.includes("disabled") || msg.includes("captions enabled")) {
      return jsonError(res, 422, "This video does not have transcripts or captions enabled by the uploader.");
    }
    return jsonError(res, 500, msg);
  }
}

