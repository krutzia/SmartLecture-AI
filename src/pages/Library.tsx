import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Search, Upload, Clock, CheckCircle2, AlertCircle, Loader2, Pin, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { getPinned, togglePinned } from "@/lib/palettePrefs";

type Lecture = { id: string; title: string; status: string; source_type: string; created_at: string };

const statusBadge: Record<string, { label: string; cls: string; Icon: any }> = {
  done: { label: "Ready", cls: "bg-success-soft text-success", Icon: CheckCircle2 },
  error: { label: "Error", cls: "bg-destructive/10 text-destructive", Icon: AlertCircle },
  uploading: { label: "Uploading", cls: "bg-accent text-accent-foreground", Icon: Loader2 },
  extracting: { label: "Extracting", cls: "bg-accent text-accent-foreground", Icon: Loader2 },
  transcribing: { label: "Transcribing", cls: "bg-ai-soft text-ai", Icon: Loader2 },
  summarizing: { label: "Summarizing", cls: "bg-ai-soft text-ai", Icon: Loader2 },
};

const Library = () => {
  const { user } = useAuth();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("lectures").select("id,title,status,source_type,created_at").order("created_at", { ascending: false });
      setLectures(data ?? []);
      setLoading(false);
    };
    load();
    const ch = supabase.channel("library-lectures").on("postgres_changes", { event: "*", schema: "public", table: "lectures" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Refresh pinned set from localStorage on focus / when user changes
  useEffect(() => {
    if (!user) { setPinnedIds(new Set()); return; }
    const refresh = () => setPinnedIds(new Set(getPinned(user.id)));
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [user]);

  // Pinned first, then by created_at desc (already sorted)
  const filtered = useMemo(() => {
    const matched = lectures.filter((l) => l.title.toLowerCase().includes(q.toLowerCase()));
    return [...matched].sort((a, b) => {
      const ap = pinnedIds.has(a.id) ? 1 : 0;
      const bp = pinnedIds.has(b.id) ? 1 : 0;
      return bp - ap;
    });
  }, [lectures, q, pinnedIds]);

  return (
    <div className="container max-w-6xl py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold md:text-4xl">My Library</h1>
          <p className="mt-1 text-muted-foreground">All your processed lectures, in one cozy shelf.</p>
        </div>
        <Button asChild size="lg" className="rounded-full shadow-playful">
          <Link to="/upload"><Upload className="mr-2 h-4 w-4" /> New lecture</Link>
        </Button>
      </div>

      <div className="mt-6 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search lectures..."
          className="h-12 rounded-full pl-10"
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-3xl" />)}
        {!loading && filtered.length === 0 && (
          <Card className="col-span-full rounded-3xl border-dashed bg-card/50 p-12 text-center">
            <p className="text-muted-foreground">{q ? "No matches." : "Your library is empty — upload your first lecture!"}</p>
          </Card>
        )}
        {!loading && filtered.map((l) => {
          const badge = statusBadge[l.status] ?? statusBadge.done;
          const isProcessing = !["done", "error"].includes(l.status);
          const pinned = pinnedIds.has(l.id);
          return (
            <Link key={l.id} to={`/lecture/${l.id}`}>
              <Card
                className={`group relative h-full cursor-pointer rounded-3xl p-6 shadow-card transition-all hover:-translate-y-1 hover:shadow-playful ${
                  pinned ? "border-highlight/60 ring-1 ring-highlight/30" : "border-border/50"
                }`}
              >
                {pinned && (
                  <span
                    className="absolute -top-2 -left-2 inline-flex items-center gap-1 rounded-full bg-highlight px-2 py-0.5 text-xs font-bold text-highlight-foreground shadow-playful"
                    title="Pinned in Cmd+K"
                  >
                    <Pin className="h-3 w-3 fill-current" /> Pinned
                  </span>
                )}
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
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(l.created_at).toLocaleDateString()}
                  <span className="rounded-full bg-muted px-2 py-0.5 uppercase">{l.source_type}</span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default Library;
