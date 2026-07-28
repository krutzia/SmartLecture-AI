import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/localStore";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Concept = { id: string; term: string; definition: string | null; kind: string | null };

const kindColor: Record<string, string> = {
  concept: "bg-primary-soft text-primary border-primary/20",
  definition: "bg-ai-soft text-ai border-ai/20",
  keyword: "bg-accent text-accent-foreground border-highlight/30",
};

export const ConceptsTab = ({ lectureId }: { lectureId: string }) => {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Concept | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("concepts").select("id,term,definition,kind").eq("lecture_id", lectureId).order("created_at");
      setConcepts(data ?? []);
      setActive(data?.[0] ?? null);
      setLoading(false);
    };
    load();
  }, [lectureId]);

  if (loading) return <Skeleton className="h-96 rounded-3xl" />;
  if (concepts.length === 0) return <Card className="rounded-3xl p-8 text-center text-muted-foreground">No concepts yet.</Card>;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
      <Card className="rounded-3xl border-border/50 p-5 shadow-card">
        <h3 className="mb-3 font-display text-lg font-extrabold">Key concepts</h3>
        <div className="flex flex-wrap gap-2">
          {concepts.map((c, i) => (
            <motion.button
              key={c.id}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
              onClick={() => setActive(c)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
                active?.id === c.id ? "ring-2 ring-primary ring-offset-2" : ""
              } ${kindColor[c.kind ?? "concept"] ?? kindColor.concept}`}
            >
              {c.term}
            </motion.button>
          ))}
        </div>
      </Card>

      {active && (
        <motion.div key={active.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="rounded-3xl border-border/50 p-6 shadow-card">
            <span className={`mb-3 inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${kindColor[active.kind ?? "concept"] ?? kindColor.concept}`}>
              {active.kind ?? "concept"}
            </span>
            <h3 className="font-display text-2xl font-extrabold">{active.term}</h3>
            <p className="mt-3 text-foreground/90">{active.definition}</p>
          </Card>
        </motion.div>
      )}
    </div>
  );
};
