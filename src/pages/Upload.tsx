import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload as UploadIcon,
  FileAudio,
  FileVideo,
  FileText,
  File as FileIcon,
  X,
  Loader2,
  Link2,
  Globe,
  Sparkles,
  CheckCircle2,
  PlayCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPT = {
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/x-wav": [".wav"],
  "video/mp4": [".mp4"],
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
};

function detectSource(file: File): "audio" | "video" | "pdf" | "text" {
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  if (file.type === "application/pdf") return "pdf";
  return "text";
}

function fileIcon(type: string) {
  if (type === "audio") return FileAudio;
  if (type === "video") return FileVideo;
  if (type === "pdf") return FileText;
  return FileIcon;
}

// ---------- YouTube helpers ----------
function getYouTubeId(url: string): string | null {
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

function detectLinkKind(url: string): "youtube" | "zoom" | "cloud" | "invalid" {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) return "youtube";
    if (u.hostname.includes("zoom.us")) return "zoom";
    if (/\.(mp4|mp3|wav|m4a|webm)(\?|$)/i.test(u.pathname)) return "cloud";
    return "cloud";
  } catch {
    return "invalid";
  }
}

const MOCK_TITLES = [
  "MIT 6.006 Introduction to Algorithms — Lecture 1",
  "Stanford CS229: Machine Learning — Linear Regression",
  "Harvard CS50 — Memory & Pointers",
  "3Blue1Brown — Essence of Calculus, Chapter 1",
];

const LINK_STEPS = [
  "Connecting to server...",
  "Extracting audio stream...",
  "Running AI Transcription...",
  "Structuring Workspace...",
];

