import { getDeviceId } from "@/lib/deviceId";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Check, X, RotateCw, Loader2, Trophy, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

type Quiz = { id: string; title: string; questions: Question[]; question_count: number; created_at: string };

export const QuizTab = ({ lectureId }: { lectureId: string }) => {
  const location = useLocation();
  const focusTopic: string | undefined = (location.state as any)?.focusTopic;
  const autoStartedRef = useRef<string | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<{ correct: boolean; topic: string }[]>([]);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("quizzes")
        .select("id,title,questions,question_count,created_at")
        .eq("lecture_id", lectureId)
        .order("created_at", { ascending: false });
      setQuizzes((data ?? []) as unknown as Quiz[]);
      setLoading(false);
    };
    load();
  }, [lectureId]);

  // Auto-start the most recent quiz matching the focusTopic from the Mind Map.
  // Guarded by autoStartedRef so we don't restart after the user navigates
  // back to the quiz list within the same session.
  useEffect(() => {
    if (!focusTopic || loading || quizzes.length === 0) return;
    const key = `${lectureId}::${focusTopic}`;
    if (autoStartedRef.current === key) return;

    const expectedTitle = `Focused: ${focusTopic}`;
    const focused = quizzes.find((q) => q.title === expectedTitle) ?? quizzes[0];
    if (focused) {
      autoStartedRef.current = key;
      startQuiz(focused);
      toast({ title: `Starting focused quiz`, description: focusTopic });
    }
  }, [focusTopic, loading, quizzes, lectureId]);

  const startQuiz = (quiz: Quiz) => {
    setActiveQuiz(quiz);
    setIdx(0);
    setSelected(null);
    setRevealed(false);
    setAnswers([]);
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-quiz", {
        body: { lectureId, userId: getDeviceId(), numQuestions: 8 },
      });
      if (error) throw error;
      const quiz: Quiz = {
        id: data.quizId,
        title: `Quiz · ${new Date().toLocaleDateString()}`,
        questions: data.questions,
        question_count: data.questions.length,
        created_at: new Date().toISOString(),
      };
      setQuizzes((prev) => [quiz, ...prev]);
      startQuiz(quiz);
      toast({ title: "Quiz ready! 🎉", description: `${quiz.question_count} questions generated.` });
    } catch (e: any) {
      toast({
        title: "Could not generate quiz",
        description: e?.message ?? "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const reveal = async () => {
    if (selected === null || !activeQuiz) return;
    const q = activeQuiz.questions[idx];
    const correct = selected === q.correct_index;
    setRevealed(true);
    setAnswers((prev) => [...prev, { correct, topic: q.topic }]);

    // Log to analytics
    const user = { id: getDeviceId() };
    if (user) {
      await Promise.all([
        supabase.from("quiz_attempts").insert({
          user_id: user.id,
          lecture_id: lectureId,
          topic: q.topic || "Quiz",
          correct,
        }),
        supabase.from("study_sessions").insert({
          user_id: user.id,
          lecture_id: lectureId,
          activity: "quiz",
          minutes: 0.5,
        }),
      ]);
    }
  };

  const next = () => {
    if (!activeQuiz) return;
    if (idx + 1 >= activeQuiz.questions.length) {
      // finished — stay on results
      setIdx(idx + 1);
      return;
    }
    setIdx(idx + 1);
    setSelected(null);
    setRevealed(false);
  };

  if (loading) return <Skeleton className="h-96 rounded-3xl" />;

  // Empty state
  if (!activeQuiz && quizzes.length === 0) {
    return (
      <Card className="rounded-3xl border-border/50 p-10 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-ai text-white shadow-playful">
          <Sparkles className="h-6 w-6" />
        </div>
        <h3 className="font-display text-2xl font-extrabold">Test yourself</h3>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          Generate a multiple-choice quiz from this lecture. Every answer is logged to your analytics.
        </p>
        <Button onClick={generate} disabled={generating} size="lg" className="mt-6 rounded-full shadow-playful">
          {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {generating ? "Generating..." : "Generate quiz"}
        </Button>
      </Card>
    );
  }

  // Quiz list
  if (!activeQuiz) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-xl font-extrabold">Your quizzes</h3>
          <Button onClick={generate} disabled={generating} className="rounded-full">
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            New quiz
          </Button>
        </div>
        <div className="grid gap-3">
          {quizzes.map((q) => (
            <Card
              key={q.id}
              className="flex cursor-pointer items-center justify-between rounded-3xl border-border/50 p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-playful"
              onClick={() => startQuiz(q)}
            >
              <div>
                <h4 className="font-display text-base font-bold">{q.title}</h4>
                <p className="text-sm text-muted-foreground">
                  {q.question_count} questions · {new Date(q.created_at).toLocaleDateString()}
                </p>
              </div>
              <Button size="sm" className="rounded-full">Start</Button>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Results screen
  if (idx >= activeQuiz.questions.length) {
    const correctCount = answers.filter((a) => a.correct).length;
    const pct = Math.round((correctCount / activeQuiz.questions.length) * 100);
    return (
      <Card className="rounded-3xl border-border/50 p-8 text-center shadow-playful">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-success text-white">
          <Trophy className="h-7 w-7" />
        </div>
        <h3 className="font-display text-3xl font-extrabold">{pct}%</h3>
        <p className="mt-1 text-muted-foreground">
          {correctCount} of {activeQuiz.questions.length} correct
        </p>
        <Progress value={pct} className="mx-auto mt-4 max-w-md" />
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={() => setActiveQuiz(null)} className="rounded-full">
            Back
          </Button>
          <Button onClick={() => startQuiz(activeQuiz)} className="rounded-full">
            <RotateCw className="mr-2 h-4 w-4" /> Retake
          </Button>
        </div>
      </Card>
    );
  }

  const q = activeQuiz.questions[idx];
  const progress = ((idx + (revealed ? 1 : 0)) / activeQuiz.questions.length) * 100;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between text-sm">
        <Button variant="ghost" size="sm" onClick={() => setActiveQuiz(null)}>
          ← All quizzes
        </Button>
        <span className="font-medium text-muted-foreground">
          Question {idx + 1} of {activeQuiz.questions.length}
        </span>
      </div>
      <Progress value={progress} />

      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
        >
          <Card className="rounded-3xl border-border/50 p-6 shadow-card">
            <span className="inline-block rounded-full bg-ai-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-ai">
              {q.topic}
            </span>
            <h3 className="mt-3 font-display text-xl font-extrabold">{q.question}</h3>

            <div className="mt-5 space-y-2.5">
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
                className="mt-5 rounded-2xl border border-ai/20 bg-ai-soft/60 p-4"
              >
                <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ai">
                  <Brain className="h-3.5 w-3.5" /> Explanation
                </div>
                <p className="text-sm text-foreground/90">{q.explanation}</p>
              </motion.div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              {!revealed ? (
                <Button onClick={reveal} disabled={selected === null} className="rounded-full">
                  Submit
                </Button>
              ) : (
                <Button onClick={next} className="rounded-full">
                  {idx + 1 >= activeQuiz.questions.length ? "See results" : "Next →"}
                </Button>
              )}
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
