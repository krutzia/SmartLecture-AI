
-- Status enum
CREATE TYPE public.lecture_status AS ENUM ('uploading','extracting','transcribing','summarizing','done','error');
CREATE TYPE public.lecture_source AS ENUM ('audio','video','pdf','text');

-- Generic updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- LECTURES
CREATE TABLE public.lectures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  source_type public.lecture_source NOT NULL,
  file_path TEXT,
  status public.lecture_status NOT NULL DEFAULT 'uploading',
  error_message TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lectures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lectures select" ON public.lectures FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own lectures insert" ON public.lectures FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own lectures update" ON public.lectures FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own lectures delete" ON public.lectures FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_lectures_user ON public.lectures(user_id, created_at DESC);
CREATE TRIGGER trg_lectures_updated BEFORE UPDATE ON public.lectures FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TRANSCRIPTS
CREATE TABLE public.transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id UUID NOT NULL REFERENCES public.lectures(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  full_text TEXT NOT NULL DEFAULT '',
  segments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transcripts select" ON public.transcripts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own transcripts insert" ON public.transcripts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own transcripts update" ON public.transcripts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own transcripts delete" ON public.transcripts FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_transcripts_lecture ON public.transcripts(lecture_id);

-- SUMMARIES
CREATE TABLE public.summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id UUID NOT NULL REFERENCES public.lectures(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  quick TEXT,
  detailed TEXT,
  bullets JSONB NOT NULL DEFAULT '[]'::jsonb,
  takeaways JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own summaries select" ON public.summaries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own summaries insert" ON public.summaries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own summaries update" ON public.summaries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own summaries delete" ON public.summaries FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_summaries_lecture ON public.summaries(lecture_id);

-- CONCEPTS
CREATE TABLE public.concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id UUID NOT NULL REFERENCES public.lectures(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  term TEXT NOT NULL,
  definition TEXT,
  kind TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own concepts select" ON public.concepts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own concepts insert" ON public.concepts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own concepts update" ON public.concepts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own concepts delete" ON public.concepts FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_concepts_lecture ON public.concepts(lecture_id);

-- FLASHCARDS
CREATE TABLE public.flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id UUID NOT NULL REFERENCES public.lectures(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  known BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own flashcards select" ON public.flashcards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own flashcards insert" ON public.flashcards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own flashcards update" ON public.flashcards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own flashcards delete" ON public.flashcards FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_flashcards_lecture ON public.flashcards(lecture_id);

-- CHAT MESSAGES
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id UUID NOT NULL REFERENCES public.lectures(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own chat select" ON public.chat_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own chat insert" ON public.chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own chat delete" ON public.chat_messages FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_chat_lecture ON public.chat_messages(lecture_id, created_at);

-- STORAGE BUCKET (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('lectures','lectures', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "own lecture files select" ON storage.objects FOR SELECT
USING (bucket_id = 'lectures' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own lecture files insert" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'lectures' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own lecture files update" ON storage.objects FOR UPDATE
USING (bucket_id = 'lectures' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own lecture files delete" ON storage.objects FOR DELETE
USING (bucket_id = 'lectures' AND auth.uid()::text = (storage.foldername(name))[1]);
