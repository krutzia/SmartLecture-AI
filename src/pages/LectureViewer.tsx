import { getDeviceId } from "@/lib/deviceId";
import { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, FileText, Sparkles, Lightbulb, Layers, MessageCircle, Loader2, AlertCircle, Network, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TranscriptTab } from "@/components/lecture/TranscriptTab";
import { SummaryTab } from "@/components/lecture/SummaryTab";
import { ConceptsTab } from "@/components/lecture/ConceptsTab";
import { FlashcardsTab } from "@/components/lecture/FlashcardsTab";
import { ChatTab } from "@/components/lecture/ChatTab";
import { MindMapTab } from "@/components/lecture/MindMapTab";
import { QuizTab } from "@/components/lecture/QuizTab";

type Lecture = { id: string; title: string; status: string; source_type: string; error_message: string | null };

const VALID_TABS = ["summary", "concepts", "mindmap", "flashcards", "quiz", "transcript", "chat"];

const LectureViewer = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : "summary";
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [loading, setLoading] = useState(true);

  // Sync ?tab= param → state (e.g. Mind Map → quiz jump)
  useEffect(() => {
    if (tabParam && VALID_TABS.includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

  const handleTabChange = (v: string) => {
    setActiveTab(v);
    const next = new URLSearchParams(searchParams);
    if (v === "summary") next.delete("tab");
    else next.set("tab", v);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data } = await supabase.from("lectures").select("id,title,status,source_type,error_message").eq("id", id).maybeSingle();
      setLecture(data);
      setLoading(false);
      // Record this lecture as a recent visit for the Cmd+K palette.
      if (data?.status === "done") {
        const user = { id: getDeviceId() };
        if (user) {
          const { pushRecent } = await import("@/lib/palettePrefs");
          pushRecent(user.id, data.id);
        }
      }
    };
    load();
    const ch = supabase.channel(`lecture-${id}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "lectures", filter: `id=eq.${id}` }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  // Track study time while viewing a "done" lecture
  useEffect(() => {
    if (!id || lecture?.status !== "done") return;
    const start = Date.now();
    const log = async () => {
      const minutes = (Date.now() - start) / 60000;
      if (minutes < 0.1) return;
      const user = { id: getDeviceId() };
      if (!user) return;
      await supabase.from("study_sessions").insert({
        user_id: user.id,
        lecture_id: id,
        activity: "view",
        minutes: Math.round(minutes * 10) / 10,
      });
    };
    const onHide = () => { if (document.visibilityState === "hidden") log(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      log();
    };
  }, [id, lecture?.status]);

  if (loading) {
    return (
      <div className="container py-8">
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!lecture) {
    return (
      <div className="container py-12 text-center">
        <h1 className="font-display text-2xl font-bold">Lecture not found</h1>
        <Button asChild className="mt-4 rounded-full"><Link to="/library">Back to library</Link></Button>
      </div>
    );
  }

  const isProcessing = !["done", "error"].includes(lecture.status);

  return (
    <div className="container max-w-6xl py-6">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/library"><ArrowLeft className="mr-1 h-4 w-4" /> Library</Link>
      </Button>

      <h1 className="font-display text-3xl font-extrabold md:text-4xl">{lecture.title}</h1>

      {isProcessing && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="mt-6 rounded-3xl border-ai/20 bg-ai-soft p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-ai text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <h3 className="mt-4 font-display text-xl font-bold text-ai-foreground/90">
              {lecture.status === "uploading" && "Uploading..."}
              {lecture.status === "extracting" && "Extracting content..."}
              {lecture.status === "transcribing" && "Transcribing your lecture..."}
              {lecture.status === "summarizing" && "Summarizing & generating flashcards..."}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">This usually takes under a minute. Hang tight ✨</p>
          </Card>
        </motion.div>
      )}

      {lecture.status === "error" && (
        <Card className="mt-6 rounded-3xl border-destructive/30 bg-destructive/5 p-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <div>
              <h3 className="font-bold">Something went wrong</h3>
              <p className="mt-1 text-sm text-muted-foreground">{lecture.error_message ?? "Please try again."}</p>
            </div>
          </div>
        </Card>
      )}

      {lecture.status === "done" && (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-6">
          <TabsList className="grid w-full grid-cols-4 rounded-full bg-muted p-1 sm:grid-cols-7">
            <TabsTrigger value="summary" className="rounded-full gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Summary</TabsTrigger>
            <TabsTrigger value="concepts" className="rounded-full gap-1.5"><Lightbulb className="h-3.5 w-3.5" /> Concepts</TabsTrigger>
            <TabsTrigger value="mindmap" className="rounded-full gap-1.5"><Network className="h-3.5 w-3.5" /> Mind Map</TabsTrigger>
            <TabsTrigger value="flashcards" className="rounded-full gap-1.5"><Layers className="h-3.5 w-3.5" /> Cards</TabsTrigger>
            <TabsTrigger value="quiz" className="rounded-full gap-1.5"><ListChecks className="h-3.5 w-3.5" /> Quiz</TabsTrigger>
            <TabsTrigger value="transcript" className="rounded-full gap-1.5"><FileText className="h-3.5 w-3.5" /> Transcript</TabsTrigger>
            <TabsTrigger value="chat" className="rounded-full gap-1.5"><MessageCircle className="h-3.5 w-3.5" /> Chat</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-6"><SummaryTab lectureId={lecture.id} /></TabsContent>
          <TabsContent value="concepts" className="mt-6"><ConceptsTab lectureId={lecture.id} /></TabsContent>
          <TabsContent value="mindmap" className="mt-6"><MindMapTab lectureId={lecture.id} /></TabsContent>
          <TabsContent value="flashcards" className="mt-6"><FlashcardsTab lectureId={lecture.id} /></TabsContent>
          <TabsContent value="quiz" className="mt-6"><QuizTab lectureId={lecture.id} /></TabsContent>
          <TabsContent value="transcript" className="mt-6"><TranscriptTab lectureId={lecture.id} /></TabsContent>
          <TabsContent value="chat" className="mt-6"><ChatTab lectureId={lecture.id} lectureTitle={lecture.title} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default LectureViewer;
