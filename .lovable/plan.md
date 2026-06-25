This is a big list. Rather than half-build everything in one pass, here's a phased plan that ships polished pieces in order of impact. Tell me which phase to start with (or say "all" and I'll go top-down).

## Phase 1 — Foundations (quick wins)
1. **Dark mode** — system + manual toggle in header, persisted. Tune existing semantic tokens for night reading (lower contrast, warm accents). Already mostly themable; mainly a toggle + token polish.
2. **Export notes** — on the Lecture page, "Export" menu with **PDF / DOCX / Markdown**. Markdown is instant; PDF via `jspdf` + `html2canvas`; DOCX via `docx` lib. Includes summary + detailed notes + key concepts.

## Phase 2 — Lecture-aware AI Chat (biggest leverage)
Upgrade `ChatTab` + `chat-with-lecture` edge function:
- Slide/timestamp grounding: when transcript has segments, model cites `[t=mm:ss]` and UI renders them as jump links.
- New quick actions: "Explain slide N", "What did the professor say about ___", "Give examples", "Quiz me" (kicks into a 5-question Socratic loop).
- "Quiz me" mode logs attempts to `quiz_attempts` so weak topics feed analytics.

## Phase 3 — Quiz Mode upgrade
Extend `generate-quiz` + `QuizTab`:
- Question **types**: MCQ, True/False, Fill-in-the-blank, and Coding (only when lecture detected as CS — keyword heuristic on transcript).
- Per-question explanation already partly there — make it always shown after answer.
- End-of-quiz score screen with breakdown by topic + "Review weak ones" CTA.

## Phase 4 — Flashcards upgrade
`FlashcardsTab`:
- Difficulty (easy/medium/hard) stored per card; AI tags on generation.
- "Mark as learned" toggle (already have `known` field — surface it).
- SM-2 spaced repetition is already in `src/lib/sm2.ts` — wire Review page to schedule by `due_date` and show "Due today" by difficulty.

## Phase 5 — Notes Editor (write alongside AI)
New `user_notes` table + new tab "My Notes" on Lecture page:
- Markdown editor (textarea + live preview using `react-markdown` already installed).
- Toolbar: bold/italic/highlight, image upload (to `lectures` bucket), fenced code blocks with syntax highlight (`react-syntax-highlighter`).
- Autosave per lecture, per user.

## Phase 6 — Search improvements
Global command palette (`GlobalCommandPalette`) gains filters:
- Tabs: **All / Topic / Lecture / Keyword / Formula / Professor / Subject**.
- Add `subject` and `professor` fields to `lectures` (optional, editable from lecture header).
- "Formula" search runs against transcript/notes for `$...$` or code-like patterns.

## Phase 7 — Analytics overhaul
Rebuild `Analytics.tsx` with cards:
- 🔥 Study streak (consecutive days with `study_sessions`)
- ⏱ Total hours studied
- 🃏 Flashcards completed (known=true count)
- 🎯 Quiz accuracy (correct / total from `quiz_attempts`)
- 📉 Weak subjects (lowest accuracy, grouped by lecture.subject)
- 📈 Strong subjects
- 📊 Weekly graph (line chart, recharts already installed)

## Technical notes
- New tables (Phase 5/6): `user_notes(id, user_id, lecture_id, content, updated_at)`; add `subject text`, `professor text` to `lectures`. Both with RLS + GRANTs.
- New libs to add: `jspdf`, `html2canvas`, `docx`, `react-syntax-highlighter`. (`react-markdown`, `recharts`, `cmdk` already in.)
- Reuses existing Lovable AI Gateway — no new keys.

## Suggested order
Phase 1 → 2 → 3 → 4 → 5 → 7 → 6. (Search last because it benefits from `subject`/`professor` being populated.)

**Which phase should I start with?** (or "all", or pick a custom subset)