import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Send,
  Sparkles,
  HelpCircle,
  X,
  PanelRightOpen,
  Bookmark,
  BookmarkCheck,
  Keyboard,
  Activity,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/localStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import {
  bestExcerptLine,
  bestMatchingSlide,
  classifyCommand,
  clearEvents,
  getBookmarks,
  getEvents,
  logEvent,
  summarize,
  toggleBookmark,
  type SlideBookmark,
} from "@/lib/chatTelemetry";

type Msg = { role: "user" | "assistant"; content: string };

async function loadTranscript(lectureId: string): Promise<string> {
  const { data } = await supabase.from("transcripts").select("full_text").eq("lecture_id", lectureId).maybeSingle();
  return (data as any)?.full_text ?? "";
}

const QUICK_ACTIONS = [
  "Explain slide 1",
  "Summarize again",
  "Give me examples",
  "Ask me questions",
  "What did the professor say about…",
];

const COMMANDS: { cmd: string; what: string; example: string }[] = [
  { cmd: "Explain slide N", what: "Deep-dive one slide with a quoted excerpt", example: "Explain slide 12" },
  { cmd: "Summarize again", what: "A fresh TL;DR + key bullets, any depth", example: "Summarize again, simpler" },
  { cmd: "What did the professor say about X", what: "Finds and quotes the transcript", example: "What did the professor say about TCP?" },
  { cmd: "Give me examples", what: "Concrete examples from the lecture", example: "Give me examples of hashing" },
  { cmd: "Ask me questions", what: "Socratic quiz, one question at a time", example: "Ask me questions" },
  { cmd: "Compare X and Y", what: "Contrast two concepts from the lecture", example: "Compare TCP and UDP" },
];

const SHORTCUTS: { keys: string; what: string }[] = [
  { keys: "?", what: "Toggle this commands panel" },
  { keys: "g", what: "Focus the “go to slide” box" },
  { keys: "[ / ]", what: "Previous / next slide" },
  { keys: "b", what: "Bookmark the open slide" },
  { keys: "Esc", what: "Close the slide panel" },
  { keys: "/", what: "Focus the chat input" },
];

const CITATION_RE = /\[\[slide:(\d+)\]\]/g;

const isTypingTarget = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable;
};

