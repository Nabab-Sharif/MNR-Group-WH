CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  login_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  logout_at timestamptz,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS user_sessions_last_seen_idx ON public.user_sessions(last_seen_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.user_sessions TO anon, authenticated;
GRANT ALL ON public.user_sessions TO service_role;

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open read sessions" ON public.user_sessions FOR SELECT USING (true);
CREATE POLICY "open insert sessions" ON public.user_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "open update sessions" ON public.user_sessions FOR UPDATE USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_sessions;