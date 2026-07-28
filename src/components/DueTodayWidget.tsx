import { useEffect, useState } from "react";
import { getDeviceId } from "@/lib/deviceId";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Layers, ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/lib/localStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type DueRow = { lecture_id: string; due_date: string };
type LectureRow = { id: string; title: string };

export const DueTodayWidget = () => {
  const [loading, setLoading] = useState(true);
  const [byLecture, setByLecture] = useState<{ id: string; title: string; count: number }[]>([]);
  const [totalDue, setTotalDue] = useState(0);

  useEffect(() => {
    const load = async () => {
      const nowIso = new Date().toISOString();
      const { data: due } = await supabase
        .from("flashcards")
        .select("lecture_id,due_date")
        .eq("user_id", getDeviceId())
        .lte("due_date", nowIso);
      const rows = (due ?? []) as DueRow[];
      setTotalDue(rows.length);

      const counts = new Map<string, number>();
      rows.forEach((r) => counts.set(r.lecture_id, (counts.get(r.lecture_id) ?? 0) + 1));
      const ids = Array.from(counts.keys());
      if (ids.length === 0) {
        setByLecture([]);
        setLoading(false);
        return;
      }
      const { data: lecs } = await supabase.from("lectures").select("id,title").eq("user_id", getDeviceId()).in("id", ids);
      const lecMap = new Map((lecs ?? []).map((l: LectureRow) => [l.id, l.title]));
      const merged = ids
        .map((id) => ({ id, title: lecMap.get(id) ?? "Untitled", count: counts.get(id) ?? 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      setByLecture(merged);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <Skeleton className="h-48 rounded-3xl" />;

  if (totalDue === 0) {
    return (
      <Card className="rounded-3xl border-success/30 bg-success-soft/40 p-6 shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-success text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display text-lg font-extrabold">No reviews due 🎉</h3>
            <p className="text-sm text-muted-foreground">You're all caught up. New cards become due automatically.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="rounded-3xl border-border/50 p-6 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-hero text-white shadow-playful">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display text-lg font-extrabold">Due today</h3>
            <p className="text-sm text-muted-foreground">
              {totalDue} card{totalDue === 1 ? "" : "s"} ready for review
            </p>
          </div>
        </div>
        <span className="rounded-full bg-primary px-3 py-1 text-sm font-extrabold text-primary-foreground shadow-playful">
          {totalDue}
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {byLecture.map((l, i) => (
          <motion.div key={l.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
            <Link
              to={`/lecture/${l.id}`}
              className="group flex items-center justify-between rounded-2xl border border-border/50 bg-card px-4 py-3 transition-all hover:border-primary/40 hover:bg-primary-soft/30"
            >
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-bold text-primary">{l.count}</span>
                <span className="line-clamp-1 text-sm font-medium">{l.title}</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          </motion.div>
        ))}
      </div>
      {byLecture.length > 0 && (
        <Button asChild size="sm" className="mt-4 w-full rounded-full bg-gradient-hero text-white shadow-playful hover:opacity-90">
          <Link to="/review">Start daily review →</Link>
        </Button>
      )}
    </Card>
  );
};
