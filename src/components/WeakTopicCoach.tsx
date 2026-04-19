import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import {
  GraduationCap,
  Sparkles,
  Loader2,
  Check,
  X,
  Brain,
  Trophy,
  ArrowRight,
  RotateCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Question = {
  question: string;
  topic: string;
  options: string[];
  correct_index: number;
  explanation: string;
};

type Coaching = {
  topic: string;
  accuracy: number;
  attempts: number;
  lecture: { id: string; title: string };
  headline: string;
  lesson: string;
  key_points: string[];
  questions: Question[];
};

export const WeakTopicCoach = () => {
  const [coaching, setCoaching] = useState<Coaching | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<"idle" | "lesson" | "quiz" | "results">("idle");
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<boolean[]>([]);

  const start = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("weak-topic-coach", { body: {} });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setCoaching(data as Coaching);
      setStage("lesson");
      setIdx(0);
      setSelected(null);
      setRevealed(false);
      setAnswers([]);
    } catch (e: any) {
      toast({
        title: "Coach unavailable",
        description: e?.message ?? "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const reveal = async () => {
    if (selected === null || !coaching) return;
    const q = coaching.questions[idx];
    const correct = selected === q.correct_index;
    setRevealed(true);
    setAnswers((prev) => [...prev, correct]);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await Promise.all([
        supabase.from("quiz_attempts").insert({
          user_id: user.id,
          lecture_id: coaching.lecture.id,
          topic: coaching.topic,
          correct,
        }),
        supabase.from("study_sessions").insert({
          user_id: user.id,
          lecture_id: coaching.lecture.id,
          activity: "coach",
          minutes: 0.5,
        }),
      ]);
    }
  };

  const next = () => {
    if (!coaching) return;
    if (idx + 1 >= coaching.questions.length) {
      setStage("results");
      return;
    }
    setIdx(idx + 1);
    setSelected(null);
    setRevealed(false);
  };

  // Idle state
  if (stage === "idle") {
    return (
      <Card className="rounded-3xl border-ai/20 bg-gradient-cream p-6 shadow-card">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-ai text-white shadow-playful">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg font-extrabold flex items-center gap-2">
              Weak topic coach <Sparkles className="h-4 w-4 text-highlight" />
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Let AI find your weakest topic and build a tailored mini-lesson + 5-question quiz.
            </p>
            <Button onClick={start} disabled={loading} className="mt-4 rounded-full shadow-playful">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {loading ? "Building lesson..." : "Coach me"}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (!coaching) return null;

  // Lesson stage
  if (stage === "lesson") {
    return (
      <Card className="rounded-3xl border-ai/30 bg-card p-6 shadow-playful">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-ai text-white shadow-playful">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-ai">Focus topic</p>
              <h3 className="font-display text-xl font-extrabold">{coaching.topic}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {Math.round(coaching.accuracy * 100)}% accuracy · {coaching.attempts} attempts · from{" "}
                <Link to={`/lecture/${coaching.lecture.id}`} className="font-medium text-primary hover:underline">
                  {coaching.lecture.title}
                </Link>
              </p>
            </div>
          </div>
          <Button onClick={start} disabled={loading} variant="ghost" size="sm" className="rounded-full">
            <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Pick another
          </Button>
        </div>

        <div className="mt-5 rounded-2xl border border-ai/15 bg-ai-soft/40 p-5">
          <p className="font-display text-base font-extrabold text-ai">{coaching.headline}</p>
          <div className="prose prose-sm mt-3 max-w-none text-foreground/90 prose-headings:font-display prose-headings:font-extrabold prose-strong:text-foreground">
            <ReactMarkdown>{coaching.lesson}</ReactMarkdown>
          </div>
        </div>

        {coaching.key_points.length > 0 && (
          <div className="mt-4 rounded-2xl border border-primary/15 bg-primary-soft/40 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">Remember</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {coaching.key_points.map((p, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button onClick={() => setStage("quiz")} className="mt-5 w-full rounded-full bg-gradient-hero text-white shadow-playful hover:opacity-90">
          Start the 5-question check <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </Card>
    );
  }

  // Results stage
  if (stage === "results") {
    const correctCount = answers.filter(Boolean).length;
    const pct = Math.round((correctCount / coaching.questions.length) * 100);
    const improved = pct > Math.round(coaching.accuracy * 100);
    return (
      <Card className="rounded-3xl border-success/30 bg-success-soft/40 p-8 text-center shadow-playful">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-success text-white shadow-playful">
          <Trophy className="h-6 w-6" />
        </div>
        <h3 className="font-display text-3xl font-extrabold">{pct}%</h3>
        <p className="mt-1 text-muted-foreground">
          {correctCount} of {coaching.questions.length} correct on <strong>{coaching.topic}</strong>
        </p>
        {improved && (
          <p className="mt-2 text-sm font-bold text-success">
            ↑ up from {Math.round(coaching.accuracy * 100)}% — nice gain!
          </p>
        )}
        <Progress value={pct} className="mx-auto mt-4 max-w-md" />
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => setStage("idle")} className="rounded-full">
            Done
          </Button>
          <Button onClick={start} disabled={loading} className="rounded-full">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Coach me again
          </Button>
        </div>
      </Card>
    );
  }

  // Quiz stage
  const q = coaching.questions[idx];
  const progress = ((idx + (revealed ? 1 : 0)) / coaching.questions.length) * 100;

  return (
    <Card className="rounded-3xl border-border/50 p-6 shadow-card">
      <div className="flex items-center justify-between text-sm">
        <Button variant="ghost" size="sm" onClick={() => setStage("lesson")} className="rounded-full">
          ← Back to lesson
        </Button>
        <span className="font-medium text-muted-foreground">
          {idx + 1} of {coaching.questions.length}
        </span>
      </div>
      <Progress value={progress} className="mt-3" />

      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
          className="mt-4"
        >
          <span className="inline-block rounded-full bg-ai-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-ai">
            {coaching.topic}
          </span>
          <h3 className="mt-3 font-display text-lg font-extrabold">{q.question}</h3>
          <div className="mt-4 space-y-2.5">
            {q.options.map((opt, i) => {
              const isSelected = selected === i;
              const isCorrect = i === q.correct_index;
              let cls = "border-border/60 bg-card hover:border-primary/40 hover:bg-primary-soft/30";
              if (revealed) {
                if (isCorrect) cls = "border-success bg-success-soft text-success-foreground";
                else if (isSelected) cls = "border-destructive bg-destructive/10";
                else cls = "border-border/40 bg-muted/40 opacity-70";
              } else if (isSelected) {
                cls = "border-primary bg-primary-soft";
              }
              return (
                <button
                  key={i}
                  onClick={() => !revealed && setSelected(i)}
                  disabled={revealed}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left text-sm font-medium transition-all",
                    cls,
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background/80 text-xs font-bold">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="text-foreground">{opt}</span>
                  </span>
                  {revealed && isCorrect && <Check className="h-4 w-4 text-success" />}
                  {revealed && isSelected && !isCorrect && <X className="h-4 w-4 text-destructive" />}
                </button>
              );
            })}
          </div>

          {revealed && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-2xl border border-ai/20 bg-ai-soft/60 p-4"
            >
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ai">
                <Brain className="h-3.5 w-3.5" /> Explanation
              </div>
              <p className="text-sm text-foreground/90">{q.explanation}</p>
            </motion.div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            {!revealed ? (
              <Button onClick={reveal} disabled={selected === null} className="rounded-full">
                Submit
              </Button>
            ) : (
              <Button onClick={next} className="rounded-full">
                {idx + 1 >= coaching.questions.length ? "See results" : "Next →"}
              </Button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </Card>
  );
};
