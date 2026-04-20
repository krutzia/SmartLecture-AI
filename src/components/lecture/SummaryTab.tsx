import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Copy, Check, Volume2, Pause, Square, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";

type Summary = { quick: string | null; detailed: string | null; bullets: string[]; takeaways: string[] };

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

export const SummaryTab = ({ lectureId }: { lectureId: string }) => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [speechState, setSpeechState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [usingElevenLabs, setUsingElevenLabs] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("summaries").select("quick,detailed,bullets,takeaways").eq("lecture_id", lectureId).maybeSingle();
      setSummary(data as any);
      setLoading(false);
    };
    load();
  }, [lectureId]);

  // Stop all playback on unmount or lecture change
  useEffect(() => {
    return () => {
      if (ttsSupported) window.speechSynthesis.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, [lectureId, ttsSupported]);

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    toast({ title: "Copied!" });
    setTimeout(() => setCopied(null), 1500);
  };

  // Browser speechSynthesis fallback
  const playBrowserTTS = (text: string) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;
    const voices = synth.getVoices();
    const preferred =
      voices.find((v) => /en[-_]/i.test(v.lang) && /female|samantha|google/i.test(v.name)) ||
      voices.find((v) => /en[-_]/i.test(v.lang)) ||
      voices[0];
    if (preferred) utter.voice = preferred;
    utter.onend = () => setSpeechState("idle");
    utter.onerror = () => setSpeechState("idle");
    utteranceRef.current = utter;
    synth.speak(utter);
    setUsingElevenLabs(false);
    setSpeechState("playing");
  };

  const handleListen = async () => {
    if (!summary?.quick) return;

    // Pause/resume mid-playback
    if (speechState === "playing") {
      if (usingElevenLabs && audioRef.current) {
        audioRef.current.pause();
      } else if (ttsSupported) {
        window.speechSynthesis.pause();
      }
      setSpeechState("paused");
      return;
    }
    if (speechState === "paused") {
      if (usingElevenLabs && audioRef.current) {
        await audioRef.current.play();
      } else if (ttsSupported) {
        window.speechSynthesis.resume();
      }
      setSpeechState("playing");
      return;
    }

    const cleanText = stripMarkdown(summary.quick);
    if (!cleanText) return;

    // Try ElevenLabs first
    setSpeechState("loading");
    try {
      const { data, error } = await supabase.functions.invoke("tts-summary", {
        body: { text: cleanText },
      });

      if (error) throw error;

      if (data?.configured && data.audioBase64) {
        const audioUrl = `data:${data.mimeType ?? "audio/mpeg"};base64,${data.audioBase64}`;
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = audioUrl;
        const audio = new Audio(audioUrl);
        audio.onended = () => setSpeechState("idle");
        audio.onerror = () => {
          setSpeechState("idle");
          toast({ title: "Playback failed", variant: "destructive" });
        };
        audioRef.current = audio;
        await audio.play();
        setUsingElevenLabs(true);
        setSpeechState("playing");
        return;
      }
    } catch (e) {
      console.warn("ElevenLabs TTS unavailable, falling back to browser voice", e);
    }

    // Fallback: browser speechSynthesis
    if (ttsSupported) {
      playBrowserTTS(cleanText);
    } else {
      setSpeechState("idle");
      toast({ title: "Audio not supported in this browser", variant: "destructive" });
    }
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (ttsSupported) window.speechSynthesis.cancel();
    setSpeechState("idle");
  };

  if (loading) return <Skeleton className="h-96 rounded-3xl" />;
  if (!summary) return <Card className="rounded-3xl p-8 text-center text-muted-foreground">No summary yet.</Card>;

  const Section = ({ title, text, copyKey, children }: { title: string; text: string; copyKey: string; children?: React.ReactNode }) => (
    <Card className="rounded-3xl border-border/50 p-6 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-display text-xl font-extrabold">{title}</h3>
        <div className="flex items-center gap-1.5">
          {children}
          <Button variant="ghost" size="sm" onClick={() => copy(copyKey, text)} className="gap-1.5">
            {copied === copyKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            Copy
          </Button>
        </div>
      </div>
      <div className="prose prose-sm max-w-none prose-headings:font-display prose-headings:font-extrabold prose-p:text-foreground/90 prose-li:text-foreground/90 prose-strong:text-foreground">
        <ReactMarkdown>{text}</ReactMarkdown>
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      {summary.quick && (
        <Section title="✨ Quick summary" text={summary.quick} copyKey="quick">
          {ttsSupported && (
            <>
              <Button
                variant={speechState === "idle" ? "outline" : "default"}
                size="sm"
                onClick={handleListen}
                className="gap-1.5 rounded-full"
                aria-label={speechState === "playing" ? "Pause" : "Listen"}
              >
                {speechState === "playing" ? (
                  <><Pause className="h-3.5 w-3.5" /> Pause</>
                ) : speechState === "paused" ? (
                  <><Volume2 className="h-3.5 w-3.5" /> Resume</>
                ) : (
                  <><Volume2 className="h-3.5 w-3.5" /> Listen</>
                )}
              </Button>
              {speechState !== "idle" && (
                <Button variant="ghost" size="sm" onClick={handleStop} className="gap-1.5" aria-label="Stop">
                  <Square className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
        </Section>
      )}
      {summary.bullets?.length > 0 && (
        <Section title="💡 Bullet points" text={summary.bullets.map((b) => `- ${b}`).join("\n")} copyKey="bullets" />
      )}
      {summary.takeaways?.length > 0 && (
        <Card className="rounded-3xl border-highlight/30 bg-accent/40 p-6 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-xl font-extrabold">🎯 Key takeaways</h3>
            <Button variant="ghost" size="sm" onClick={() => copy("takeaways", summary.takeaways.map((t) => `• ${t}`).join("\n"))} className="gap-1.5">
              {copied === "takeaways" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Copy
            </Button>
          </div>
          <ul className="space-y-2">
            {summary.takeaways.map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-highlight" />
                <span className="font-medium text-foreground/90">{t}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {summary.detailed && <Section title="📝 Detailed notes" text={summary.detailed} copyKey="detailed" />}
    </div>
  );
};
