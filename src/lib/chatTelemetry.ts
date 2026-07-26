/**
 * Lightweight local telemetry for lecture chat commands and slide jumps.
 * Stored in localStorage so failures can be inspected without a backend round-trip.
 */

export type ChatEvent = {
  ts: number;
  lectureId: string;
  type: "command" | "slide_jump" | "citation_click" | "bookmark";
  name: string;
  ok: boolean;
  detail?: string;
};

const EVENTS_KEY = "lecture-chat-events";
const MAX_EVENTS = 200;

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event("lecture-chat-telemetry"));
  } catch {
    /* storage full / disabled — telemetry is best-effort */
  }
};

export const getEvents = (lectureId?: string): ChatEvent[] => {
  const all = read<ChatEvent[]>(EVENTS_KEY, []);
  return lectureId ? all.filter((e) => e.lectureId === lectureId) : all;
};

export const logEvent = (e: Omit<ChatEvent, "ts">) => {
  const all = read<ChatEvent[]>(EVENTS_KEY, []);
  all.push({ ...e, ts: Date.now() });
  write(EVENTS_KEY, all.slice(-MAX_EVENTS));
};

export const clearEvents = () => write(EVENTS_KEY, []);

/** Classifies free-text input into a canonical command name for analytics. */
export const classifyCommand = (text: string): string => {
  const t = text.trim().toLowerCase();
  if (/^(explain|go deeper on|what'?s on)\s+slide\s+\d+/.test(t)) return "explain_slide";
  if (/(summari[sz]e again|recap|tl;?dr|simpler terms)/.test(t)) return "summarize_again";
  if (/what did the (professor|lecturer|teacher) say/.test(t)) return "professor_quote";
  if (/(give me examples?|example of|examples of)/.test(t)) return "examples";
  if (/(ask me questions|quiz me)/.test(t)) return "socratic_quiz";
  if (/^compare\s+/.test(t)) return "compare";
  return "freeform";
};

export type CommandStat = { name: string; uses: number; failures: number };

export const summarize = (events: ChatEvent[]): { commands: CommandStat[]; jumps: CommandStat } => {
  const map = new Map<string, CommandStat>();
  const jumps: CommandStat = { name: "slide_jump", uses: 0, failures: 0 };
  for (const e of events) {
    if (e.type === "slide_jump" || e.type === "citation_click") {
      jumps.uses += 1;
      if (!e.ok) jumps.failures += 1;
      continue;
    }
    if (e.type !== "command") continue;
    const s = map.get(e.name) ?? { name: e.name, uses: 0, failures: 0 };
    s.uses += 1;
    if (!e.ok) s.failures += 1;
    map.set(e.name, s);
  }
  return { commands: [...map.values()].sort((a, b) => b.uses - a.uses), jumps };
};

/* ---------------- Slide bookmarks ---------------- */

export type SlideBookmark = { lectureId: string; slide: number; excerpt: string; ts: number };

const BOOKMARKS_KEY = "lecture-slide-bookmarks";

export const getBookmarks = (lectureId?: string): SlideBookmark[] => {
  const all = read<SlideBookmark[]>(BOOKMARKS_KEY, []);
  return (lectureId ? all.filter((b) => b.lectureId === lectureId) : all).sort((a, b) => b.ts - a.ts);
};

export const isBookmarked = (lectureId: string, slide: number) =>
  read<SlideBookmark[]>(BOOKMARKS_KEY, []).some((b) => b.lectureId === lectureId && b.slide === slide);

export const toggleBookmark = (lectureId: string, slide: number, excerpt: string): boolean => {
  const all = read<SlideBookmark[]>(BOOKMARKS_KEY, []);
  const idx = all.findIndex((b) => b.lectureId === lectureId && b.slide === slide);
  if (idx >= 0) {
    all.splice(idx, 1);
    write(BOOKMARKS_KEY, all);
    return false;
  }
  all.push({ lectureId, slide, excerpt: excerpt.slice(0, 200), ts: Date.now() });
  write(BOOKMARKS_KEY, all);
  return true;
};

/* ---------------- Fuzzy slide matching ---------------- */

const STOP = new Set("the a an of and or to in on for is are was were with that this it as by from at be".split(" "));

const tokens = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/**
 * Finds the slide whose content best matches a query. Returns null when nothing
 * scores above zero, so callers can fall back gracefully.
 */
export const bestMatchingSlide = (
  slides: string[],
  query: string,
): { index: number; score: number; snippet: string } | null => {
  const q = tokens(query);
  if (!q.length || !slides.length) return null;
  let best = { index: -1, score: 0, snippet: "" };
  slides.forEach((s, i) => {
    const words = new Set(tokens(s));
    let score = 0;
    for (const t of q) if (words.has(t)) score += 1;
    const normalized = score / q.length;
    if (normalized > best.score) best = { index: i, score: normalized, snippet: s.slice(0, 200) };
  });
  return best.index === -1 ? null : best;
};

/** Locates the offset of the best matching line inside a slide, for scroll-to-excerpt. */
export const bestExcerptLine = (slide: string, query: string): string | null => {
  const lines = slide.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const q = tokens(query);
  if (!q.length) return lines[0];
  let best: { line: string; score: number } | null = null;
  for (const line of lines) {
    const words = new Set(tokens(line));
    let score = 0;
    for (const t of q) if (words.has(t)) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { line, score };
  }
  return best?.line ?? lines[0];
};
