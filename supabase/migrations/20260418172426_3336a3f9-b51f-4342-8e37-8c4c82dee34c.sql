
-- Quizzes table
CREATE TABLE public.quizzes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lecture_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Quiz',
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  question_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own quizzes select" ON public.quizzes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own quizzes insert" ON public.quizzes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own quizzes update" ON public.quizzes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own quizzes delete" ON public.quizzes FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_quizzes_lecture ON public.quizzes(lecture_id, created_at DESC);

-- SM-2 spaced repetition fields on flashcards
ALTER TABLE public.flashcards
  ADD COLUMN ease_factor NUMERIC NOT NULL DEFAULT 2.5,
  ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN repetitions INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN due_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ADD COLUMN last_reviewed_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX idx_flashcards_due ON public.flashcards(user_id, due_date);

-- Cluster label on concepts for mind map grouping
ALTER TABLE public.concepts
  ADD COLUMN cluster TEXT;