const Upload = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  // ---------- Link state ----------
  const [url, setUrl] = useState("");
  const [validating, setValidating] = useState(false);
  const [preview, setPreview] = useState<{
    kind: "youtube" | "zoom" | "cloud";
    title: string;
    duration: string;
    thumb?: string;
    url: string;
  } | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkStep, setLinkStep] = useState(0);

  const onDrop = useCallback((accepted: File[], rejected: any[]) => {
    if (rejected.length) {
      toast({ title: "Can't use that file", description: rejected[0].errors?.[0]?.message ?? "Unsupported", variant: "destructive" });
      return;
    }
    const f = accepted[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast({ title: "Too big!", description: "Max file size is 50MB.", variant: "destructive" });
      return;
    }
    setFile(f);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: ACCEPT, maxFiles: 1, maxSize: MAX_BYTES, disabled: busy,
  });

  const start = async () => {
    if (!file || !user) return;
    setBusy(true);
    setProgress(5);

    const sourceType = detectSource(file);
    const ext = file.name.split(".").pop() || "bin";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    try {
      const { data: lecture, error: insErr } = await supabase
        .from("lectures")
        .insert({ user_id: user.id, title: file.name.replace(/\.[^.]+$/, ""), source_type: sourceType, file_path: path, status: "uploading" })
        .select().single();
      if (insErr || !lecture) throw insErr ?? new Error("Failed to create lecture");

      setProgress(20);

      const { error: upErr } = await supabase.storage.from("lectures").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      setProgress(60);

      toast({ title: "Upload complete!", description: "AI is now working its magic ✨" });
      const { error: fnErr } = await supabase.functions.invoke("process-lecture", { body: { lectureId: lecture.id, userId: user.id } });
      if (fnErr) console.warn("process-lecture invoke error:", fnErr);
      setProgress(100);
      navigate(`/lecture/${lecture.id}`);
    } catch (e: any) {
      console.error(e);
      toast({ title: "Upload failed", description: e?.message ?? "Please try again", variant: "destructive" });
      setBusy(false);
      setProgress(0);
    }
  };

  // ---------- Link handlers ----------
  const fetchLink = async () => {
    const kind = detectLinkKind(url);
    if (kind === "invalid") {
      toast({ title: "Invalid URL", description: "Please paste a valid http(s) link.", variant: "destructive" });
      return;
    }
    setValidating(true);
    setPreview(null);
    await new Promise((r) => setTimeout(r, 900));

    if (kind === "youtube") {
      const id = getYouTubeId(url);
      setPreview({
        kind,
        title: MOCK_TITLES[Math.floor(Math.random() * MOCK_TITLES.length)],
        duration: `${40 + Math.floor(Math.random() * 30)}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`,
        thumb: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined,
        url,
      });
    } else if (kind === "zoom") {
      setPreview({ kind, title: "Zoom Recording — Weekly Lecture", duration: "01:12:34", url });
    } else {
      setPreview({ kind, title: "Cloud Video Lecture", duration: "00:48:10", url });
    }
    setValidating(false);
  };

  // Step animation for link processing
  useEffect(() => {
    if (!linkBusy) return;
    if (linkStep >= LINK_STEPS.length) return;
    const t = setTimeout(() => setLinkStep((s) => s + 1), 1200);
    return () => clearTimeout(t);
  }, [linkBusy, linkStep]);

  const processLink = async () => {
    if (!preview || !user) return;
    setLinkBusy(true);
    setLinkStep(0);

    // Insert mock lecture row in parallel with animation
    const insertPromise = supabase
      .from("lectures")
      .insert({
        user_id: user.id,
        title: preview.title,
        source_type: "video",
        file_path: `weblink::${preview.url}`,
        status: "done",
      })
      .select()
      .single();

    // Let animation play (4 steps × 1.2s + buffer)
    await new Promise((r) => setTimeout(r, LINK_STEPS.length * 1200 + 400));

    const { data, error } = await insertPromise;
    if (error || !data) {
      toast({ title: "Couldn't import link", description: error?.message ?? "Try again", variant: "destructive" });
      setLinkBusy(false);
      setLinkStep(0);
      return;
    }
    toast({ title: "Lecture imported!", description: "Added to your library ✨" });
    navigate("/library");
  };

  const Icon = file ? fileIcon(detectSource(file)) : UploadIcon;

  return (
    <div className="container max-w-5xl py-8">
      <h1 className="font-display text-3xl font-extrabold md:text-4xl">Add a lecture</h1>
      <p className="mt-1 text-muted-foreground">Upload a file or import directly from a link.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* ============ OPTION 1: FILE UPLOAD ============ */}
        <Card className="rounded-3xl border-border/50 p-6 shadow-card">
          <div className="mb-4 flex items-center gap-2">
            <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-primary">Option 1</span>
            <h2 className="font-display text-lg font-bold">Upload local file</h2>
          </div>

          {!file ? (
            <div
              {...getRootProps()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
                isDragActive ? "border-primary bg-primary-soft" : "border-border hover:border-primary/50 hover:bg-muted/40"
              }`}
            >
              <input {...getInputProps()} />
              <motion.div whileHover={{ scale: 1.05 }} className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-hero shadow-playful">
                <UploadIcon className="h-7 w-7 text-white" />
              </motion.div>
              <h3 className="font-display text-lg font-bold">
                {isDragActive ? "Drop it!" : "Drop a file here"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">or click to browse · max 50MB</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs">
                {["MP3", "WAV", "MP4", "PDF", "TXT"].map((t) => (
                  <span key={t} className="rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground">{t}</span>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-4 rounded-2xl bg-muted/40 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="truncate font-medium">{file.name}</div>
                  <div className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
                {!busy && (
                  <Button variant="ghost" size="icon" onClick={() => setFile(null)} aria-label="Remove">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {busy && (
                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      {progress < 60 ? "Uploading..." : progress < 100 ? "Starting AI..." : "All set!"}
                    </span>
                    <span className="text-muted-foreground">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}

              {!busy && (
                <Button onClick={start} size="lg" className="mt-6 h-12 w-full rounded-full text-base shadow-playful">
                  <UploadIcon className="mr-2 h-4 w-4" />
                  Upload & process
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* ============ OPTION 2: WEB LINK ============ */}
        <Card className="relative overflow-hidden rounded-3xl border-border/50 p-6 shadow-card">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-hero opacity-10 blur-2xl" />

          <div className="mb-4 flex items-center gap-2">
            <span className="rounded-full bg-ai-soft px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-ai">Option 2</span>
            <h2 className="font-display text-lg font-bold">Import from web link</h2>
          </div>

          {!linkBusy ? (
            <>
              <div className="relative">
                <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Globe className="h-4 w-4" />
                </div>
                <Input
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setPreview(null); }}
                  placeholder="Paste YouTube, Zoom, or cloud video URL here..."
                  className="h-14 rounded-2xl border-border/60 bg-muted/30 pl-11 pr-4 text-sm shadow-inner focus-visible:bg-card"
                  onKeyDown={(e) => { if (e.key === "Enter" && url) fetchLink(); }}
                  disabled={validating}
                />
              </div>

              <Button
                onClick={fetchLink}
                disabled={!url || validating}
                size="lg"
                className="mt-3 h-12 w-full rounded-full bg-gradient-hero text-base text-white shadow-playful hover:opacity-90"
              >
                {validating ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Validating link…</>
                ) : (
                  <><Sparkles className="mr-2 h-4 w-4" /> Fetch Lecture</>
                )}
              </Button>

              {/* Validation animation */}
              <AnimatePresence>
                {validating && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-4 flex items-center gap-2 rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground"
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-hero text-white"
                    >
                      <Link2 className="h-3 w-3" />
                    </motion.div>
                    <span>Pinging URL, checking source, parsing metadata…</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Preview card */}
              <AnimatePresence>
                {preview && !validating && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-5"
                  >
                    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-card">
                      <div className="relative flex aspect-video w-full items-center justify-center bg-muted">
                        {preview.thumb ? (
                          <img src={preview.thumb} alt={preview.title} className="h-full w-full object-cover" />
                        ) : (
                          <Globe className="h-10 w-10 text-muted-foreground" />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <PlayCircle className="h-14 w-14 text-white drop-shadow-lg" />
                        </div>
                        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
                          {preview.duration}
                        </span>
                        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-ai/90 px-2 py-0.5 text-[10px] font-bold uppercase text-white shadow">
                          <Link2 className="h-2.5 w-2.5" /> {preview.kind}
                        </span>
                      </div>
                      <div className="p-3">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                          <p className="line-clamp-2 text-sm font-semibold">{preview.title}</p>
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={processLink}
                      size="lg"
                      className="mt-4 h-12 w-full rounded-full text-base shadow-playful"
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      Process this lecture
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            // ---------- Custom web-processing loader ----------
            <div className="py-2">
              <div className="mb-5 flex items-center gap-3">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-hero text-white shadow-playful"
                >
                  <Globe className="h-5 w-5" />
                </motion.div>
                <div>
                  <div className="font-display text-base font-bold">Importing from the web</div>
                  <div className="text-xs text-muted-foreground line-clamp-1">{preview?.title}</div>
                </div>
              </div>

              <Progress value={(Math.min(linkStep + 1, LINK_STEPS.length) / LINK_STEPS.length) * 100} className="h-2" />

              <ul className="mt-5 space-y-3">
                {LINK_STEPS.map((label, i) => {
                  const done = i < linkStep;
                  const active = i === linkStep;
                  return (
                    <li key={label} className="flex items-center gap-3 text-sm">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                          done
                            ? "border-success bg-success text-success-foreground"
                            : active
                            ? "border-primary bg-primary-soft text-primary"
                            : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {done ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : active ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <span className="text-[10px] font-bold">{i + 1}</span>
                        )}
                      </span>
                      <span className={done ? "text-muted-foreground line-through" : active ? "font-semibold" : "text-muted-foreground"}>
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Upload;
