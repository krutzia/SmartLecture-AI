import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeMouseHandler,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Brain, Sparkles, Loader2, BookOpen, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Concept = {
  id: string;
  term: string;
  definition: string | null;
  kind: string | null;
  cluster: string | null;
};
type Lecture = { title: string };

// Distinct, design-system-friendly cluster colors
const CLUSTER_PALETTE: { bg: string; border: string; color: string; ring: string }[] = [
  { bg: "hsl(var(--primary-soft))", border: "hsl(var(--primary))", color: "hsl(var(--primary))", ring: "hsl(var(--primary))" },
  { bg: "hsl(var(--ai-soft))", border: "hsl(var(--ai))", color: "hsl(var(--ai))", ring: "hsl(var(--ai))" },
  { bg: "hsl(var(--success-soft))", border: "hsl(var(--success))", color: "hsl(var(--success))", ring: "hsl(var(--success))" },
  { bg: "hsl(var(--accent))", border: "hsl(var(--highlight))", color: "hsl(var(--accent-foreground))", ring: "hsl(var(--highlight))" },
  { bg: "hsl(258 80% 92%)", border: "hsl(280 75% 60%)", color: "hsl(280 60% 40%)", ring: "hsl(280 75% 60%)" },
  { bg: "hsl(190 70% 92%)", border: "hsl(190 70% 50%)", color: "hsl(190 70% 35%)", ring: "hsl(190 70% 50%)" },
];

