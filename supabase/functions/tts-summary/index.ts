// ElevenLabs TTS for the lecture Summary "Listen" button.
// Returns base64-encoded MP3 audio. If ELEVENLABS_API_KEY is not configured,
// returns 200 with { configured: false } so the client can fall back to
// browser speechSynthesis without surfacing an error.
import { encode as base64Encode } from "https://deno.land/std@0.224.0/encoding/base64.ts";

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

// Default voice: Sarah — warm, clear narration voice
const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const MODEL_ID = "eleven_turbo_v2_5";
const MAX_CHARS = 4500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) {
    // Soft-fail so the client falls back to browser speech synthesis.
    return json({ configured: false });
  }

  let body: { text?: unknown; voiceId?: unknown };
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

  if (!text) return json({ error: "text is required" }, 400);

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
      // Soft-fail on quota / billing / auth so client falls back gracefully.
      if (res.status === 401 || res.status === 402 || res.status === 429) {
        return json({ configured: false, reason: res.status });
      }
      return json({ error: `TTS failed (${res.status})` }, 500);
    }

    const buffer = await res.arrayBuffer();
    const audioBase64 = base64Encode(new Uint8Array(buffer));
    return json({ configured: true, audioBase64, mimeType: "audio/mpeg" });
  } catch (e) {
    console.error("TTS error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
