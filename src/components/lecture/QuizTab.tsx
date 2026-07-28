import { getDeviceId } from "@/lib/deviceId";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Check, X, RotateCw, Loader2, Trophy, Brain, Code2 } from "lucide-react";
import { supabase } from "@/lib/localStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Question =
  | { type: "mcq"; question: string; topic: string; options: string[]; correct_index: number; explanation: string }
  | { type: "tf"; question: string; topic: string; answer: boolean; explanation: string }
  | { type: "fib"; question: string; topic: string; answer: string; explanation: string }
  | { type: "coding"; question: string; topic: string; language: string; starter_code?: string; answer: string; expected_output?: string; explanation: string };

type Quiz = { id: string; title: string; questions: Question[]; question_count: number; created_at: string };

const normalize = (s: string) => s.toLowerCase().trim().replace(/[.,;:!?"'`]/g, "").replace(/\s+/g, " ");

const TYPE_LABEL: Record<string, string> = {
  mcq: "Multiple choice",
  tf: "True / False",
  fib: "Fill in the blank",
  coding: "Coding",
};

export const QuizTab = ({ lectureId }: { lectureId: string }) => {
  const location = useLocation();
  const focusTopic: string | undefined = (location.state as any)?.focusTopic;
  const autoStartedRef = useRef<string | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<{ correct: boolean; topic: string }[]>([]);
  const [revealed, setRevealed] = useState(false);

  // Per-question response state
  const [mcqSelected, setMcqSelected] = useState<number | null>(null);
  const [tfSelected, setTfSelected] = useState<boolean | null>(null);
  const [fibInput, setFibInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [codeSelfGrade, setCodeSelfGrade] = useState<boolean | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("quizzes")
        .select("id,title,questions,question_count,created_at")
        .eq("lecture_id", lectureId)
        .order("created_at", { ascending: false });
      // Normalize legacy quizzes that don't have `type` → default to mcq
      const normalized = ((data ?? []) as any[]).map((q) => ({
        ...q,
        questions: (q.questions ?? []).map((qq: any) => ({ type: qq.type ?? "mcq", ...qq })),
      })) as Quiz[];
      setQuizzes(normalized);
      setLoading(false);
    };
    load();
  }, [lectureId]);

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

  const resetResponse = () => {
    setMcqSelected(null);
    setTfSelected(null);
    setFibInput("");
    setCodeInput("");
    setCodeSelfGrade(null);
  };

  const startQuiz = (quiz: Quiz) => {
    setActiveQuiz(quiz);
    setIdx(0);
    setRevealed(false);
    setAnswers([]);
    resetResponse();
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
      toast({ title: "Could not generate quiz", description: e?.message ?? "Try again in a moment.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const evaluate = (q: Question): boolean | null => {
    if (q.type === "mcq") return mcqSelected === null ? null : mcqSelected === q.correct_index;
    if (q.type === "tf") return tfSelected === null ? null : tfSelected === q.answer;
    if (q.type === "fib") return fibInput.trim() === "" ? null : normalize(fibInput) === normalize(q.answer);
    if (q.type === "coding") return codeSelfGrade; // self-graded after reveal
    return null;
  };

  const submit = async () => {
    if (!activeQuiz) return;
    const q = activeQuiz.questions[idx];

    if (q.type === "coding") {
      // For coding, "Submit" just reveals the reference solution; user grades themselves next.
      setRevealed(true);
      return;
    }

    const correct = evaluate(q);
    if (correct === null) return;
    setRevealed(true);
    setAnswers((prev) => [...prev, { correct, topic: q.topic }]);

    const userId = getDeviceId();
    await Promise.all([
      supabase.from("quiz_attempts").insert({ user_id: userId, lecture_id: lectureId, topic: q.topic || "Quiz", correct }),
      supabase.from("study_sessions").insert({ user_id: userId, lecture_id: lectureId, activity: "quiz", minutes: 0.5 }),
    ]);
  };

  const gradeCoding = async (correct: boolean) => {
    if (!activeQuiz) return;
    const q = activeQuiz.questions[idx];
    setCodeSelfGrade(correct);
    setAnswers((prev) => [...prev, { correct, topic: q.topic }]);
    const userId = getDeviceId();
    await Promise.all([
      supabase.from("quiz_attempts").insert({ user_id: userId, lecture_id: lectureId, topic: q.topic || "Quiz", correct }),
      supabase.from("study_sessions").insert({ user_id: userId, lecture_id: lectureId, activity: "quiz", minutes: 0.5 }),
    ]);
  };

  const next = () => {
    if (!activeQuiz) return;
    setIdx(idx + 1);
    setRevealed(false);
    resetResponse();
  };

  if (loading) return <Skeleton className="h-96 rounded-3xl" />;

  if (!activeQuiz && quizzes.length === 0) {
    return (
      <Card className="rounded-3xl border-border/50 p-10 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-ai text-white shadow-playful">
          <Sparkles className="h-6 w-6" />
        </div>
        <h3 className="font-display text-2xl font-extrabold">Test yourself</h3>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          Generate a mixed quiz (MCQ, True/False, fill-in-the-blank, plus coding for CS lectures). Every answer is logged to your analytics.
        </p>
        <Button onClick={generate} disabled={generating} size="lg" className="mt-6 rounded-full shadow-playful">
          {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {generating ? "Generating..." : "Generate quiz"}
        </Button>
      </Card>
    );
  }

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

  if (idx >= activeQuiz.questions.length) {
    const correctCount = answers.filter((a) => a.correct).length;
    const pct = Math.round((correctCount / Math.max(activeQuiz.questions.length, 1)) * 100);
    // Topic breakdown
    const topicMap: Record<string, { c: number; t: number }> = {};
    answers.forEach((a) => {
      const k = a.topic || "Quiz";
      topicMap[k] ??= { c: 0, t: 0 };
      topicMap[k].t += 1;
      if (a.correct) topicMap[k].c += 1;
    });

    return (
      <Card className="rounded-3xl border-border/50 p-8 text-center shadow-playful">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-success text-white">
          <Trophy className="h-7 w-7" />
        </div>
        <h3 className="font-display text-3xl font-extrabold">{pct}%</h3>
        <p className="mt-1 text-muted-foreground">{correctCount} of {activeQuiz.questions.length} correct</p>
        <Progress value={pct} className="mx-auto mt-4 max-w-md" />
        {Object.keys(topicMap).length > 0 && (
          <div className="mx-auto mt-6 max-w-md space-y-1 text-left text-sm">
            <div className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">By topic</div>
            {Object.entries(topicMap).map(([t, v]) => (
              <div key={t} className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-1.5">
                <span className="font-medium">{t}</span>
                <span className="text-muted-foreground">{v.c}/{v.t}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={() => setActiveQuiz(null)} className="rounded-full">Back</Button>
          <Button onClick={() => startQuiz(activeQuiz)} className="rounded-full">
            <RotateCw className="mr-2 h-4 w-4" /> Retake
          </Button>
        </div>
      </Card>
    );
  }

  const q = activeQuiz.questions[idx];
  const progress = ((idx + (revealed ? 1 : 0)) / activeQuiz.questions.length) * 100;
  const canSubmit = (() => {
    if (q.type === "mcq") return mcqSelected !== null;
    if (q.type === "tf") return tfSelected !== null;
    if (q.type === "fib") return fibInput.trim().length > 0;
    if (q.type === "coding") return true;
    return false;
  })();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between text-sm">
        <Button variant="ghost" size="sm" onClick={() => setActiveQuiz(null)}>← All quizzes</Button>
        <span className="font-medium text-muted-foreground">Question {idx + 1} of {activeQuiz.questions.length}</span>
      </div>
      <Progress value={progress} />

      <AnimatePresence mode="wait">
        <motion.div key={idx} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
          <Card className="rounded-3xl border-border/50 p-6 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-block rounded-full bg-ai-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-ai">{q.topic}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-bold uppercase tracking-wide text-secondary-foreground">
                {q.type === "coding" && <Code2 className="h-3 w-3" />}
                {TYPE_LABEL[q.type] ?? q.type}
              </span>
            </div>
            <h3 className="mt-3 whitespace-pre-wrap font-display text-xl font-extrabold">{q.question}</h3>

            {/* MCQ */}
            {q.type === "mcq" && (
              <div className="mt-5 space-y-2.5">
                {q.options.map((opt, i) => {
                  const isSelected = mcqSelected === i;
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
                      onClick={() => !revealed && setMcqSelected(i)}
                      disabled={revealed}
                      className={cn("flex w-full items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left text-sm font-medium transition-all", cls)}
                    >
                      <span className="flex items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background/80 text-xs font-bold">{String.fromCharCode(65 + i)}</span>
                        <span className="text-foreground">{opt}</span>
                      </span>
                      {revealed && isCorrect && <Check className="h-4 w-4 text-success" />}
                      {revealed && isSelected && !isCorrect && <X className="h-4 w-4 text-destructive" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* True / False */}
            {q.type === "tf" && (
              <div className="mt-5 grid grid-cols-2 gap-3">
                {[true, false].map((v) => {
                  const isSelected = tfSelected === v;
                  const isCorrect = v === q.answer;
                  let cls = "border-border/60 bg-card hover:border-primary/40 hover:bg-primary-soft/30";
                  if (revealed) {
                    if (isCorrect) cls = "border-success bg-success-soft";
                    else if (isSelected) cls = "border-destructive bg-destructive/10";
                    else cls = "border-border/40 bg-muted/40 opacity-70";
                  } else if (isSelected) cls = "border-primary bg-primary-soft";
                  return (
                    <button
                      key={String(v)}
                      onClick={() => !revealed && setTfSelected(v)}
                      disabled={revealed}
                      className={cn("flex items-center justify-center gap-2 rounded-2xl border-2 px-4 py-4 text-base font-bold transition-all", cls)}
                    >
                      {v ? "True" : "False"}
                      {revealed && isCorrect && <Check className="h-4 w-4 text-success" />}
                      {revealed && isSelected && !isCorrect && <X className="h-4 w-4 text-destructive" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Fill in the blank */}
            {q.type === "fib" && (
              <div className="mt-5 space-y-2">
                <Input
                  value={fibInput}
                  onChange={(e) => setFibInput(e.target.value)}
                  disabled={revealed}
                  placeholder="Type your answer..."
                  className="h-12 rounded-2xl text-base"
                  onKeyDown={(e) => { if (e.key === "Enter" && !revealed && canSubmit) submit(); }}
                />
                {revealed && (
                  <div className={cn("rounded-2xl border-2 px-4 py-3 text-sm font-medium",
                    normalize(fibInput) === normalize(q.answer)
                      ? "border-success bg-success-soft"
                      : "border-destructive bg-destructive/10")}>
                    Correct answer: <span className="font-bold">{q.answer}</span>
                  </div>
                )}
              </div>
            )}

            {/* Coding */}
            {q.type === "coding" && (
              <div className="mt-5 space-y-3">
                {q.starter_code && (
                  <pre className="overflow-x-auto rounded-2xl border border-border/50 bg-muted/50 p-4 text-xs"><code>{q.starter_code}</code></pre>
                )}
                <Textarea
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  disabled={revealed}
                  placeholder={`Write your ${q.language || "code"} solution here…`}
                  className="min-h-[140px] rounded-2xl font-mono text-sm"
                />
                {revealed && (
                  <div className="space-y-2">
                    <div className="rounded-2xl border-2 border-success/40 bg-success-soft/40 p-3">
                      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-success">Reference solution ({q.language})</div>
                      <pre className="overflow-x-auto text-xs"><code>{q.answer}</code></pre>
                      {q.expected_output && <div className="mt-2 text-xs text-muted-foreground">Expected output: <code>{q.expected_output}</code></div>}
                    </div>
                    {codeSelfGrade === null && (
                      <div className="flex items-center justify-between gap-2 rounded-2xl bg-muted/40 px-4 py-3">
                        <span className="text-sm font-medium">Did you get it right?</span>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="rounded-full border-destructive/40 text-destructive" onClick={() => gradeCoding(false)}>
                            <X className="mr-1 h-3.5 w-3.5" /> No
                          </Button>
                          <Button size="sm" className="rounded-full bg-success text-success-foreground hover:bg-success/90" onClick={() => gradeCoding(true)}>
                            <Check className="mr-1 h-3.5 w-3.5" /> Yes
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {revealed && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-5 rounded-2xl border border-ai/20 bg-ai-soft/60 p-4">
                <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ai">
                  <Brain className="h-3.5 w-3.5" /> Explanation
                </div>
                <p className="text-sm text-foreground/90">{q.explanation}</p>
              </motion.div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              {!revealed ? (
                <Button onClick={submit} disabled={!canSubmit} className="rounded-full">
                  {q.type === "coding" ? "Reveal solution" : "Submit"}
                </Button>
              ) : (
                (q.type !== "coding" || codeSelfGrade !== null) && (
                  <Button onClick={next} className="rounded-full">
                    {idx + 1 >= activeQuiz.questions.length ? "See results" : "Next →"}
                  </Button>
                )
              )}
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
