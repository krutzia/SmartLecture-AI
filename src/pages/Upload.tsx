import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { motion } from "framer-motion";
import { Upload as UploadIcon, FileAudio, FileVideo, FileText, File as FileIcon, X, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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

const Upload = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

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
      // Create lecture row
      const { data: lecture, error: insErr } = await supabase
        .from("lectures")
        .insert({ user_id: user.id, title: file.name.replace(/\.[^.]+$/, ""), source_type: sourceType, file_path: path, status: "uploading" })
        .select().single();
      if (insErr || !lecture) throw insErr ?? new Error("Failed to create lecture");

      setProgress(20);

      // Upload to storage
      const { error: upErr } = await supabase.storage.from("lectures").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      setProgress(60);

      // Trigger processing
      toast({ title: "Upload complete!", description: "AI is now working its magic ✨" });
      const { error: fnErr } = await supabase.functions.invoke("process-lecture", { body: { lectureId: lecture.id } });
      if (fnErr) {
        // It may have started but timed out; navigate anyway and let user watch status
        console.warn("process-lecture invoke error:", fnErr);
      }
      setProgress(100);
      navigate(`/lecture/${lecture.id}`);
    } catch (e: any) {
      console.error(e);
      toast({ title: "Upload failed", description: e?.message ?? "Please try again", variant: "destructive" });
      setBusy(false);
      setProgress(0);
    }
  };

  const Icon = file ? fileIcon(detectSource(file)) : UploadIcon;

  return (
    <div className="container max-w-3xl py-8">
      <h1 className="font-display text-3xl font-extrabold md:text-4xl">Upload a lecture</h1>
      <p className="mt-1 text-muted-foreground">Drop in audio, video, PDF or text — up to 50MB.</p>

      <Card className="mt-8 rounded-3xl border-border/50 p-6 shadow-card">
        {!file ? (
          <div
            {...getRootProps()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
              isDragActive ? "border-primary bg-primary-soft" : "border-border hover:border-primary/50 hover:bg-muted/40"
            }`}
          >
            <input {...getInputProps()} />
            <motion.div whileHover={{ scale: 1.05 }} className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-hero shadow-playful">
              <UploadIcon className="h-9 w-9 text-white" />
            </motion.div>
            <h3 className="font-display text-xl font-bold">
              {isDragActive ? "Drop it!" : "Drop a file here"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">or click to browse</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs">
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
    </div>
  );
};

export default Upload;
