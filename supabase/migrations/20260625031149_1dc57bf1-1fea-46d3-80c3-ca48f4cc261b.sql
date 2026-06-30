CREATE TABLE public.deleted_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  label text,
  payload jsonb NOT NULL,
  deleted_by uuid,
  deleted_by_name text,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deleted_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deleted_items TO anon;
GRANT ALL ON public.deleted_items TO service_role;
ALTER TABLE public.deleted_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deleted_items_all" ON public.deleted_items FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX deleted_items_deleted_at_idx ON public.deleted_items (deleted_at DESC);
CREATE INDEX deleted_items_table_name_idx ON public.deleted_items (table_name);