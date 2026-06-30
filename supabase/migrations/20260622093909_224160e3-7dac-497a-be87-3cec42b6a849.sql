
-- Drop old tables and enums
DROP TABLE IF EXISTS public.worker_production CASCADE;
DROP TABLE IF EXISTS public.production_entries CASCADE;
DROP TABLE IF EXISTS public.workers CASCADE;
DROP TABLE IF EXISTS public.styles CASCADE;
DROP TABLE IF EXISTS public.sections CASCADE;
DROP TABLE IF EXISTS public.user_access CASCADE;
DROP TABLE IF EXISTS public.units CASCADE;
DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.carton_status CASCADE;
DROP TYPE IF EXISTS public.history_action CASCADE;

CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'management', 'store_user');
CREATE TYPE public.carton_status AS ENUM ('in_stock', 'issued', 'inspection_pending', 'pass', 'fail');
CREATE TYPE public.history_action AS ENUM ('created', 'updated', 'issued', 'inspected', 'deleted');

-- OFFICES
CREATE TABLE public.offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  location text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offices TO authenticated, anon;
GRANT ALL ON public.offices TO service_role;
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offices_all" ON public.offices FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- APP USERS
CREATE TABLE public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_id text NOT NULL UNIQUE,
  name text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'store_user',
  office_id uuid REFERENCES public.offices(id) ON DELETE SET NULL,
  can_add boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_print boolean NOT NULL DEFAULT false,
  can_excel boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_users TO authenticated, anon;
GRANT ALL ON public.app_users TO service_role;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_users_all" ON public.app_users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- CARTONS
CREATE TABLE public.cartons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  carton_no text NOT NULL,
  buyer text,
  style text,
  color text,
  size text,
  quantity integer NOT NULL DEFAULT 0,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  status public.carton_status NOT NULL DEFAULT 'in_stock',
  issued_to text,
  issued_at timestamptz,
  inspection_notes text,
  created_by uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(office_id, carton_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cartons TO authenticated, anon;
GRANT ALL ON public.cartons TO service_role;
ALTER TABLE public.cartons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cartons_all" ON public.cartons FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- CARTON HISTORY
CREATE TABLE public.carton_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carton_id uuid REFERENCES public.cartons(id) ON DELETE CASCADE,
  office_id uuid REFERENCES public.offices(id) ON DELETE CASCADE,
  action public.history_action NOT NULL,
  changed_by uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  changed_by_name text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.carton_history TO authenticated, anon;
GRANT ALL ON public.carton_history TO service_role;
ALTER TABLE public.carton_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carton_history_all" ON public.carton_history FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid REFERENCES public.offices(id) ON DELETE CASCADE,
  office_name text,
  carton_id uuid,
  carton_no text,
  action public.history_action NOT NULL,
  message text NOT NULL,
  created_by uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_by_name text,
  read_by jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated, anon;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_all" ON public.notifications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Triggers
CREATE TRIGGER offices_updated_at BEFORE UPDATE ON public.offices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER app_users_updated_at BEFORE UPDATE ON public.app_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER cartons_updated_at BEFORE UPDATE ON public.cartons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER TABLE public.cartons REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cartons;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Default super admin
INSERT INTO public.app_users (access_id, name, role, can_add, can_edit, can_delete, can_print, can_excel)
VALUES ('admin', 'Super Admin', 'super_admin', true, true, true, true, true);
