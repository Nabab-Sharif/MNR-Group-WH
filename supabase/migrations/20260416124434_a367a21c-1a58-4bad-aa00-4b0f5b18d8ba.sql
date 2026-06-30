CREATE TABLE public.sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_sections" ON public.sections FOR SELECT USING (true);
CREATE POLICY "public_insert_sections" ON public.sections FOR INSERT WITH CHECK (true);
CREATE POLICY "public_update_sections" ON public.sections FOR UPDATE USING (true);
CREATE POLICY "public_delete_sections" ON public.sections FOR DELETE USING (true);

-- Add section_id to workers table
ALTER TABLE public.workers ADD COLUMN section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL;

-- Add section_id to worker_production table  
ALTER TABLE public.worker_production ADD COLUMN section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL;

-- Add section_id to styles table
ALTER TABLE public.styles ADD COLUMN unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL;
ALTER TABLE public.styles ADD COLUMN section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL;