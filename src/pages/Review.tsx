import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, RotateCw, Zap, Target, Smile, Trophy, Layers, Sparkles, Keyboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { sm2, QUALITY } from "@/lib/sm2";

type DueCard = {
  id: string;
  question: string;
  answer: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  due_date: string;
  lecture_id: string;
};

type LectureLite = { id: string; title: string };

const Review = () => {
  const [cards, setCards] = useState<DueCard[]>([]);
  const [lectures, setLectures] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ reviewed: 0, easy: 0, again: 0, total: 0 });

  useEffect(() => {
    const load = async () => {
      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from("flashcards")
        .select("id,question,answer,ease_factor,interval_days,repetitions,due_date,lecture_id")
        .lte("due_date", nowIso)
        .order("due_date", { ascending: true });
      const due = (data ?? []) as DueCard[];
      setCards(due);
      setStats((s) => ({ ...s, total: due.length }));
      const ids = Array.from(new Set(due.map((d) => d.lecture_id)));
      if (ids.length > 0) {
        const { data: lecs } = await supabase.from("lectures").select("id,title").in("id", ids);
        setLectures(new Map((lecs ?? []).map((l: LectureLite) => [l.id, l.title])));
      }
      setLoading(false);
    };
    load();
  }, []);

  const card = cards[idx];
  const lectureTitle = card ? lectures.get(card.lecture_id) ?? "Lecture" : "";
  const progress = stats.total > 0 ? (stats.reviewed / stats.total) * 100 : 0;

  const review = useCallback(async (quality: number) => {
    if (!card) return;
    const result = sm2(
      { ease_factor: card.ease_factor, interval_days: card.interval_days, repetitions: card.repetitions },
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
      .eq("id", card.id);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const topic = card.question.split(/[?:.]/)[0].trim().slice(0, 60) || "Flashcard";
      await Promise.all([
        supabase.from("quiz_attempts").insert({
          user_id: user.id,
          lecture_id: card.lecture_id,
          topic,
          flashcard_id: card.id,
          correct: quality >= 4,
        }),
        supabase.from("study_sessions").insert({
          user_id: user.id,
          lecture_id: card.lecture_id,
          activity: "review",
          minutes: 0.3,
        }),
      ]);
    }

    setStats((s) => ({
      ...s,
      reviewed: s.reviewed + 1,
      easy: s.easy + (quality === QUALITY.EASY ? 1 : 0),
      again: s.again + (quality === QUALITY.AGAIN ? 1 : 0),
    }));
    setFlipped(false);
    setIdx((i) => i + 1);
  }, [card]);

  // Keyboard shortcuts: Space = flip, 1-4 = Again/Hard/Good/Easy
  useEffect(() => {
    if (!card) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).matches("input, textarea, [contenteditable=true]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
        return;
      }
      if (!flipped) return;
      switch (e.key) {
        case "1":
          e.preventDefault();
          review(QUALITY.AGAIN);
          break;
        case "2":
          e.preventDefault();
          review(QUALITY.HARD);
          break;
        case "3":
          e.preventDefault();
          review(QUALITY.GOOD);
          break;
        case "4":
          e.preventDefault();
          review(QUALITY.EASY);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [card, flipped, review]);

  if (loading) {
    return (
      <div className="container max-w-2xl py-8">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="mt-6 h-96 rounded-3xl" />
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="container max-w-2xl py-12">
        <Card className="rounded-3xl border-success/30 bg-success-soft/40 p-12 text-center shadow-card">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-success text-white shadow-playful">
            <Sparkles className="h-7 w-7" />
          </div>
          <h2 className="font-display text-3xl font-extrabold">All caught up! 🎉</h2>
          <p className="mt-2 text-muted-foreground">No flashcards are due for review right now.</p>
          <Button asChild className="mt-6 rounded-full">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (idx >= cards.length) {
    const accuracy = stats.reviewed > 0 ? Math.round((stats.easy / stats.reviewed) * 100) : 0;
    return (
      <div className="container max-w-2xl py-12">
        <Card className="rounded-3xl border-primary/30 bg-gradient-cream p-12 text-center shadow-playful">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-hero text-white shadow-playful">
            <Trophy className="h-7 w-7" />
          </div>
          <h2 className="font-display text-3xl font-extrabold">Session complete!</h2>
          <p className="mt-2 text-muted-foreground">
            You reviewed {stats.reviewed} card{stats.reviewed === 1 ? "" : "s"} across your library.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-2xl bg-success-soft p-4">
              <div className="font-display text-2xl font-extrabold text-success">{stats.easy}</div>
              <div className="text-muted-foreground">Easy</div>
            </div>
            <div className="rounded-2xl bg-primary-soft p-4">
              <div className="font-display text-2xl font-extrabold text-primary">{accuracy}%</div>
              <div className="text-muted-foreground">Confident</div>
            </div>
            <div className="rounded-2xl bg-destructive/10 p-4">
              <div className="font-display text-2xl font-extrabold text-destructive">{stats.again}</div>
              <div className="text-muted-foreground">To repeat</div>
            </div>
          </div>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/dashboard">Dashboard</Link>
            </Button>
            <Button asChild className="rounded-full">
              <Link to="/analytics">View analytics</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="rounded-full">
          <Link to="/dashboard"><ArrowLeft className="mr-1 h-4 w-4" /> Exit</Link>
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Layers className="h-4 w-4" />
          <span className="font-medium">{stats.reviewed + 1} / {stats.total}</span>
        </div>
      </div>

      <div>
        <h1 className="font-display text-2xl font-extrabold md:text-3xl flex items-center gap-2">
          Daily review <Sparkles className="h-6 w-6 text-highlight" />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          From <Link to={`/lecture/${card.lecture_id}`} className="font-medium text-primary hover:underline">{lectureTitle}</Link>
        </p>
      </div>

      <Progress value={progress} className="mt-4 h-2 rounded-full" />

      <div className="perspective-1000 mt-6 h-72">
        <motion.div
          key={card.id}
          className="relative h-full w-full cursor-pointer preserve-3d"
          onClick={() => setFlipped((f) => !f)}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.5, type: "spring", stiffness: 90, damping: 14 }}
        >
          <Card className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl border-2 border-primary/20 bg-gradient-cream p-8 text-center shadow-playful backface-hidden">
            <span className="mb-4 rounded-full bg-primary-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">Question</span>
            <p className="font-display text-xl font-bold md:text-2xl">{card.question}</p>
            <p className="mt-6 text-xs text-muted-foreground">Tap or press Space to flip</p>
          </Card>
          <Card className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl border-2 border-ai/20 bg-ai-soft p-8 text-center shadow-playful backface-hidden rotate-y-180">
            <span className="mb-4 rounded-full bg-ai px-3 py-1 text-xs font-bold uppercase tracking-wide text-ai-foreground">Answer</span>
            <p className="text-lg font-medium text-foreground/90">{card.answer}</p>
          </Card>
        </motion.div>
      </div>

      {flipped ? (
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button onClick={() => review(QUALITY.AGAIN)} variant="outline" className="rounded-2xl gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10">
            <RotateCw className="h-3.5 w-3.5" /> Again
            <kbd className="ml-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold">1</kbd>
          </Button>
          <Button onClick={() => review(QUALITY.HARD)} variant="outline" className="rounded-2xl gap-1.5 border-highlight/50 text-accent-foreground hover:bg-accent">
            <Target className="h-3.5 w-3.5" /> Hard
            <kbd className="ml-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold">2</kbd>
          </Button>
          <Button onClick={() => review(QUALITY.GOOD)} variant="outline" className="rounded-2xl gap-1.5 border-primary/40 text-primary hover:bg-primary-soft">
            <Smile className="h-3.5 w-3.5" /> Good
            <kbd className="ml-1 rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold">3</kbd>
          </Button>
          <Button onClick={() => review(QUALITY.EASY)} className="rounded-2xl gap-1.5 bg-success text-success-foreground hover:bg-success/90">
            <Zap className="h-3.5 w-3.5" /> Easy
            <kbd className="ml-1 rounded bg-success-foreground/20 px-1.5 py-0.5 text-[10px] font-bold">4</kbd>
          </Button>
        </div>
      ) : (
        <p className="mt-6 text-center text-sm text-muted-foreground">Flip the card, then grade your recall</p>
      )}

      <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
        <Keyboard className="h-3.5 w-3.5" />
        <span>
          <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">Space</kbd> flip ·
          <kbd className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">1</kbd>
          <kbd className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">2</kbd>
          <kbd className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">3</kbd>
          <kbd className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">4</kbd> grade
        </span>
      </div>
    </div>
  );
};

export default Review;
