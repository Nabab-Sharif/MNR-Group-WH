ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS destination text;