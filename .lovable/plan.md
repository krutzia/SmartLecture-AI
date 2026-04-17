
# Smart Lecture Summarizer — Phase 1 (Lean MVP)

A friendly, light-themed AI learning platform where students upload lectures (audio, video, PDF, text) and get back transcripts, summaries, highlighted concepts, flashcards, and a study chatbot.

## Design direction
- **Style**: Light + playful (Duolingo-inspired). Off-white background, warm friendly accents, generous rounded corners, soft shadows, illustrated empty states.
- **Palette**: Warm coral/orange primary, mint-green success, sunny yellow highlights, soft lavender for AI elements. Cream `#FBF8F3` background.
- **Typography**: Rounded sans (e.g. Nunito / Quicksand) for headings, Inter for body.
- **Motion**: Framer Motion micro-interactions — cards bounce on hover, flashcards flip, progress bars animate, mascot/illustration accents.

## Pages & navigation
- **Landing page** (public) — hero, feature cards, how-it-works, CTA to sign up.
- **Auth** (`/auth`) — single page with login/signup tabs, email + password only, auto-confirm enabled for fast testing.
- **App shell** (authenticated) with collapsible sidebar:
  - **Dashboard** — recent lectures, quick stats, "Upload new lecture" CTA.
  - **Upload** — drag & drop zone, file picker, format/size hints, upload progress, processing status.
  - **My Library** — grid of all processed lectures (search + filter).
  - **Lecture viewer** (`/lecture/:id`) — tabs for: Transcript • Summary • Concepts • Flashcards • Chat.
  - **Settings** — sign out, basic preferences.

## Core features (Phase 1)

### 1. Multi-format upload
- Drag & drop + file picker. Accepted: MP3, WAV, MP4, PDF, TXT.
- 50 MB limit per file, validated client-side with friendly errors.
- Real-time upload progress bar; file stored in Lovable Cloud Storage (private bucket, per-user).
- Status pipeline shown to user: Uploading → Extracting → Transcribing → Summarizing → Done.

### 2. Transcription engine
- **PDF/TXT**: server-side text extraction in an edge function.
- **Audio/Video**: sent to Lovable AI Gateway (Gemini multimodal) which transcribes audio directly and returns timestamped segments. (Whisper isn't on the gateway; Gemini handles audio natively and works well for lecture content.)
- Output stored as structured transcript (segments with start/end timestamps).

### 3. AI smart summarization
- One processing pass generates four views in parallel: **Quick summary** (3–5 sentences), **Detailed notes** (structured markdown), **Bullet points**, **Key takeaways**.
- Rendered with markdown, copy-to-clipboard buttons, "regenerate" option.

### 4. Concept highlighting
- AI extracts important concepts, definitions, and keywords (structured tool-calling output).
- Displayed as a sidebar of chips on the Summary tab; clicking a chip scrolls the transcript to mentions and highlights them in the playful accent color.

### 5. Flashcards generator
- Auto-generate 10–20 Q/A flashcards per lecture.
- Card grid with flip animation (Framer Motion). Mark known/unknown. Saved per user.
- (Spaced repetition scheduling lives in a future phase.)

### 6. AI study chatbot
- Per-lecture chat panel, streaming responses, context = full transcript + summary.
- Quick-action chips: "Explain simply", "Give examples", "Summarize again", "Quiz me".
- Conversation history persisted per lecture.

### 7. Mini dashboard
- Stat cards: lectures processed, total study minutes (basic tracking), flashcards reviewed.
- Recent activity list. Charts come in a later phase.

## Backend (Lovable Cloud)
- **Auth**: email + password, auto-confirm on, no profile table.
- **Storage**: private `lectures` bucket, RLS scoped to `auth.uid()`.
- **Database tables** (all with RLS — owner-only):
  - `lectures` — id, user_id, title, source_type, file_path, status, duration, created_at.
  - `transcripts` — lecture_id, segments (jsonb with timestamps).
  - `summaries` — lecture_id, quick, detailed, bullets, takeaways.
  - `concepts` — lecture_id, term, definition, type.
  - `flashcards` — lecture_id, user_id, question, answer, known.
  - `chat_messages` — lecture_id, user_id, role, content, created_at.
- **Edge functions**:
  - `process-lecture` — orchestrates extract → transcribe → summarize → concepts → flashcards.
  - `chat-with-lecture` — streaming chat using Lovable AI Gateway.
- **AI**: Lovable AI Gateway, default `google/gemini-3-flash-preview`; heavier reasoning calls use `google/gemini-2.5-pro`.

## Out of scope for Phase 1 (planned for later)
Mind maps, spaced repetition, full analytics, doubt detection, audio revision, collaboration, live lecture mode, quiz generator, multi-language, smart revision, ELI5, interview prep. These layer cleanly on top of the Phase 1 data model.

## Deliverable
A working, polished SaaS where a user can sign up, upload a lecture, watch it process, then read summaries, browse highlighted concepts, flip flashcards, and chat with the lecture content — all in a light, playful UI.
