import type { VercelRequest, VercelResponse } from "./lib/ai.js";
import { jsonError, readBody } from "./lib/ai.js";
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

function parseTimedTextXml(xml: string): string {
  if (!xml || typeof xml !== "string") return "";
  const lines: string[] = [];

  const decode = (str: string) =>
    str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));

  // Try 1: <p> tags with optional <s> sub-spans (srv3 format)
  const pMatches = [...xml.matchAll(/<p\s+[^>]*>([\s\S]*?)<\/p>/gi)];
  if (pMatches.length > 0) {
    for (const m of pMatches) {
      const inner = m[1];
      const sMatches = [...inner.matchAll(/<s[^>]*>([^<]*)<\/s>/gi)];
      const text = sMatches.length > 0 ? sMatches.map((s) => s[1]).join("") : inner.replace(/<[^>]+>/g, "");
      const clean = decode(text).trim();
      if (clean) lines.push(clean);
    }
  }

  // Try 2: <text> tags (classic format)
  if (lines.length === 0) {
    const textMatches = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi)];
    for (const m of textMatches) {
      const clean = decode(m[1].replace(/<[^>]+>/g, "")).trim();
      if (clean) lines.push(clean);
    }
  }

  // Try 3: <w> tags (word tags in format 3 timedtext)
  if (lines.length === 0) {
    const wMatches = [...xml.matchAll(/<w\s+[^>]*>([\s\S]*?)<\/w>/gi)];
    for (const m of wMatches) {
      const clean = decode(m[1].replace(/<[^>]+>/g, "")).trim();
      if (clean) lines.push(clean);
    }
  }

  // Try 4: Generic XML tag stripping fallback (excluding <head>)
  if (lines.length === 0) {
    const bodyContent = xml.replace(/<head>[\s\S]*?<\/head>/gi, "");
    const rawText = decode(bodyContent.replace(/<[^>]+>/g, " "));
    if (rawText.trim()) lines.push(rawText.trim());
  }

  return lines
    .join(" ")
    .replace(/\[.*?\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function getTranscriptWithFallbacks(videoId: string): Promise<string> {
  const errors: string[] = [];

  // Strategy 1: Direct YouTube InnerTube API (ANDROID 20.10.38 client)
  try {
    const androidUA = "com.google.android.youtube/20.10.38 (Linux; U; Android 11)";
    const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": androidUA },
      body: JSON.stringify({
        context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", hl: "en", gl: "US" } },
        videoId,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks && tracks.length > 0) {
        const selectedTrack =
          tracks.find((t: any) => t.languageCode === "en" || t.vssId?.includes(".en")) || tracks[0];
        const capRes = await fetch(selectedTrack.baseUrl, { headers: { "User-Agent": androidUA } });
        if (capRes.ok) {
          const xml = await capRes.text();
          const text = parseTimedTextXml(xml);
          if (text.length > 30) return text;
        }
      }
    }
    errors.push("Strategy 1 (InnerTube Android): No valid caption tracks or timedtext returned");
  } catch (e: any) {
    errors.push(`Strategy 1 (InnerTube Android): ${e?.message ?? e}`);
  }

  // Strategy 2: YoutubeTranscript default (auto language)
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
    errors.push("Strategy 2 (YoutubeTranscript default): Returned empty text");
  } catch (e: any) {
    errors.push(`Strategy 2 (YoutubeTranscript default): ${e?.message ?? e}`);
  }

  // Strategy 3: YoutubeTranscript with English preferred
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
    errors.push("Strategy 3 (YoutubeTranscript lang: en): Returned empty text");
  } catch (e: any) {
    errors.push(`Strategy 3 (YoutubeTranscript lang: en): ${e?.message ?? e}`);
  }

  // Strategy 4: Direct HTML page scraping + captionTracks parsing
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageRes = await fetch(watchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
      if (match) {
        const json = JSON.parse(match[1]);
        const tracks = json?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (tracks && tracks.length > 0) {
          const selectedTrack =
            tracks.find((t: any) => t.languageCode === "en" || t.vssId?.includes(".en")) || tracks[0];
          const capRes = await fetch(selectedTrack.baseUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            },
          });
          if (capRes.ok) {
            const xmlText = await capRes.text();
            const text = parseTimedTextXml(xmlText);
            if (text.length > 30) return text;
          }
        }
      }
    }
    errors.push("Strategy 4 (Web page scraping): Could not extract valid transcript");
  } catch (e: any) {
    errors.push(`Strategy 4 (Web page scraping): ${e?.message ?? e}`);
  }

  // Strategy 5: Direct YouTube timedtext API endpoint fallback
  try {
    for (const lang of ["en", "hi", "es", "auto"]) {
      const timedtextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}`;
      const res = await fetch(timedtextUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
      });
      if (res.ok) {
        const xmlText = await res.text();
        const text = parseTimedTextXml(xmlText);
        if (text.length > 30) return text;
      }
    }
    errors.push("Strategy 5 (Timedtext direct API): No text found for sampled languages");
  } catch (e: any) {
    errors.push(`Strategy 5 (Timedtext direct API): ${e?.message ?? e}`);
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

