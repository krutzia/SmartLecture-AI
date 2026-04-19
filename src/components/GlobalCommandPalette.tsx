import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookMarked, Lightbulb, Layers, Search, ArrowRight, LayoutDashboard, Upload as UploadIcon, BarChart3, Settings as SettingsIcon, ListChecks, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useAuth } from "@/contexts/AuthContext";

type Lecture = { id: string; title: string };
type Concept = { id: string; term: string; lecture_id: string; definition: string | null };
type Flashcard = { id: string; question: string; lecture_id: string };

const NAV_ITEMS = [
  { label: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { label: "Upload lecture", url: "/upload", icon: UploadIcon },
  { label: "My Library", url: "/library", icon: BookMarked },
  { label: "Daily Review", url: "/review", icon: ListChecks },
  { label: "Analytics", url: "/analytics", icon: BarChart3 },
  { label: "Settings", url: "/settings", icon: SettingsIcon },
];

export const GlobalCommandPalette = () => {
  const [open, setOpen] = useState(false);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loaded, setLoaded] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Cmd+K / Ctrl+K toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Lazy-load search corpus the first time the palette opens
  useEffect(() => {
    if (!open || loaded || !user) return;
    let cancelled = false;
    (async () => {
      const [{ data: l }, { data: c }, { data: f }] = await Promise.all([
        supabase.from("lectures").select("id,title").order("created_at", { ascending: false }).limit(200),
        supabase.from("concepts").select("id,term,lecture_id,definition").limit(500),
        supabase.from("flashcards").select("id,question,lecture_id").limit(500),
      ]);
      if (cancelled) return;
      setLectures((l ?? []) as Lecture[]);
      setConcepts((c ?? []) as Concept[]);
      setFlashcards((f ?? []) as Flashcard[]);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [open, loaded, user]);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const lectureTitle = (id: string) => lectures.find((l) => l.id === id)?.title ?? "Lecture";

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search lectures, concepts, flashcards..." />
      <CommandList>
        <CommandEmpty>
          {!loaded ? "Loading..." : "No results found."}
        </CommandEmpty>

        <CommandGroup heading="Navigation">
          {NAV_ITEMS.map((item) => (
            <CommandItem key={item.url} value={`nav ${item.label}`} onSelect={() => go(item.url)}>
              <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>{item.label}</span>
              <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            </CommandItem>
          ))}
        </CommandGroup>

        {lectures.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Lectures (${lectures.length})`}>
              {lectures.slice(0, 50).map((l) => (
                <CommandItem
                  key={`l-${l.id}`}
                  value={`lecture ${l.title}`}
                  onSelect={() => go(`/lecture/${l.id}`)}
                >
                  <BookMarked className="mr-2 h-4 w-4 text-primary" />
                  <span className="truncate">{l.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {concepts.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Concepts (${concepts.length})`}>
              {concepts.slice(0, 80).map((c) => (
                <CommandItem
                  key={`c-${c.id}`}
                  value={`concept ${c.term} ${c.definition ?? ""}`}
                  onSelect={() => go(`/lecture/${c.lecture_id}?tab=concepts`)}
                >
                  <Lightbulb className="mr-2 h-4 w-4 text-ai" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{c.term}</span>
                    <span className="truncate text-xs text-muted-foreground">in {lectureTitle(c.lecture_id)}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {flashcards.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Flashcards (${flashcards.length})`}>
              {flashcards.slice(0, 80).map((f) => (
                <CommandItem
                  key={`f-${f.id}`}
                  value={`flashcard ${f.question}`}
                  onSelect={() => go(`/lecture/${f.lecture_id}?tab=flashcards`)}
                >
                  <Layers className="mr-2 h-4 w-4 text-success" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{f.question}</span>
                    <span className="truncate text-xs text-muted-foreground">in {lectureTitle(f.lecture_id)}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
};
