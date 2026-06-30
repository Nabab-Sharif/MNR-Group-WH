
ALTER TABLE public.cartons
  ADD COLUMN IF NOT EXISTS si_no text,
  ADD COLUMN IF NOT EXISTS style_no text,
  ADD COLUMN IF NOT EXISTS po_no text,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'stock';

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS route text,
  ADD COLUMN IF NOT EXISTS field_changed text;
