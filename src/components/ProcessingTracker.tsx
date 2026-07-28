import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  BookOpen,
  Lightbulb,
  Layers,
  Network,
  HelpCircle,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/lib/localStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type Snapshot = {
  status: string;
  error?: string | null;
  transcripts: number;
  summaries: number;
  concepts: number;
  clusters: number;
  flashcards: number;
  quizzes: number;
};

const EMPTY: Snapshot = {
  status: "extracting",
  transcripts: 0,
  summaries: 0,
  concepts: 0,
  clusters: 0,
  flashcards: 0,
  quizzes: 0,
};

type StageState = "pending" | "active" | "done" | "failed";

function stageState(done: boolean, active: boolean, failed: boolean): StageState {
  if (failed) return "failed";
  if (done) return "done";
  if (active) return "active";
  return "pending";
}

export function ProcessingTracker({
  lectureId,
  title,
  onCancel,
}: {
  lectureId: string;
  title: string;
  onCancel?: () => void;
}) {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const [lec, tr, sm, cp, fc, qz] = await Promise.all([
        supabase.from("lectures").select("status,error_message").eq("id", lectureId).maybeSingle(),
        supabase.from("transcripts").select("id", { count: "exact", head: true }).eq("lecture_id", lectureId),
        supabase.from("summaries").select("id", { count: "exact", head: true }).eq("lecture_id", lectureId),
        supabase.from("concepts").select("cluster", { count: "exact" }).eq("lecture_id", lectureId),
        supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("lecture_id", lectureId),
        supabase.from("quizzes").select("id", { count: "exact", head: true }).eq("lecture_id", lectureId),
      ]);
      if (cancelled) return;
      const clusters = new Set(
        ((cp.data ?? []) as { cluster: string | null }[]).map((r) => r.cluster).filter(Boolean) as string[],
      ).size;
      setSnap({
        status: lec.data?.status ?? "extracting",
        error: lec.data?.error_message ?? null,
        transcripts: tr.count ?? 0,
        summaries: sm.count ?? 0,
        concepts: cp.count ?? 0,
        clusters,
        flashcards: fc.count ?? 0,
        quizzes: qz.count ?? 0,
      });
    };

    poll();
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [lectureId]);

  const failed = snap.status === "error";
  const done = snap.status === "done";

  const stages: {
    key: string;
    label: string;
    icon: typeof FileText;
    state: StageState;
    detail: string;
  }[] = [
    {
      key: "transcript",
      label: "Transcript",
      icon: FileText,
      state: stageState(snap.transcripts > 0, ["extracting", "transcribing"].includes(snap.status), failed && snap.transcripts === 0),
      detail: snap.transcripts > 0 ? "Captured" : "Extracting audio & transcribing…",
    },
    {
      key: "summary",
      label: "Notes & summary",
      icon: BookOpen,
      state: stageState(snap.summaries > 0, snap.status === "summarizing" && snap.summaries === 0, failed && snap.summaries === 0 && snap.transcripts > 0),
      detail: snap.summaries > 0 ? "Quick + detailed notes ready" : "Writing structured notes…",
    },
    {
      key: "concepts",
      label: "Key concepts",
      icon: Lightbulb,
      state: stageState(snap.concepts > 0, snap.status === "summarizing" && snap.summaries > 0 && snap.concepts === 0, false),
      detail: snap.concepts > 0 ? `${snap.concepts} concepts extracted` : "Identifying key terms…",
    },
    {
      key: "flashcards",
      label: "Flashcards",
      icon: Layers,
      state: stageState(snap.flashcards > 0, snap.concepts > 0 && snap.flashcards === 0, false),
      detail: snap.flashcards > 0 ? `${snap.flashcards} cards generated` : "Generating spaced-repetition cards…",
    },
    {
      key: "mindmap",
      label: "Mind map",
      icon: Network,
      state: stageState(snap.clusters > 0 || (done && snap.concepts > 0), snap.concepts > 0 && snap.clusters === 0 && !done, false),
      detail: snap.clusters > 0 ? `${snap.clusters} clusters` : "Grouping related ideas…",
    },
    {
      key: "quiz",
      label: "Practice quiz",
      icon: HelpCircle,
      state: stageState(snap.quizzes > 0, snap.flashcards > 0 && snap.quizzes === 0, false),
      detail: snap.quizzes > 0 ? "Starter quiz ready" : "Building questions…",
    },
  ];

  const completed = stages.filter((s) => s.state === "done").length;
  const pct = failed ? Math.max(8, (completed / stages.length) * 100) : (completed / stages.length) * 100;

  return (
    <Card className="rounded-3xl border-border/50 p-6 shadow-card">
      <div className="mb-5 flex items-start gap-3">
        <motion.div
          animate={failed || done ? {} : { rotate: 360 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-playful ${
            failed ? "bg-destructive" : done ? "bg-success" : "bg-gradient-hero"
          }`}
        >
          {failed ? <AlertTriangle className="h-5 w-5" /> : done ? <CheckCircle2 className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-bold">
            {failed ? "Processing failed" : done ? "Your lecture is ready!" : "Building your study workspace…"}
          </div>
          <div className="line-clamp-1 text-sm text-muted-foreground">{title}</div>
        </div>
      </div>

      <Progress value={pct} className={`h-2 ${failed ? "[&>div]:bg-destructive" : ""}`} />
      <div className="mt-1 text-right text-xs text-muted-foreground">
        {completed} / {stages.length} {completed === stages.length ? "complete 🎉" : "complete"}
      </div>

      <ul className="mt-5 space-y-3">
        {stages.map(({ key, label, icon: Icon, state, detail }) => (
          <li
            key={key}
            className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
              state === "done"
                ? "border-success/30 bg-success/5"
                : state === "active"
                ? "border-primary/40 bg-primary-soft/40"
                : state === "failed"
                ? "border-destructive/40 bg-destructive/5"
                : "border-border/60 bg-muted/30"
            }`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                state === "done"
                  ? "bg-success text-success-foreground"
                  : state === "active"
                  ? "bg-primary text-primary-foreground"
                  : state === "failed"
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {state === "active" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : state === "done" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : state === "failed" ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{label}</div>
              <div className="line-clamp-1 text-xs text-muted-foreground">{detail}</div>
            </div>
          </li>
        ))}
      </ul>

      {failed && snap.error && (
        <div className="mt-5 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <div className="font-semibold text-destructive">Something went wrong</div>
          <div className="mt-1 text-muted-foreground">{snap.error}</div>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button
          onClick={() => navigate(`/lecture/${lectureId}`)}
          size="lg"
          className="h-12 flex-1 rounded-full text-base shadow-playful"
          disabled={!done && completed === 0 && !failed}
        >
          {done ? "Open lecture" : failed ? "View lecture" : "Open in viewer"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        {onCancel && (
          <Button variant="outline" size="lg" className="h-12 rounded-full" onClick={onCancel}>
            Start another
          </Button>
        )}
      </div>

      {!done && !failed && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          You can leave this page — processing continues in the background.
        </p>
      )}
    </Card>
  );
}

export default ProcessingTracker;