export const ChatTab = ({ lectureId, lectureTitle }: { lectureId: string; lectureTitle: string }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [slides, setSlides] = useState<string[]>([]);
  const [activeSlide, setActiveSlide] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  const [slideInput, setSlideInput] = useState("");
  const [bookmarks, setBookmarks] = useState<SlideBookmark[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [statsTick, setStatsTick] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const slideInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const excerptRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const slidesRef = useRef<string[]>([]);
  slidesRef.current = slides;

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("chat_messages").select("role,content").eq("lecture_id", lectureId).order("created_at");
      if (data) setMessages(data.map((d) => ({ role: d.role as any, content: d.content })));
    };
    load();
  }, [lectureId]);

  // Bookmarks + telemetry stay in sync across tabs/components.
  useEffect(() => {
    const sync = () => {
      setBookmarks(getBookmarks(lectureId));
      setStatsTick((t) => t + 1);
    };
    sync();
    window.addEventListener("lecture-chat-telemetry", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("lecture-chat-telemetry", sync);
      window.removeEventListener("storage", sync);
    };
  }, [lectureId]);

  const stats = useMemo(() => summarize(getEvents(lectureId)), [lectureId, statsTick]);

  // Load the slide/section index so citations and "jump to slide" can show content.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadSlides = async () => {
      try {
        const transcript = await loadTranscript(lectureId);
        const resp = await fetch("/api/chat-with-lecture", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ lectureId, userId: user.id, mode: "slides", transcript }),
        });
        if (!resp.ok) return;
        const json = await resp.json();
        if (!cancelled && Array.isArray(json.slides)) setSlides(json.slides);
      } catch {
        /* slide panel is optional */
      }
    };
    loadSlides();
    return () => { cancelled = true; };
  }, [lectureId, user?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Scroll the panel (and the cited excerpt) into view whenever it changes.
  useEffect(() => {
    if (activeSlide === null) return;
    const id = window.setTimeout(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      excerptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    return () => window.clearTimeout(id);
  }, [activeSlide, highlight]);

  /**
   * Opens the slide panel. Falls back to the closest / best-matching slide when
   * the requested number is missing, out of range, or its excerpt is empty.
   */
  const openSlide = useCallback(
    (n: number, opts: { query?: string; source?: "citation" | "jump" | "auto" | "bookmark" } = {}) => {
      const list = slidesRef.current;
      const source = opts.source ?? "auto";
      if (!list.length) {
        logEvent({ lectureId, type: source === "citation" ? "citation_click" : "slide_jump", name: `slide_${n}`, ok: false, detail: "no slides indexed" });
        toast({ title: "No slides indexed", description: "This lecture has no slide/section breakdown yet." });
        return;
      }

      let target = n;
      let note: string | null = null;

      const inRange = Number.isFinite(n) && n >= 1 && n <= list.length;
      const emptyContent = inRange && !(list[n - 1] ?? "").trim();

      if (!inRange || emptyContent) {
        const match = opts.query ? bestMatchingSlide(list, opts.query) : null;
        if (match && match.score > 0) {
          target = match.index + 1;
          note = `Slide ${n} ${inRange ? "had no content" : "doesn't exist"} — showing the closest match (slide ${target}).`;
        } else {
          target = Math.min(Math.max(Number.isFinite(n) ? n : 1, 1), list.length);
          note = `Slide ${n} ${inRange ? "had no content" : `is out of range (1-${list.length})`} — showing slide ${target} instead.`;
        }
      }

      setActiveSlide(target);
      setFallbackNote(note);
      setHighlight(opts.query ? bestExcerptLine(list[target - 1] ?? "", opts.query) : null);
      logEvent({
        lectureId,
        type: source === "citation" ? "citation_click" : "slide_jump",
        name: `slide_${n}`,
        ok: note === null,
        detail: note ?? undefined,
      });
    },
    [lectureId],
  );

  const send = async (text: string) => {
    if (!text.trim() || streaming || !user) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const command = classifyCommand(userMsg.content);
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    // "Explain slide N" opens the panel immediately, before the answer streams in.
    const slideCmd = userMsg.content.match(/slide\s+(\d+)/i);
    if (slideCmd) openSlide(Number(slideCmd[1]), { query: userMsg.content, source: "jump" });

    // Persist user message
    await supabase.from("chat_messages").insert({ lecture_id: lectureId, user_id: user.id, role: "user", content: userMsg.content });

    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const transcript = await loadTranscript(lectureId);
      const url = "/api/chat-with-lecture";
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ lectureId, userId: user.id, messages: newMessages, transcript }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) throw new Error("Rate limited — try again in a moment.");
        if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
        throw new Error("Chat failed");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const j = line.slice(6).trim();
          if (j === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(j);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) upsertAssistant(delta);
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }

      if (assistantSoFar) {
        await supabase.from("chat_messages").insert({ lecture_id: lectureId, user_id: user.id, role: "assistant", content: assistantSoFar });
        // Auto-open the slide panel on the first slide the answer cited.
        const first = CITATION_RE.exec(assistantSoFar);
        CITATION_RE.lastIndex = 0;
        if (first) {
          openSlide(Number(first[1]), { query: userMsg.content, source: "citation" });
        } else if (!slideCmd && /slide/i.test(userMsg.content)) {
          const match = bestMatchingSlide(slidesRef.current, userMsg.content);
          if (match) openSlide(match.index + 1, { query: userMsg.content, source: "auto" });
        }
      }
      logEvent({ lectureId, type: "command", name: command, ok: true });
    } catch (e: any) {
      logEvent({ lectureId, type: "command", name: command, ok: false, detail: e?.message });
      toast({ title: "Chat error", description: e?.message ?? "Try again", variant: "destructive" });
    } finally {
      setStreaming(false);
    }
  };

  const jumpToSlide = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(slideInput, 10);
    if (!Number.isFinite(n)) return;
    openSlide(n, { source: "jump" });
    send(`Explain slide ${n}`);
    setSlideInput("");
  };

  const bookmarkCurrent = useCallback(() => {
    if (activeSlide === null) return;
    const excerpt = highlight ?? (slidesRef.current[activeSlide - 1] ?? "");
    const added = toggleBookmark(lectureId, activeSlide, excerpt);
    logEvent({ lectureId, type: "bookmark", name: `slide_${activeSlide}`, ok: true, detail: added ? "added" : "removed" });
    toast({ title: added ? `Slide ${activeSlide} bookmarked` : `Bookmark removed`, description: added ? "Find it under Saved slides." : undefined });
  }, [activeSlide, highlight, lectureId]);

  // Keyboard shortcuts — never swallow keys while typing in chat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const typing = isTypingTarget(e.target);
      if (e.key === "Escape") {
        if (typing) (e.target as HTMLElement).blur();
        else if (activeSlide !== null) setActiveSlide(null);
        return;
      }
      if (typing) return;
      if (e.key === "?") { e.preventDefault(); setShowHelp((s) => !s); return; }
      if (e.key === "/") { e.preventDefault(); chatInputRef.current?.focus(); return; }
      if (e.key.toLowerCase() === "g") { e.preventDefault(); slideInputRef.current?.focus(); return; }
      if (e.key === "b" && activeSlide !== null) { e.preventDefault(); bookmarkCurrent(); return; }
      if (e.key === "[" && activeSlide !== null && activeSlide > 1) {
        e.preventDefault();
        openSlide(activeSlide - 1, { source: "jump" });
      }
      if (e.key === "]" && activeSlide !== null && activeSlide < slidesRef.current.length) {
        e.preventDefault();
        openSlide(activeSlide + 1, { source: "jump" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeSlide, bookmarkCurrent, openSlide]);

  const currentBookmarked = activeSlide !== null && bookmarks.some((b) => b.slide === activeSlide);
  const slideBody = activeSlide !== null ? slides[activeSlide - 1] ?? "" : "";
  const slideLines = useMemo(() => slideBody.split(/\n+/).map((l) => l.trim()).filter(Boolean), [slideBody]);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <Card className="flex h-[70vh] min-w-0 flex-1 flex-col rounded-3xl border-border/50 shadow-card">
        <div className="flex items-center gap-2 border-b border-border/50 px-5 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-ai text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-display font-bold leading-none">Study buddy</div>
            <div className="truncate text-xs text-muted-foreground">Knows "{lectureTitle}" cold</div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowBookmarks((s) => !s)}
              aria-pressed={showBookmarks}
            >
              <Bookmark className="h-4 w-4" />
              <span className="hidden sm:inline">Saved</span>
              {bookmarks.length > 0 && (
                <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary">{bookmarks.length}</span>
              )}
            </Button>
            {slides.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 lg:hidden"
                onClick={() => openSlide(activeSlide ?? 1, { source: "jump" })}
              >
                <PanelRightOpen className="h-4 w-4" />
                Slides
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowHelp((s) => !s)} className="gap-1.5">
              <HelpCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Commands</span>
            </Button>
          </div>
        </div>

        {showHelp && (
          <div className="max-h-[46vh] overflow-y-auto border-b border-border/50 bg-muted/40 px-5 py-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-display text-sm font-bold">What you can ask</div>
              <button onClick={() => setShowHelp(false)} aria-label="Close help" className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {COMMANDS.map((c) => (
                <li key={c.cmd} className="rounded-xl border border-border/50 bg-background/70 p-2.5">
                  <code className="text-xs font-semibold text-primary">{c.cmd}</code>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.what}</p>
                  <button
                    onClick={() => { setShowHelp(false); send(c.example); }}
                    disabled={streaming}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-foreground/80 underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    Try: “{c.example}”
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/50 bg-background/70 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
                  <Keyboard className="h-3.5 w-3.5" /> Keyboard shortcuts
                </div>
                <ul className="space-y-1">
                  {SHORTCUTS.map((s) => (
                    <li key={s.keys} className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">{s.keys}</kbd>
                      <span className="flex-1 text-right">{s.what}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] text-muted-foreground">Shortcuts pause while you're typing in a text field.</p>
              </div>

              <div className="rounded-xl border border-border/50 bg-background/70 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
                  <Activity className="h-3.5 w-3.5" /> Command usage
                </div>
                {stats.commands.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No commands used yet in this lecture.</p>
                ) : (
                  <ul className="space-y-1">
                    {stats.commands.map((c) => (
                      <li key={c.name} className="flex items-center justify-between gap-2 text-[11px]">
                        <code className="text-foreground/80">{c.name}</code>
                        <span className="text-muted-foreground">
                          {c.uses} use{c.uses === 1 ? "" : "s"}
                          {c.failures > 0 && <span className="ml-1 font-semibold text-destructive">{c.failures} failed</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    Slide jumps: {stats.jumps.uses} ·{" "}
                    <span className={stats.jumps.failures ? "font-semibold text-destructive" : "text-success"}>
                      {stats.jumps.failures} failed
                    </span>
                  </span>
                  <button onClick={clearEvents} className="text-[10px] text-muted-foreground underline-offset-2 hover:underline">
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showBookmarks && (
          <div className="max-h-56 overflow-y-auto border-b border-border/50 bg-muted/30 px-5 py-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-display text-sm font-bold">Saved slides</div>
              <button onClick={() => setShowBookmarks(false)} aria-label="Close saved slides" className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            {bookmarks.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No saved slides yet — click a citation, then hit the bookmark icon (or press <kbd className="rounded border px-1">b</kbd>).
              </p>
            ) : (
              <ul className="space-y-1.5">
                {bookmarks.map((b) => (
                  <li key={b.slide} className="flex items-start gap-2 rounded-xl border border-border/50 bg-background/70 p-2">
                    <button
                      onClick={() => openSlide(b.slide, { query: b.excerpt, source: "bookmark" })}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="text-xs font-semibold text-primary">Slide {b.slide}</div>
                      <p className="line-clamp-2 text-[11px] text-muted-foreground">{b.excerpt}</p>
                    </button>
                    <button
                      onClick={() => toggleBookmark(lectureId, b.slide, b.excerpt)}
                      aria-label={`Remove bookmark for slide ${b.slide}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <ScrollArea className="flex-1 px-5 py-4" ref={scrollRef as any}>
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ai-soft">
                <Sparkles className="h-6 w-6 text-ai" />
              </div>
              <h3 className="font-display text-lg font-bold">Ask me anything!</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                I've read the whole lecture. Try <em>"Explain slide 3"</em>, <em>"Summarize again"</em>, or press{" "}
                <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">?</kbd>{" "}
                to see everything I understand.
              </p>
            </div>
          )}
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}>
                  {m.role === "assistant" ? (
                    <AssistantContent
                      content={m.content}
                      slides={slides}
                      onCite={(n) => openSlide(n, { query: messages[i - 1]?.content, source: "citation" })}
                    />
                  ) : (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1">
                      <ReactMarkdown>{m.content || "..."}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="border-t border-border/50 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a}
                onClick={() => send(a)}
                disabled={streaming}
                className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
              >
                {a}
              </button>
            ))}
            <form onSubmit={jumpToSlide} className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5">
              <label htmlFor="slide-jump" className="text-xs font-medium text-secondary-foreground">Go to slide</label>
              <input
                id="slide-jump"
                ref={slideInputRef}
                value={slideInput}
                onChange={(e) => setSlideInput(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder={slides.length ? `1-${slides.length}` : "#"}
                className="w-12 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
              <button type="submit" disabled={streaming || !slideInput} className="text-xs font-bold text-primary disabled:opacity-40">
                Go
              </button>
            </form>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="flex gap-2"
          >
            <Input
              ref={chatInputRef}
              value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about the lecture..."
              disabled={streaming}
              className="h-11 rounded-full"
            />
            <Button type="submit" size="icon" disabled={streaming || !input.trim()} className="h-11 w-11 shrink-0 rounded-full">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>

      {activeSlide !== null && (
        <Card ref={panelRef} className="flex h-[40vh] w-full flex-col rounded-3xl border-border/50 shadow-card lg:h-[70vh] lg:w-80 lg:shrink-0">
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
            <div>
              <div className="font-display text-sm font-bold">Slide {activeSlide}</div>
              <div className="text-xs text-muted-foreground">of {slides.length}</div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={bookmarkCurrent}
                aria-label={currentBookmarked ? "Remove bookmark" : "Bookmark this slide"}
                title="Bookmark (b)"
                className={currentBookmarked ? "text-primary" : "text-muted-foreground hover:text-foreground"}
              >
                {currentBookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
              </button>
              <button onClick={() => setActiveSlide(null)} aria-label="Close slide panel" className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {fallbackNote && (
            <p className="border-b border-border/50 bg-highlight/10 px-4 py-2 text-[11px] text-muted-foreground">{fallbackNote}</p>
          )}

          <ScrollArea className="flex-1 px-4 py-3">
            <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-ul:my-1.5">
              {slideLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">This slide has no extracted content.</p>
              ) : (
                slideLines.map((line, i) => {
                  const isHit = highlight !== null && line === highlight;
                  return (
                    <div
                      key={i}
                      ref={isHit ? excerptRef : undefined}
                      className={isHit ? "not-prose rounded-lg bg-highlight/25 px-2 py-1 ring-1 ring-highlight/40" : undefined}
                    >
                      <ReactMarkdown>{line}</ReactMarkdown>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          <div className="flex items-center gap-2 border-t border-border/50 p-3">
            <Button variant="outline" size="sm" disabled={activeSlide <= 1} onClick={() => openSlide(activeSlide - 1, { source: "jump" })}>Prev</Button>
            <Button variant="outline" size="sm" disabled={activeSlide >= slides.length} onClick={() => openSlide(activeSlide + 1, { source: "jump" })}>Next</Button>
            <Button size="sm" className="ml-auto" disabled={streaming} onClick={() => send(`Explain slide ${activeSlide}`)}>Explain</Button>
          </div>
        </Card>
      )}
    </div>
  );
};

/** Renders assistant markdown, turning [[slide:N]] markers into clickable citations. */
const AssistantContent = ({
  content,
  slides,
  onCite,
}: {
  content: string;
  slides: string[];
  onCite: (n: number) => void;
}) => {
  const parts = useMemo(() => {
    const out: Array<{ type: "text"; value: string } | { type: "cite"; n: number }> = [];
    let last = 0;
    const re = new RegExp(CITATION_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m.index > last) out.push({ type: "text", value: content.slice(last, m.index) });
      out.push({ type: "cite", n: Number(m[1]) });
      last = m.index + m[0].length;
    }
    if (last < content.length) out.push({ type: "text", value: content.slice(last) });
    return out;
  }, [content]);

  return (
    <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-strong:text-foreground prose-ul:my-1 prose-blockquote:my-2 prose-blockquote:border-l-primary/50 prose-blockquote:text-muted-foreground">
      {parts.length === 0 && <ReactMarkdown>{content || "..."}</ReactMarkdown>}
      {parts.map((p, i) => {
        if (p.type === "text") return <ReactMarkdown key={i}>{p.value}</ReactMarkdown>;
        const missing = !slides[p.n - 1];
        return (
          <button
            key={i}
            onClick={() => onCite(p.n)}
            title={slides[p.n - 1]?.slice(0, 160) ?? `Slide ${p.n} — not indexed, we'll open the closest match`}
            className={`not-prose mx-0.5 inline-flex items-center rounded-full border px-2 py-0.5 align-middle text-[11px] font-semibold transition ${
              missing
                ? "border-border bg-muted text-muted-foreground hover:bg-muted/70"
                : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
            }`}
          >
            Slide {p.n}
            {missing && <span className="ml-1 font-normal">≈</span>}
          </button>
        );
      })}
    </div>
  );
};
