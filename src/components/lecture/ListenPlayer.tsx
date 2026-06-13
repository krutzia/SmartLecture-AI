import { useEffect, useRef, useState } from "react";
import {
  Volume2, Pause, Play, Loader2, Sparkles, Download,
  SkipBack, SkipForward,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/hooks/use-toast";

type Mode = "compact" | "full";

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

// Strip markdown so TTS sounds clean
const stripMarkdown = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

const base64ToBlob = (b64: string, mime: string) => {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

interface Props {
  text: string;
  /** filename (without extension) used when downloading the MP3 */
  downloadName?: string;
  /** "compact" = just a Listen button (Quick summary). "full" = full player UI (Detailed). */
  mode?: Mode;
  /** Caching key — when both are present, generated audio is reused server-side. */
  lectureId?: string;
  section?: string;
}

export const ListenPlayer = ({ text, downloadName = "summary", mode = "compact", lectureId, section }: Props) => {

  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [usingElevenLabs, setUsingElevenLabs] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  // Cleanup on unmount / text change
  useEffect(() => {
    return () => {
      if (ttsSupported) window.speechSynthesis.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const playBrowserTTS = (clean: string) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.rate = 1;
    const voices = synth.getVoices();
    const preferred =
      voices.find((v) => /en[-_]/i.test(v.lang) && /female|samantha|google/i.test(v.name)) ||
      voices.find((v) => /en[-_]/i.test(v.lang)) ||
      voices[0];
    if (preferred) utter.voice = preferred;
    utter.onend = () => setState("idle");
    utter.onerror = () => setState("idle");
    utterRef.current = utter;
    synth.speak(utter);
    setUsingElevenLabs(false);
    setState("playing");
  };

  const wireAudio = (audio: HTMLAudioElement) => {
    audio.addEventListener("loadedmetadata", () => setDuration(audio.duration || 0));
    audio.addEventListener("timeupdate", () => {
      if (!scrubbing) setCurrent(audio.currentTime);
    });
    audio.addEventListener("ended", () => {
      setState("idle");
      setCurrent(0);
    });
    audio.addEventListener("error", () => {
      setState("idle");
      toast({ title: "Playback failed", variant: "destructive" });
    });
  };

  const start = async () => {
    if (state === "playing") {
      if (usingElevenLabs && audioRef.current) audioRef.current.pause();
      else if (ttsSupported) window.speechSynthesis.pause();
      setState("paused");
      return;
    }
    if (state === "paused") {
      if (usingElevenLabs && audioRef.current) await audioRef.current.play();
      else if (ttsSupported) window.speechSynthesis.resume();
      setState("playing");
      return;
    }

    const clean = stripMarkdown(text);
    if (!clean) return;

    setState("loading");
    try {
      const { data, error } = await supabase.functions.invoke("tts-summary", {
        body: { text: clean },
      });
      if (error) throw error;

      if (data?.configured && data.audioBase64) {
        const mime = data.mimeType ?? "audio/mpeg";
        const blob = base64ToBlob(data.audioBase64, mime);
        const url = URL.createObjectURL(blob);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(url);
        const audio = new Audio(url);
        wireAudio(audio);
        audioRef.current = audio;
        await audio.play();
        setUsingElevenLabs(true);
        setState("playing");
        return;
      }
    } catch (e) {
      console.warn("ElevenLabs TTS unavailable, falling back", e);
    }

    if (ttsSupported) playBrowserTTS(clean);
    else {
      setState("idle");
      toast({ title: "Audio not supported in this browser", variant: "destructive" });
    }
  };

  const skip = (delta: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min((a.duration || 0), a.currentTime + delta));
    setCurrent(a.currentTime);
  };

  const onSeek = (vals: number[]) => {
    setCurrent(vals[0]);
  };
  const onSeekCommit = (vals: number[]) => {
    const a = audioRef.current;
    if (a) a.currentTime = vals[0];
    setScrubbing(false);
  };

  const download = () => {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = `${downloadName}.mp3`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const PlayBtn = (
    <Button
      variant={state === "idle" ? "outline" : "default"}
      size="sm"
      onClick={start}
      disabled={state === "loading"}
      className="gap-1.5 rounded-full"
      aria-label={state === "playing" ? "Pause" : "Listen"}
    >
      {state === "loading" ? (
        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading</>
      ) : state === "playing" ? (
        <><Pause className="h-3.5 w-3.5" /> Pause</>
      ) : state === "paused" ? (
        <><Play className="h-3.5 w-3.5" /> Resume</>
      ) : (
        <>
          <Volume2 className="h-3.5 w-3.5" /> Listen
          {usingElevenLabs && <Sparkles className="h-3 w-3 text-ai" />}
        </>
      )}
    </Button>
  );

  if (mode === "compact") return PlayBtn;

  // Full player: shown under the Detailed notes section
  const elevenLabsActive = usingElevenLabs && audioRef.current;

  return (
    <div className="mt-4 rounded-2xl border border-border/50 bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {PlayBtn}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => skip(-10)}
          disabled={!elevenLabsActive}
          className="gap-1.5 rounded-full"
          aria-label="Skip back 10 seconds"
        >
          <SkipBack className="h-3.5 w-3.5" /> 10s
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => skip(10)}
          disabled={!elevenLabsActive}
          className="gap-1.5 rounded-full"
          aria-label="Skip forward 10 seconds"
        >
          10s <SkipForward className="h-3.5 w-3.5" />
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {usingElevenLabs && (
            <span className="hidden items-center gap-1 text-xs text-ai sm:inline-flex">
              <Sparkles className="h-3 w-3" /> ElevenLabs
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={download}
            disabled={!audioUrl}
            className="gap-1.5 rounded-full"
            aria-label="Download audio as MP3"
          >
            <Download className="h-3.5 w-3.5" /> MP3
          </Button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
          {fmt(current)}
        </span>
        <Slider
          value={[Math.min(current, duration || 0)]}
          max={Math.max(duration, 0.001)}
          step={0.1}
          onValueChange={(v) => { setScrubbing(true); onSeek(v); }}
          onValueCommit={onSeekCommit}
          disabled={!elevenLabsActive || !duration}
          className="flex-1"
          aria-label="Audio progress"
        />
        <span className="w-10 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {fmt(duration)}
        </span>
      </div>

      {!elevenLabsActive && state !== "idle" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Browser voice playback — scrubbing & download require ElevenLabs.
        </p>
      )}
    </div>
  );
};
