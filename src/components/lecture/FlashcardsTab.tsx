import { getDeviceId } from "@/lib/deviceId";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, RotateCw, Zap, Target, Smile, Trophy, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/localStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { sm2, QUALITY } from "@/lib/sm2";

const difficultyOf = (ef: number, reps: number): { label: string; cls: string } => {
  if (reps === 0) return { label: "New", cls: "bg-secondary text-secondary-foreground" };
  if (ef >= 2.5) return { label: "Easy", cls: "bg-success-soft text-success" };
  if (ef >= 2.0) return { label: "Medium", cls: "bg-primary-soft text-primary" };
  return { label: "Hard", cls: "bg-destructive/10 text-destructive" };
};

type Flashcard = {
  id: string;
  question: string;
  answer: string;
  known: boolean;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  due_date: string;
};

export const FlashcardsTab = ({ lectureId }: { lectureId: string }) => {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [dueOnly, setDueOnly] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("flashcards")
        .select("id,question,answer,known,ease_factor,interval_days,repetitions,due_date")
        .eq("lecture_id", lectureId)
        .order("due_date", { ascending: true });
      setCards((data ?? []) as Flashcard[]);
      setLoading(false);
    };
    load();
  }, [lectureId]);

  const now = new Date();
  const filtered = dueOnly ? cards.filter((c) => new Date(c.due_date) <= now) : cards;
  const dueCount = cards.filter((c) => new Date(c.due_date) <= now).length;

  const review = async (quality: number) => {
    const c = filtered[idx];
    if (!c) return;
    const result = sm2(
      { ease_factor: c.ease_factor, interval_days: c.interval_days, repetitions: c.repetitions },
      quality,
    );
    await supabase
      .from("flashcards")
      .update({
        ease_factor: result.ease_factor,
        interval_days: result.interval_days,
        repetitions: result.repetitions,
        due_date: result.due_date,
        last_reviewed_at: result.last_reviewed_at,
        known: result.known,
      })
      .eq("id", c.id);

    // Update local state
    setCards((prev) =>
      prev.map((x) =>
        x.id === c.id
          ? {
              ...x,
              ease_factor: result.ease_factor,
              interval_days: result.interval_days,
              repetitions: result.repetitions,
              due_date: result.due_date,
              known: result.known,
            }
          : x,
      ),
    );

    // Log analytics
    const user = { id: getDeviceId() };
    if (user) {
      const topic = c.question.split(/[?:.]/)[0].trim().slice(0, 60) || "Flashcard";
      await Promise.all([
        supabase.from("quiz_attempts").insert({
          user_id: user.id,
          lecture_id: lectureId,
          topic,
          flashcard_id: c.id,
          correct: quality >= 4,
        }),
        supabase.from("study_sessions").insert({
          user_id: user.id,
          lecture_id: lectureId,
          activity: "flashcard",
          minutes: 0.3,
        }),
      ]);
    }

    setFlipped(false);
    if (dueOnly) {
      // Card moves out of due set; keep idx, ensure bounds
      setIdx((i) => Math.min(i, Math.max(0, filtered.length - 2)));
    } else {
      setIdx((i) => Math.min(i + 1, cards.length - 1));
    }
  };

  const next = () => { setFlipped(false); setIdx((i) => Math.min(i + 1, filtered.length - 1)); };
  const prev = () => { setFlipped(false); setIdx((i) => Math.max(i - 1, 0)); };

  if (loading) return <Skeleton className="h-96 rounded-3xl" />;
  if (cards.length === 0) return <Card className="rounded-3xl p-8 text-center text-muted-foreground">No flashcards yet.</Card>;

  if (filtered.length === 0) {
    return (
      <Card className="rounded-3xl border-success/30 bg-success-soft/40 p-10 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-success text-white">
          <Trophy className="h-6 w-6" />
        </div>
        <h3 className="font-display text-2xl font-extrabold">All caught up! 🎉</h3>
        <p className="mt-2 text-muted-foreground">No cards due right now. Come back later or review the full deck.</p>
        <Button onClick={() => { setDueOnly(false); setIdx(0); }} className="mt-6 rounded-full">
          Review full deck
        </Button>
      </Card>
    );
  }

  const card = filtered[Math.min(idx, filtered.length - 1)];
  const knownCount = cards.filter((c) => c.known).length;
  const difficulty = difficultyOf(card.ease_factor, card.repetitions);

  const toggleLearned = async () => {
    const nextKnown = !card.known;
    await supabase.from("flashcards").update({ known: nextKnown }).eq("id", card.id);
    setCards((prev) => prev.map((x) => (x.id === card.id ? { ...x, known: nextKnown } : x)));
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium text-muted-foreground">
          Card {Math.min(idx + 1, filtered.length)} of {filtered.length}
        </span>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${difficulty.cls}`}>{difficulty.label}</span>
          <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">{dueCount} due</span>
          <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">{knownCount} learned</span>
          <Button
            variant={card.known ? "default" : "outline"}
            size="sm"
            onClick={toggleLearned}
            className={`rounded-full text-xs ${card.known ? "bg-success text-success-foreground hover:bg-success/90" : ""}`}
          >
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            {card.known ? "Learned" : "Mark as learned"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setDueOnly((d) => !d); setIdx(0); }}
            className="rounded-full text-xs"
          >
            {dueOnly ? "Show all" : "Due only"}
          </Button>
        </div>
      </div>

      <div className="perspective-1000 h-72">
        <motion.div
          className="relative h-full w-full cursor-pointer preserve-3d"
          onClick={() => setFlipped((f) => !f)}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.5, type: "spring", stiffness: 90, damping: 14 }}
        >
          <Card className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl border-2 border-primary/20 bg-gradient-cream p-8 text-center shadow-playful backface-hidden">
            <span className="mb-4 rounded-full bg-primary-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">Question</span>
            <p className="font-display text-xl font-bold md:text-2xl">{card.question}</p>
            <p className="mt-6 text-xs text-muted-foreground">Tap to flip</p>
          </Card>
          <Card className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl border-2 border-ai/20 bg-ai-soft p-8 text-center shadow-playful backface-hidden rotate-y-180">
            <span className="mb-4 rounded-full bg-ai px-3 py-1 text-xs font-bold uppercase tracking-wide text-ai-foreground">Answer</span>
            <p className="text-lg font-medium text-foreground/90">{card.answer}</p>
          </Card>
        </motion.div>
      </div>

      {/* SM-2 review buttons (only show after flip for fairness) */}
      {flipped ? (
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button onClick={() => review(QUALITY.AGAIN)} variant="outline" className="rounded-2xl gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10">
            <RotateCw className="h-3.5 w-3.5" /> Again
            <span className="ml-1 text-[10px] opacity-70">&lt;1d</span>
          </Button>
          <Button onClick={() => review(QUALITY.HARD)} variant="outline" className="rounded-2xl gap-1.5 border-highlight/50 text-accent-foreground hover:bg-accent">
            <Target className="h-3.5 w-3.5" /> Hard
          </Button>
          <Button onClick={() => review(QUALITY.GOOD)} variant="outline" className="rounded-2xl gap-1.5 border-primary/40 text-primary hover:bg-primary-soft">
            <Smile className="h-3.5 w-3.5" /> Good
          </Button>
          <Button onClick={() => review(QUALITY.EASY)} className="rounded-2xl gap-1.5 bg-success text-success-foreground hover:bg-success/90">
            <Zap className="h-3.5 w-3.5" /> Easy
          </Button>
        </div>
      ) : (
        <p className="mt-6 text-center text-sm text-muted-foreground">Flip the card to grade your recall</p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button variant="ghost" size="icon" onClick={prev} disabled={idx === 0} className="rounded-full">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground">
          Next due: {new Date(card.due_date).toLocaleDateString()} · ease {card.ease_factor.toFixed(2)}
        </span>
        <Button variant="ghost" size="icon" onClick={next} disabled={idx >= filtered.length - 1} className="rounded-full">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
