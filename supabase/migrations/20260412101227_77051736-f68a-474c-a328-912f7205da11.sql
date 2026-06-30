
-- Master table for style/operation configurations
CREATE TABLE public.styles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer TEXT NOT NULL,
  style_no TEXT NOT NULL,
  gg TEXT,
  operation TEXT NOT NULL DEFAULT 'Iron',
  smv NUMERIC(6,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.styles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_styles" ON public.styles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_insert_styles" ON public.styles FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public_update_styles" ON public.styles FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "public_delete_styles" ON public.styles FOR DELETE TO anon, authenticated USING (true);

-- Worker-level daily production entries
CREATE TABLE public.worker_production (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  unit_id UUID REFERENCES public.units(id),
  line_no INTEGER NOT NULL DEFAULT 1,
  supervisor TEXT,
  worker_id UUID REFERENCES public.workers(id),
  operator_id_code TEXT,
  operator_name TEXT,
  job_type TEXT DEFAULT 'Ironner',
  designation TEXT DEFAULT 'Junior Ironman',
  buyer TEXT,
  style_no TEXT,
  gg TEXT,
  operation TEXT DEFAULT 'Iron',
  smv NUMERIC(6,2) DEFAULT 0,
  output NUMERIC(10,1) NOT NULL DEFAULT 0,
  working_hour NUMERIC(4,1) DEFAULT 11,
  target_pcs INTEGER DEFAULT 0,
  efficiency NUMERIC(5,1) DEFAULT 0,
  extra_pcs NUMERIC(10,1) DEFAULT 0,
  incentive NUMERIC(10,2) DEFAULT 0,
  cost_per_minute NUMERIC(6,2) DEFAULT 0.85,
  target_efficiency NUMERIC(5,1) DEFAULT 70,
  entered_by UUID REFERENCES public.user_access(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.worker_production ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_wp" ON public.worker_production FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_insert_wp" ON public.worker_production FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public_update_wp" ON public.worker_production FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "public_delete_wp" ON public.worker_production FOR DELETE TO anon, authenticated USING (true);

-- Enable realtime for worker_production
ALTER PUBLICATION supabase_realtime ADD TABLE public.worker_production;
ALTER PUBLICATION supabase_realtime ADD TABLE public.styles;
