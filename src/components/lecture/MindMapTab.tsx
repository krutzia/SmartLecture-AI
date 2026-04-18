import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain } from "lucide-react";

type Concept = { id: string; term: string; definition: string | null; kind: string | null };
type Lecture = { title: string };

const kindStyle = (kind: string | null) => {
  switch (kind) {
    case "definition":
      return { bg: "hsl(var(--ai-soft))", border: "hsl(var(--ai))", color: "hsl(var(--ai))" };
    case "keyword":
      return { bg: "hsl(var(--accent))", border: "hsl(var(--highlight))", color: "hsl(var(--accent-foreground))" };
    default:
      return { bg: "hsl(var(--primary-soft))", border: "hsl(var(--primary))", color: "hsl(var(--primary))" };
  }
};

export const MindMapTab = ({ lectureId }: { lectureId: string }) => {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [{ data: c }, { data: l }] = await Promise.all([
        supabase.from("concepts").select("id,term,definition,kind").eq("lecture_id", lectureId).order("created_at"),
        supabase.from("lectures").select("title").eq("id", lectureId).maybeSingle(),
      ]);
      setConcepts(c ?? []);
      setLecture(l);
      setLoading(false);
    };
    load();
  }, [lectureId]);

  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (concepts.length === 0) return { nodes: [], edges: [] };

    const centerX = 0;
    const centerY = 0;
    const rootStyle = {
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
      textAlign: "center" as const,
    };

    const root: Node = {
      id: "root",
      data: { label: lecture?.title ?? "Lecture" },
      position: { x: centerX, y: centerY },
      style: rootStyle,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };

    const radius = Math.max(260, concepts.length * 18);
    const childNodes: Node[] = concepts.map((c, i) => {
      const angle = (i / concepts.length) * Math.PI * 2 - Math.PI / 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      const s = kindStyle(c.kind);
      return {
        id: c.id,
        data: { label: c.term },
        position: { x, y },
        style: {
          background: s.bg,
          color: s.color,
          border: `2px solid ${s.border}`,
          borderRadius: 16,
          padding: "10px 16px",
          fontWeight: 700,
          fontFamily: "Nunito, sans-serif",
          fontSize: 13,
          boxShadow: "var(--shadow-card)",
          maxWidth: 220,
          textAlign: "center" as const,
        },
      };
    });

    const childEdges: Edge[] = concepts.map((c) => ({
      id: `e-root-${c.id}`,
      source: "root",
      target: c.id,
      animated: true,
      style: { stroke: "hsl(var(--primary) / 0.45)", strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" },
    }));

    return { nodes: [root, ...childNodes], edges: childEdges };
  }, [concepts, lecture]);

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
      <div className="flex items-center gap-2 border-b border-border/50 bg-gradient-cream px-5 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-ai text-white">
          <Brain className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-display text-base font-extrabold leading-none">Concept Mind Map</h3>
          <p className="mt-1 text-xs text-muted-foreground">Drag nodes • scroll to zoom • {concepts.length} concepts</p>
        </div>
      </div>
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
