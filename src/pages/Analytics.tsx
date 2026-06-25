import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Clock, Target, Brain, Sparkles, Trophy } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StudyHeatmap } from "@/components/StudyHeatmap";
import { WeakTopicCoach } from "@/components/WeakTopicCoach";

type Session = { minutes: number; created_at: string; activity: string };
type Attempt = { topic: string | null; correct: boolean; created_at: string; flashcard_id: string | null };

const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short" });

const Analytics = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const sinceIso = since.toISOString();
      const [{ data: s }, { data: a }] = await Promise.all([
        supabase.from("study_sessions").select("minutes,created_at,activity").gte("created_at", sinceIso),
        supabase.from("quiz_attempts").select("topic,correct,created_at,flashcard_id").gte("created_at", sinceIso),
      ]);
      setSessions((s ?? []) as Session[]);
      setAttempts((a ?? []) as Attempt[]);
      setLoading(false);
    };
    load();
  }, []);

  // Last 7 days study time
  const studyByDay = useMemo(() => {
    const days: { day: string; minutes: number; date: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push({ day: fmtDay(d), date: d.toISOString().slice(0, 10), minutes: 0 });
    }
    sessions.forEach((s) => {
      const key = new Date(s.created_at).toISOString().slice(0, 10);
      const slot = days.find((d) => d.date === key);
      if (slot) slot.minutes += Number(s.minutes) || 0;
    });
    return days.map((d) => ({ ...d, minutes: Math.round(d.minutes * 10) / 10 }));
  }, [sessions]);

  // Accuracy over last 7 days
  const accuracyByDay = useMemo(() => {
    const days: { day: string; accuracy: number; date: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push({ day: fmtDay(d), date: d.toISOString().slice(0, 10), accuracy: 0, total: 0 });
    }
    const correctMap: Record<string, { c: number; t: number }> = {};
    attempts.forEach((a) => {
      const key = new Date(a.created_at).toISOString().slice(0, 10);
      if (!correctMap[key]) correctMap[key] = { c: 0, t: 0 };
      correctMap[key].t += 1;
      if (a.correct) correctMap[key].c += 1;
    });
    return days.map((d) => {
      const m = correctMap[d.date];
      return { ...d, accuracy: m && m.t > 0 ? Math.round((m.c / m.t) * 100) : 0, total: m?.t ?? 0 };
    });
  }, [attempts]);

  // Topic strength (weak vs strong)
  const topicStats = useMemo(() => {
    const map: Record<string, { c: number; t: number }> = {};
    attempts.forEach((a) => {
      const t = (a.topic ?? "Untagged").trim() || "Untagged";
      if (!map[t]) map[t] = { c: 0, t: 0 };
      map[t].t += 1;
      if (a.correct) map[t].c += 1;
    });
    const arr = Object.entries(map).map(([topic, v]) => ({
      topic,
      accuracy: v.t > 0 ? Math.round((v.c / v.t) * 100) : 0,
      total: v.t,
    }));
    arr.sort((a, b) => b.accuracy - a.accuracy);
    return arr;
  }, [attempts]);

  const strong = topicStats.filter((t) => t.accuracy >= 70).slice(0, 6);
  const weak = [...topicStats].filter((t) => t.accuracy < 70).sort((a, b) => a.accuracy - b.accuracy).slice(0, 6);

  const totalMinutes = sessions.reduce((s, x) => s + (Number(x.minutes) || 0), 0);
  const totalAttempts = attempts.length;
  const overallAccuracy =
    totalAttempts > 0 ? Math.round((attempts.filter((a) => a.correct).length / totalAttempts) * 100) : 0;
  const streak = useMemo(() => {
    let s = 0;
    for (let i = studyByDay.length - 1; i >= 0; i--) {
      if (studyByDay[i].minutes > 0) s++;
      else break;
    }
    return s;
  }, [studyByDay]);

  const totalHours = totalMinutes / 60;
  const studyDisplay = totalHours >= 1 ? `${totalHours.toFixed(1)}h` : `${Math.round(totalMinutes)}m`;
  const flashcardsCompleted = attempts.filter((a) => a.flashcard_id).length;

  const stats = [
    { label: "Total studied (30d)", value: studyDisplay, Icon: Clock, color: "bg-primary-soft text-primary" },
    { label: "Quiz accuracy", value: `${overallAccuracy}%`, Icon: Target, color: "bg-success-soft text-success" },
    { label: "Flashcards reviewed", value: flashcardsCompleted, Icon: Brain, color: "bg-ai-soft text-ai" },
    { label: "Day streak", value: `${streak} 🔥`, Icon: Trophy, color: "bg-accent text-accent-foreground" },
  ];

  if (loading) {
    return (
      <div className="container max-w-6xl py-8">
        <Skeleton className="h-12 w-64" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-3xl" />)}
        </div>
        <Skeleton className="mt-8 h-80 rounded-3xl" />
      </div>
    );
  }

  const isEmpty = sessions.length === 0 && attempts.length === 0;

  return (
    <div className="container max-w-6xl py-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold md:text-4xl flex items-center gap-2">
          Learning Analytics <Sparkles className="h-7 w-7 text-highlight" />
        </h1>
        <p className="mt-1 text-muted-foreground">Track your study habits, accuracy, and topic mastery.</p>
      </div>

      {isEmpty && (
        <Card className="mt-6 rounded-3xl border-dashed bg-card/50 p-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-display text-xl font-bold">No data yet</h3>
          <p className="mt-1 text-muted-foreground">Open a lecture and review some flashcards — your stats will appear here.</p>
        </Card>
      )}

      {/* Stat cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="rounded-3xl border-border/50 p-5 shadow-card">
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-2xl ${s.color}`}>
                <s.Icon className="h-5 w-5" />
              </div>
              <div className="font-display text-2xl font-extrabold">{s.value}</div>
              <div className="text-sm text-muted-foreground">{s.label}</div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Heatmap calendar */}
      <div className="mt-6">
        <StudyHeatmap sessions={sessions} weeks={12} />
      </div>

      {/* AI weak topic coach */}
      <div className="mt-6">
        <WeakTopicCoach />
      </div>

      {/* Charts */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card className="rounded-3xl border-border/50 p-6 shadow-card">
          <h3 className="font-display text-lg font-extrabold">Study time — last 7 days</h3>
          <p className="text-xs text-muted-foreground">Minutes spent studying per day</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={studyByDay} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="studyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="minutes" stroke="hsl(var(--primary))" strokeWidth={3} fill="url(#studyFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="rounded-3xl border-border/50 p-6 shadow-card">
          <h3 className="font-display text-lg font-extrabold">Quiz accuracy — last 7 days</h3>
          <p className="text-xs text-muted-foreground">Percentage of correct answers per day</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={accuracyByDay} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} domain={[0, 100]} />
                <Tooltip
                  formatter={(v: number) => [`${v}%`, "Accuracy"]}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="accuracy" radius={[8, 8, 0, 0]}>
                  {accuracyByDay.map((d, i) => (
                    <Cell
                      key={i}
                      fill={d.accuracy >= 70 ? "hsl(var(--success))" : d.accuracy >= 40 ? "hsl(var(--highlight))" : "hsl(var(--destructive))"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Topic strength */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="rounded-3xl border-border/50 p-6 shadow-card">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-success-soft text-success">
              <Trophy className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-lg font-extrabold">Strongest topics</h3>
              <p className="text-xs text-muted-foreground">≥ 70% accuracy</p>
            </div>
          </div>
          {strong.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">No strong topics yet — keep practicing!</p>
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={strong} layout="vertical" margin={{ top: 5, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis type="category" dataKey="topic" width={110} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip
                    formatter={(v: number) => [`${v}%`, "Accuracy"]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                  />
                  <Bar dataKey="accuracy" fill="hsl(var(--success))" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="rounded-3xl border-border/50 p-6 shadow-card">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <Brain className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-lg font-extrabold">Topics to revisit</h3>
              <p className="text-xs text-muted-foreground">&lt; 70% accuracy — focus here</p>
            </div>
          </div>
          {weak.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Nothing weak yet — great work! 🎉</p>
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weak} layout="vertical" margin={{ top: 5, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis type="category" dataKey="topic" width={110} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip
                    formatter={(v: number) => [`${v}%`, "Accuracy"]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                  />
                  <Bar dataKey="accuracy" fill="hsl(var(--destructive))" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Activity breakdown */}
      {sessions.length > 0 && (
        <Card className="mt-6 rounded-3xl border-border/50 p-6 shadow-card">
          <h3 className="font-display text-lg font-extrabold">Activity breakdown</h3>
          <p className="text-xs text-muted-foreground">Where your study time goes</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={Object.entries(
                    sessions.reduce<Record<string, number>>((acc, s) => {
                      const k = s.activity || "view";
                      acc[k] = (acc[k] ?? 0) + (Number(s.minutes) || 0);
                      return acc;
                    }, {}),
                  ).map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(e) => `${e.name} (${e.value}m)`}
                >
                  {["hsl(var(--primary))", "hsl(var(--ai))", "hsl(var(--success))", "hsl(var(--highlight))"].map((c, i) => (
                    <Cell key={i} fill={c} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
};

export default Analytics;
