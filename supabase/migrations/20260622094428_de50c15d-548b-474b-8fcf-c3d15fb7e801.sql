DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('chat_messages','concepts','flashcards','lectures','quiz_attempts','quizzes','study_sessions','summaries','transcripts')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_messages','concepts','flashcards','lectures','quiz_attempts','quizzes','study_sessions','summaries','transcripts']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', 'open all ' || t, t);
  END LOOP;
END$$;

ALTER TABLE public.chat_messages ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.concepts ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.flashcards ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.lectures ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.quiz_attempts ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.quizzes ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.study_sessions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.summaries ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.transcripts ALTER COLUMN user_id DROP NOT NULL;

DROP POLICY IF EXISTS "lectures own select" ON storage.objects;
DROP POLICY IF EXISTS "lectures own insert" ON storage.objects;
DROP POLICY IF EXISTS "lectures own update" ON storage.objects;
DROP POLICY IF EXISTS "lectures own delete" ON storage.objects;
DROP POLICY IF EXISTS "lectures anon all" ON storage.objects;
CREATE POLICY "lectures anon all" ON storage.objects FOR ALL TO anon, authenticated
  USING (bucket_id = 'lectures') WITH CHECK (bucket_id = 'lectures');