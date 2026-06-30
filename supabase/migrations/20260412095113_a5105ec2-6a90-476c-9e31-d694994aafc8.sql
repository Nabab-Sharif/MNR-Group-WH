-- Create role enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'unit_user');

-- Create units table first (referenced by others)
CREATE TABLE public.units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_access table for access ID based login
CREATE TABLE public.user_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  access_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'unit_user',
  pin TEXT NOT NULL DEFAULT '1234',
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create workers table
CREATE TABLE public.workers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  worker_code TEXT NOT NULL UNIQUE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  designation TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create production_entries table
CREATE TABLE public.production_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  time_slot TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  worker_count INTEGER,
  remarks TEXT,
  entered_by UUID REFERENCES public.user_access(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(unit_id, date, time_slot)
);

-- Enable RLS on all tables
ALTER TABLE public.user_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_entries ENABLE ROW LEVEL SECURITY;

-- Permissive policies (app-level auth via access ID)
CREATE POLICY "public_read_user_access" ON public.user_access FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_insert_user_access" ON public.user_access FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public_update_user_access" ON public.user_access FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "public_delete_user_access" ON public.user_access FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "public_read_units" ON public.units FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_insert_units" ON public.units FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public_update_units" ON public.units FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "public_delete_units" ON public.units FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "public_read_workers" ON public.workers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_insert_workers" ON public.workers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public_update_workers" ON public.workers FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "public_delete_workers" ON public.workers FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "public_read_entries" ON public.production_entries FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_insert_entries" ON public.production_entries FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public_update_entries" ON public.production_entries FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "public_delete_entries" ON public.production_entries FOR DELETE TO anon, authenticated USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers
CREATE TRIGGER update_user_access_updated_at BEFORE UPDATE ON public.user_access FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_workers_updated_at BEFORE UPDATE ON public.workers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_production_entries_updated_at BEFORE UPDATE ON public.production_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();