export const MindMapTab = ({ lectureId }: { lectureId: string }) => {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [loading, setLoading] = useState(true);
  const [clustering, setClustering] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);

  const load = useCallback(async () => {
    const [{ data: c }, { data: l }] = await Promise.all([
      supabase
        .from("concepts")
        .select("id,term,definition,kind,cluster")
        .eq("lecture_id", lectureId)
        .order("created_at"),
      supabase.from("lectures").select("title").eq("id", lectureId).maybeSingle(),
    ]);
    setConcepts((c ?? []) as Concept[]);
    setLecture(l);
    setLoading(false);
  }, [lectureId]);

  useEffect(() => {
    load();
  }, [load]);

  const runClustering = async () => {
    setClustering(true);
    try {
      const { error } = await supabase.functions.invoke("cluster-concepts", { body: { lectureId } });
      if (error) throw error;
      await load();
      toast({ title: "Mind map enhanced ✨", description: "Concepts grouped into clusters." });
    } catch (e: any) {
      toast({
        title: "Couldn't cluster concepts",
        description: e?.message ?? "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setClustering(false);
    }
  };

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      if (node.id === "root" || node.id.startsWith("cluster-")) return;
      const c = concepts.find((x) => x.id === node.id);
      if (c) setSelectedConcept(c);
    },
    [concepts],
  );

  const quizMeOnConcept = async () => {
    if (!selectedConcept) return;
    setGeneratingQuiz(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-quiz", {
        body: { lectureId, numQuestions: 5, focusTopic: selectedConcept.term },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({
        title: "Focused quiz ready! 🎯",
        description: `Open the Quiz tab to start "${selectedConcept.term}".`,
      });
      setSelectedConcept(null);
    } catch (e: any) {
      toast({
        title: "Couldn't generate quiz",
        description: e?.message ?? "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setGeneratingQuiz(false);
    }
  };

  // Build cluster index + palette mapping (stable order based on first appearance)
  const { clusterOrder, clusterColor } = useMemo(() => {
    const order: string[] = [];
    concepts.forEach((c) => {
      const k = c.cluster ?? "Other";
      if (!order.includes(k)) order.push(k);
    });
    const color: Record<string, (typeof CLUSTER_PALETTE)[number]> = {};
    order.forEach((k, i) => (color[k] = CLUSTER_PALETTE[i % CLUSTER_PALETTE.length]));
    return { clusterOrder: order, clusterColor: color };
  }, [concepts]);

  const hasClusters = useMemo(() => concepts.some((c) => !!c.cluster), [concepts]);

  // Co-mention edges: concept A mentions concept B's term in its definition
  const coMentionEdges = useMemo<Edge[]>(() => {
    if (concepts.length < 2) return [];
    const edges: Edge[] = [];
    const seen = new Set<string>();
    for (const a of concepts) {
      const def = (a.definition ?? "").toLowerCase();
      if (!def) continue;
      for (const b of concepts) {
        if (a.id === b.id) continue;
        const term = b.term.toLowerCase().trim();
        if (term.length < 3) continue;
        const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
        if (!re.test(def)) continue;
        const key = [a.id, b.id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({
          id: `co-${key}`,
          source: a.id,
          target: b.id,
          style: { stroke: "hsl(var(--ai) / 0.5)", strokeDasharray: "4 4", strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.Arrow, color: "hsl(var(--ai))" },
        });
      }
    }
    return edges;
  }, [concepts]);

  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (concepts.length === 0) return { nodes: [], edges: [] };

    const root: Node = {
      id: "root",
      data: { label: lecture?.title ?? "Lecture" },
      position: { x: 0, y: 0 },
      style: {
        background: "hsl(var(--primary))",
        color: "hsl(var(--primary-foreground))",
        border: "2px solid hsl(var(--primary))",
        borderRadius: 24,
        padding: "14px 22px",
        fontWeight: 800,
        fontFamily: "Nunito, sans-serif",
        fontSize: 16,
        boxShadow: "var(--shadow-playful)",
        minWidth: 180,
        textAlign: "center",
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };

    const childNodes: Node[] = [];
    const treeEdges: Edge[] = [];

    if (hasClusters) {
      // Cluster layout: each cluster gets its own ring around the root
      const numClusters = clusterOrder.length;
      const clusterRadius = Math.max(360, numClusters * 80);
      clusterOrder.forEach((cl, ci) => {
        const cAngle = (ci / Math.max(1, numClusters)) * Math.PI * 2 - Math.PI / 2;
        const cx = Math.cos(cAngle) * clusterRadius;
        const cy = Math.sin(cAngle) * clusterRadius;
        const palette = clusterColor[cl];

        // Cluster header node
        const clusterId = `cluster-${ci}`;
        childNodes.push({
          id: clusterId,
          data: { label: `${cl}` },
          position: { x: cx, y: cy },
          style: {
            background: palette.border,
            color: "white",
            border: `2px solid ${palette.border}`,
            borderRadius: 999,
            padding: "8px 16px",
            fontWeight: 800,
            fontFamily: "Nunito, sans-serif",
            fontSize: 12,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            boxShadow: "var(--shadow-card)",
            textAlign: "center",
          },
        });
        treeEdges.push({
          id: `e-root-${clusterId}`,
          source: "root",
          target: clusterId,
          animated: true,
          style: { stroke: `${palette.border}`, strokeWidth: 2.5, opacity: 0.7 },
          markerEnd: { type: MarkerType.ArrowClosed, color: palette.border },
        });

        const items = concepts.filter((c) => (c.cluster ?? "Other") === cl);
        const itemRadius = Math.max(140, items.length * 22);
        items.forEach((c, i) => {
          // Spread items in a small arc centered on the cluster direction
          const arcSpan = Math.PI / 1.5;
          const arcStart = cAngle - arcSpan / 2;
          const t = items.length === 1 ? 0.5 : i / (items.length - 1);
          const a = arcStart + t * arcSpan;
          const x = cx + Math.cos(a) * itemRadius;
          const y = cy + Math.sin(a) * itemRadius;
          childNodes.push({
            id: c.id,
            data: { label: c.term },
            position: { x, y },
            style: {
              background: palette.bg,
              color: palette.color,
              border: `2px solid ${palette.border}`,
              borderRadius: 16,
              padding: "10px 16px",
              fontWeight: 700,
              fontFamily: "Nunito, sans-serif",
              fontSize: 13,
              boxShadow: "var(--shadow-card)",
              maxWidth: 220,
              textAlign: "center",
            },
          });
          treeEdges.push({
            id: `e-${clusterId}-${c.id}`,
            source: clusterId,
            target: c.id,
            style: { stroke: `${palette.border}`, strokeWidth: 1.75, opacity: 0.55 },
            markerEnd: { type: MarkerType.ArrowClosed, color: palette.border },
          });
        });
      });
    } else {
      // Fallback: simple radial layout (no clusters yet)
      const radius = Math.max(260, concepts.length * 18);
      concepts.forEach((c, i) => {
        const angle = (i / concepts.length) * Math.PI * 2 - Math.PI / 2;
        const palette = CLUSTER_PALETTE[i % CLUSTER_PALETTE.length];
        childNodes.push({
          id: c.id,
          data: { label: c.term },
          position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
          style: {
            background: palette.bg,
            color: palette.color,
            border: `2px solid ${palette.border}`,
            borderRadius: 16,
            padding: "10px 16px",
            fontWeight: 700,
            fontFamily: "Nunito, sans-serif",
            fontSize: 13,
            boxShadow: "var(--shadow-card)",
            maxWidth: 220,
            textAlign: "center",
          },
        });
        treeEdges.push({
          id: `e-root-${c.id}`,
          source: "root",
          target: c.id,
          animated: true,
          style: { stroke: "hsl(var(--primary) / 0.45)", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" },
        });
      });
    }

    return { nodes: [root, ...childNodes], edges: [...treeEdges, ...coMentionEdges] };
  }, [concepts, lecture, hasClusters, clusterOrder, clusterColor, coMentionEdges]);

  if (loading) return <Skeleton className="h-[600px] rounded-3xl" />;

  if (concepts.length === 0) {
    return (
      <Card className="rounded-3xl p-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ai-soft text-ai">
          <Brain className="h-6 w-6" />
        </div>
        <h3 className="font-display text-xl font-bold">No concepts to map yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">Add concepts to your lecture to generate a mind map.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-3xl border-border/50 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-gradient-cream px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-ai text-white">
            <Brain className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-extrabold leading-none">Concept Mind Map</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {concepts.length} concepts
              {hasClusters && ` · ${clusterOrder.length} clusters`}
              {coMentionEdges.length > 0 && ` · ${coMentionEdges.length} links`}
            </p>
          </div>
        </div>
        <Button onClick={runClustering} disabled={clustering} size="sm" className="rounded-full">
          {clustering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {hasClusters ? "Re-cluster with AI" : "Cluster with AI"}
        </Button>
      </div>

      {hasClusters && (
        <div className="flex flex-wrap gap-2 border-b border-border/50 bg-card px-5 py-3">
          {clusterOrder.map((cl) => {
            const p = clusterColor[cl];
            return (
              <span
                key={cl}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
                style={{ background: p.bg, color: p.color, border: `1px solid ${p.border}` }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: p.border }} />
                {cl}
              </span>
            );
          })}
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-0.5 w-6 border-t-2 border-dashed" style={{ borderColor: "hsl(var(--ai))" }} />
            mention link
          </span>
        </div>
      )}

      <div style={{ height: 600 }} className="bg-background">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="hsl(var(--border))" gap={20} />
          <Controls className="!rounded-xl !border-border !bg-card !shadow-card" />
          <MiniMap
            pannable
            zoomable
            maskColor="hsl(var(--muted) / 0.6)"
            nodeColor={(n) => (n.id === "root" ? "hsl(var(--primary))" : "hsl(var(--ai))")}
            className="!rounded-xl !border-border !bg-card"
          />
        </ReactFlow>
      </div>
    </Card>
  );
};
