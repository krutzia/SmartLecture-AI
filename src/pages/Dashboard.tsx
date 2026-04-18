import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, Upload, Sparkles, Clock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DueTodayWidget } from "@/components/DueTodayWidget";

type Lecture = {
  id: string; title: string; status: string; source_type: string; created_at: string;
};

const statusBadge: Record<string, { label: string; cls: string; Icon: any }> = {
  done: { label: "Ready", cls: "bg-success-soft text-success", Icon: CheckCircle2 },
  error: { label: "Error", cls: "bg-destructive/10 text-destructive", Icon: AlertCircle },
  uploading: { label: "Uploading", cls: "bg-accent text-accent-foreground", Icon: Loader2 },
  extracting: { label: "Extracting", cls: "bg-accent text-accent-foreground", Icon: Loader2 },
  transcribing: { label: "Transcribing", cls: "bg-ai-soft text-ai", Icon: Loader2 },
  summarizing: { label: "Summarizing", cls: "bg-ai-soft text-ai", Icon: Loader2 },
};

const Dashboard = () => {
  const { user } = useAuth();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, ready: 0, flashcards: 0 });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data: lecs } = await supabase.from("lectures").select("id,title,status,source_type,created_at").order("created_at", { ascending: false }).limit(6);
      const { count: totalCount } = await supabase.from("lectures").select("*", { count: "exact", head: true });
      const { count: readyCount } = await supabase.from("lectures").select("*", { count: "exact", head: true }).eq("status", "done");
      const { count: flashCount } = await supabase.from("flashcards").select("*", { count: "exact", head: true });
      if (!mounted) return;
      setLectures(lecs ?? []);
      setStats({ total: totalCount ?? 0, ready: readyCount ?? 0, flashcards: flashCount ?? 0 });
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel("dashboard-lectures")
      .on("postgres_changes", { event: "*", schema: "public", table: "lectures" }, load)
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="container max-w-6xl py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold md:text-4xl">
            Hey {user?.email?.split("@")[0]} 👋
          </h1>
          <p className="mt-1 text-muted-foreground">Here's a quick look at your study workspace.</p>
        </div>
        <Button asChild size="lg" className="rounded-full shadow-playful">
          <Link to="/upload"><Upload className="mr-2 h-4 w-4" /> New lecture</Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total lectures", value: stats.total, Icon: BookOpen, color: "bg-primary-soft text-primary" },
          { label: "Ready to study", value: stats.ready, Icon: CheckCircle2, color: "bg-success-soft text-success" },
          { label: "Flashcards created", value: stats.flashcards, Icon: Sparkles, color: "bg-ai-soft text-ai" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="rounded-3xl border-border/50 p-6 shadow-card">
              <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-2xl ${s.color}`}>
                <s.Icon className="h-5 w-5" />
              </div>
              <div className="font-display text-3xl font-extrabold">{s.value}</div>
              <div className="text-sm text-muted-foreground">{s.label}</div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Due today review queue */}
      <div className="mt-8">
        <DueTodayWidget />
      </div>

      {/* Recent */}
      <div className="mt-10">
        <h2 className="font-display text-2xl font-extrabold">Recent lectures</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-3xl" />)}
          {!loading && lectures.length === 0 && (
            <Card className="col-span-full rounded-3xl border-dashed bg-card/50 p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft">
                <Upload className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-display text-xl font-bold">No lectures yet</h3>
              <p className="mt-1 text-muted-foreground">Upload your first one to get started!</p>
              <Button asChild className="mt-6 rounded-full"><Link to="/upload">Upload a lecture</Link></Button>
            </Card>
          )}
          {!loading && lectures.map((l, i) => {
            const badge = statusBadge[l.status] ?? statusBadge.done;
            const isProcessing = !["done", "error"].includes(l.status);
            return (
              <motion.div key={l.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Link to={`/lecture/${l.id}`}>
                  <Card className="group h-full cursor-pointer rounded-3xl border-border/50 p-6 shadow-card transition-all hover:-translate-y-1 hover:shadow-playful">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${badge.cls}`}>
                        <badge.Icon className={`h-3 w-3 ${isProcessing ? "animate-spin" : ""}`} />
                        {badge.label}
                      </span>
                    </div>
                    <h3 className="mt-4 line-clamp-2 font-display text-lg font-bold">{l.title}</h3>
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(l.created_at).toLocaleDateString()}
                    </div>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
