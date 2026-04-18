import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Check, X, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Flashcard = { id: string; question: string; answer: string; known: boolean };

export const FlashcardsTab = ({ lectureId }: { lectureId: string }) => {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("flashcards").select("id,question,answer,known").eq("lecture_id", lectureId).order("created_at");
      setCards(data ?? []);
      setLoading(false);
    };
    load();
  }, [lectureId]);

  const markKnown = async (known: boolean) => {
    const c = cards[idx];
    if (!c) return;
    await supabase.from("flashcards").update({ known }).eq("id", c.id);
    setCards((prev) => prev.map((x, i) => (i === idx ? { ...x, known } : x)));
    // Log quiz attempt for analytics
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const topic = c.question.split(/[?:.]/)[0].trim().slice(0, 60) || "Flashcard";
      await Promise.all([
        supabase.from("quiz_attempts").insert({
          user_id: user.id,
          lecture_id: lectureId,
          topic,
          flashcard_id: c.id,
          correct: known,
        }),
        supabase.from("study_sessions").insert({
          user_id: user.id,
          lecture_id: lectureId,
          activity: "flashcard",
          minutes: 0.3,
        }),
      ]);
    }
    next();
  };

  const next = () => { setFlipped(false); setIdx((i) => Math.min(i + 1, cards.length - 1)); };
  const prev = () => { setFlipped(false); setIdx((i) => Math.max(i - 1, 0)); };

  if (loading) return <Skeleton className="h-96 rounded-3xl" />;
  if (cards.length === 0) return <Card className="rounded-3xl p-8 text-center text-muted-foreground">No flashcards yet.</Card>;

  const card = cards[idx];
  const knownCount = cards.filter((c) => c.known).length;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between text-sm">
        <span className="font-medium text-muted-foreground">Card {idx + 1} of {cards.length}</span>
        <span className="rounded-full bg-success-soft px-3 py-1 font-medium text-success">{knownCount} known ✓</span>
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

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="outline" size="icon" onClick={prev} disabled={idx === 0} className="rounded-full">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex gap-2">
          <Button onClick={() => markKnown(false)} variant="outline" className="rounded-full gap-1.5">
            <X className="h-4 w-4" /> Still learning
          </Button>
          <Button onClick={() => markKnown(true)} className="rounded-full gap-1.5 bg-success text-success-foreground hover:bg-success/90">
            <Check className="h-4 w-4" /> I know this
          </Button>
        </div>
        <Button variant="outline" size="icon" onClick={next} disabled={idx === cards.length - 1} className="rounded-full">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Button variant="ghost" size="sm" onClick={() => { setIdx(0); setFlipped(false); }} className="mt-4 w-full gap-1.5">
        <RotateCw className="h-3.5 w-3.5" /> Restart deck
      </Button>
    </div>
  );
};
