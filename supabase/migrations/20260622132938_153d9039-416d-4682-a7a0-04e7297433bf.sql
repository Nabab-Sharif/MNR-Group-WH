
-- 1) Add header fields + totals to receive_issues
ALTER TABLE public.receive_issues
  ADD COLUMN IF NOT EXISTS destination text,
  ADD COLUMN IF NOT EXISTS receiver_name text,
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS unit_office text,
  ADD COLUMN IF NOT EXISTS port text,
  ADD COLUMN IF NOT EXISTS truck_no text,
  ADD COLUMN IF NOT EXISTS driver_name text,
  ADD COLUMN IF NOT EXISTS driver_mobile text,
  ADD COLUMN IF NOT EXISTS lock_no text,
  ADD COLUMN IF NOT EXISTS export_by text,
  ADD COLUMN IF NOT EXISTS ar_desh text,
  ADD COLUMN IF NOT EXISTS total_ctn integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_pcs integer NOT NULL DEFAULT 0;

-- 2) Lines table
CREATE TABLE IF NOT EXISTS public.receive_issue_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.receive_issues(id) ON DELETE CASCADE,
  source_carton_id uuid REFERENCES public.receive_cartons(id) ON DELETE SET NULL,
  ctn_qty integer NOT NULL DEFAULT 0,
  pcs_per_ctn integer NOT NULL DEFAULT 0,
  returned_ctn integer NOT NULL DEFAULT 0,
  returned_pcs integer NOT NULL DEFAULT 0,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receive_issue_lines TO authenticated, anon;
GRANT ALL ON public.receive_issue_lines TO service_role;
ALTER TABLE public.receive_issue_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS receive_issue_lines_all ON public.receive_issue_lines;
CREATE POLICY receive_issue_lines_all ON public.receive_issue_lines FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_receive_issue_lines_issue ON public.receive_issue_lines(issue_id);
CREATE INDEX IF NOT EXISTS idx_receive_issue_lines_carton ON public.receive_issue_lines(source_carton_id);

-- 3) Trigger: keep parent totals in sync with lines (net of returns)
CREATE OR REPLACE FUNCTION public.recalc_issue_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  target uuid;
  c_sum integer;
  p_sum integer;
BEGIN
  target := COALESCE(NEW.issue_id, OLD.issue_id);
  SELECT
    COALESCE(SUM(GREATEST(ctn_qty - returned_ctn, 0)), 0),
    COALESCE(SUM(GREATEST(ctn_qty * pcs_per_ctn - returned_pcs, 0)), 0)
  INTO c_sum, p_sum
  FROM public.receive_issue_lines WHERE issue_id = target;
  UPDATE public.receive_issues
    SET total_ctn = c_sum, total_pcs = p_sum
  WHERE id = target;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_issue_totals ON public.receive_issue_lines;
CREATE TRIGGER trg_recalc_issue_totals
AFTER INSERT OR UPDATE OR DELETE ON public.receive_issue_lines
FOR EACH ROW EXECUTE FUNCTION public.recalc_issue_totals();

-- 4) Backfill: convert each existing receive_issues row into a single line
INSERT INTO public.receive_issue_lines (issue_id, source_carton_id, ctn_qty, pcs_per_ctn)
SELECT ri.id,
       (SELECT rc.id FROM public.receive_cartons rc WHERE rc.receive_id = ri.receive_id ORDER BY rc.created_at LIMIT 1),
       ri.ctn_qty, ri.pcs_per_ctn
FROM public.receive_issues ri
WHERE NOT EXISTS (SELECT 1 FROM public.receive_issue_lines rl WHERE rl.issue_id = ri.id)
  AND ri.ctn_qty > 0;

-- 5) Initialize total_ctn / total_pcs from existing data (trigger fires only for new line ops)
UPDATE public.receive_issues ri
SET total_ctn = sub.c_sum, total_pcs = sub.p_sum
FROM (
  SELECT issue_id,
         COALESCE(SUM(GREATEST(ctn_qty - returned_ctn, 0)), 0) AS c_sum,
         COALESCE(SUM(GREATEST(ctn_qty * pcs_per_ctn - returned_pcs, 0)), 0) AS p_sum
  FROM public.receive_issue_lines GROUP BY issue_id
) sub
WHERE ri.id = sub.issue_id;
