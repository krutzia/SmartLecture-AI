import { useEffect, useState } from "react";
import { supabase } from "@/lib/localStore";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

export const TranscriptTab = ({ lectureId }: { lectureId: string }) => {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("transcripts").select("full_text").eq("lecture_id", lectureId).maybeSingle();
      setText(data?.full_text ?? "");
      setLoading(false);
    };
    load();
  }, [lectureId]);

  if (loading) return <Skeleton className="h-96 rounded-3xl" />;
  if (!text) return <Card className="rounded-3xl p-8 text-center text-muted-foreground">No transcript yet.</Card>;

  return (
    <Card className="rounded-3xl border-border/50 p-6 shadow-card">
      <ScrollArea className="h-[60vh] pr-4">
        <div className="whitespace-pre-wrap leading-relaxed text-foreground/90">{text}</div>
      </ScrollArea>
    </Card>
  );
};
