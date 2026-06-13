// ElevenLabs TTS for the lecture Summary "Listen" button.
// Caches generated MP3s in the `tts-cache` Supabase Storage bucket keyed by
// lectureId + section so the second click is instant and doesn't re-spend
// ElevenLabs credits.
//
// If ELEVENLABS_API_KEY is not configured, returns 200 with
// { configured: false } so the client can fall back to browser speechSynthesis.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  encode as base64Encode,
  decode as base64Decode,
} from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah
const MODEL_ID = "eleven_turbo_v2_5";
const MAX_CHARS = 4500;
const BUCKET = "tts-cache";

const safeSection = (s: string) =>
  s.replace(/[^a-z0-9_-]/gi, "-").slice(0, 64) || "section";

// Short stable hash so cache invalidates when the underlying text changes.
const shortHash = async (input: string) => {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const getAdmin = () => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) return json({ configured: false });

  let body: {
    text?: unknown;
    voiceId?: unknown;
    lectureId?: unknown;
    section?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const text =
    typeof body.text === "string" ? body.text.trim().slice(0, MAX_CHARS) : "";
  const voiceId =
    typeof body.voiceId === "string" && body.voiceId.length > 0
      ? body.voiceId
      : DEFAULT_VOICE_ID;
  const lectureId =
    typeof body.lectureId === "string" ? body.lectureId : "";
  const section =
    typeof body.section === "string" ? safeSection(body.section) : "";

  if (!text) return json({ error: "text is required" }, 400);

  const canCache = !!(lectureId && section);
  const cachePath = canCache
    ? `${lectureId}/${section}-${voiceId}-${await shortHash(text)}.mp3`
    : null;

  const admin = canCache ? getAdmin() : null;

  // 1. Try cache
  if (admin && cachePath) {
    const { data: cached, error: dlErr } = await admin.storage
      .from(BUCKET)
      .download(cachePath);
    if (!dlErr && cached) {
      const buf = await cached.arrayBuffer();
      return json({
        configured: true,
        cached: true,
        audioBase64: base64Encode(new Uint8Array(buf)),
        mimeType: "audio/mpeg",
      });
    }
  }

  // 2. Generate via ElevenLabs
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: MODEL_ID,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
            speed: 1.0,
          },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("ElevenLabs TTS failed", res.status, errText);
      if (res.status === 401 || res.status === 402 || res.status === 429) {
        return json({ configured: false, reason: res.status });
      }
      return json({ error: `TTS failed (${res.status})` }, 500);
    }

    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // 3. Persist to cache (best-effort)
    if (admin && cachePath) {
      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(cachePath, bytes, {
          contentType: "audio/mpeg",
          upsert: true,
        });
      if (upErr) console.warn("TTS cache upload failed", upErr.message);
    }

    return json({
      configured: true,
      cached: false,
      audioBase64: base64Encode(bytes),
      mimeType: "audio/mpeg",
    });
  } catch (e) {
    console.error("TTS error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
