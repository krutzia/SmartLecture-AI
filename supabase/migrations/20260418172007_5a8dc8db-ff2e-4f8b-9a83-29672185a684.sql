
-- Study sessions: tracks time spent studying per lecture
CREATE TABLE public.study_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lecture_id UUID NOT NULL,
  activity TEXT NOT NULL DEFAULT 'view',
  minutes NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions select" ON public.study_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own sessions insert" ON public.study_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own sessions update" ON public.study_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own sessions delete" ON public.study_sessions FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_study_sessions_user_created ON public.study_sessions(user_id, created_at DESC);

-- Quiz attempts: tracks accuracy per topic / flashcard
CREATE TABLE public.quiz_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lecture_id UUID NOT NULL,
  topic TEXT,
  flashcard_id UUID,
  correct BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own attempts select" ON public.quiz_attempts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own attempts insert" ON public.quiz_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own attempts update" ON public.quiz_attempts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own attempts delete" ON public.quiz_attempts FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_quiz_attempts_user_topic ON public.quiz_attempts(user_id, topic);
