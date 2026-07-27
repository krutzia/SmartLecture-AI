import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookMarked,
  Lightbulb,
  Layers,
  ArrowRight,
  LayoutDashboard,
  Upload as UploadIcon,
  BarChart3,
  Settings as SettingsIcon,
  ListChecks,
  Pin,
  PinOff,
  Clock,
  Star,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  getRecent,
  getPinned,
  togglePinned,
} from "@/lib/palettePrefs";

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
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
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

  // Refresh recents/pinned from localStorage every time the palette opens
  useEffect(() => {
    if (!open || !user) return;
    setRecentIds(getRecent(user.id));
    setPinnedIds(getPinned(user.id));
  }, [open, user]);

  // Lazy-load search corpus the first time the palette opens
  useEffect(() => {
    if (!open || loaded || !user) return;
    let cancelled = false;
    (async () => {
      const [{ data: l }, { data: c }, { data: f }] = await Promise.all([
        supabase.from("lectures").select("id,title").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
        supabase.from("concepts").select("id,term,lecture_id,definition").eq("user_id", user.id).limit(500),
        supabase.from("flashcards").select("id,question,lecture_id").eq("user_id", user.id).limit(500),
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

  const lectureById = useCallback(
    (id: string) => lectures.find((l) => l.id === id),
    [lectures],
  );
  const lectureTitle = (id: string) => lectureById(id)?.title ?? "Lecture";

  const handleTogglePin = (e: React.MouseEvent, lectureId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    const nowPinned = togglePinned(user.id, lectureId);
    setPinnedIds(getPinned(user.id));
    toast({
      title: nowPinned ? "Pinned" : "Unpinned",
      description: lectureTitle(lectureId),
    });
  };

  // Resolve pinned/recent into actual lecture objects, filtering missing ones
  const pinnedLectures = pinnedIds
    .map((id) => lectureById(id))
    .filter((l): l is Lecture => Boolean(l));
  const recentLectures = recentIds
    .filter((id) => !pinnedIds.includes(id))
    .map((id) => lectureById(id))
    .filter((l): l is Lecture => Boolean(l))
    .slice(0, 5);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search lectures, concepts, flashcards..." />
      <CommandList>
        <CommandEmpty>
          {!loaded ? "Loading..." : "No results found."}
        </CommandEmpty>

        {pinnedLectures.length > 0 && (
          <CommandGroup heading="📌 Pinned">
            {pinnedLectures.map((l) => (
              <CommandItem
                key={`pin-${l.id}`}
                value={`pinned ${l.title}`}
                onSelect={() => go(`/lecture/${l.id}`)}
              >
                <Star className="mr-2 h-4 w-4 fill-highlight text-highlight" />
                <span className="truncate">{l.title}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-7 w-7"
                  onClick={(e) => handleTogglePin(e, l.id)}
                  aria-label="Unpin"
                >
                  <PinOff className="h-3.5 w-3.5" />
                </Button>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {recentLectures.length > 0 && (
          <>
            {pinnedLectures.length > 0 && <CommandSeparator />}
            <CommandGroup heading="🕒 Recent">
              {recentLectures.map((l) => (
                <CommandItem
                  key={`recent-${l.id}`}
                  value={`recent ${l.title}`}
                  onSelect={() => go(`/lecture/${l.id}`)}
                >
                  <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{l.title}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-7 w-7"
                    onClick={(e) => handleTogglePin(e, l.id)}
                    aria-label="Pin"
                  >
                    <Pin className="h-3.5 w-3.5" />
                  </Button>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {(pinnedLectures.length > 0 || recentLectures.length > 0) && (
          <CommandSeparator />
        )}

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
              {lectures.slice(0, 50).map((l) => {
                const pinned = pinnedIds.includes(l.id);
                return (
                  <CommandItem
                    key={`l-${l.id}`}
                    value={`lecture ${l.title}`}
                    onSelect={() => go(`/lecture/${l.id}`)}
                  >
                    <BookMarked className="mr-2 h-4 w-4 text-primary" />
                    <span className="truncate">{l.title}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-7 w-7"
                      onClick={(e) => handleTogglePin(e, l.id)}
                      aria-label={pinned ? "Unpin" : "Pin"}
                    >
                      {pinned ? (
                        <PinOff className="h-3.5 w-3.5 text-highlight" />
                      ) : (
                        <Pin className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </CommandItem>
                );
              })}
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
