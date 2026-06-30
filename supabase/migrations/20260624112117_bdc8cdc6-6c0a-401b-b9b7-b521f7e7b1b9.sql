-- Ensure receive workflow tables publish live changes for the app
ALTER TABLE public.receives REPLICA IDENTITY FULL;
ALTER TABLE public.receive_cartons REPLICA IDENTITY FULL;
ALTER TABLE public.receive_issues REPLICA IDENTITY FULL;
ALTER TABLE public.receive_issue_lines REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'receives'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.receives';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'receive_cartons'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.receive_cartons';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'receive_issues'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.receive_issues';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'receive_issue_lines'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.receive_issue_lines';
  END IF;
END $$;

-- Recalculate issue totals and touch parent receive after issue line changes
CREATE OR REPLACE FUNCTION public.recalc_issue_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  target uuid;
  parent_receive uuid;
  c_sum integer;
  p_sum integer;
BEGIN
  target := COALESCE(NEW.issue_id, OLD.issue_id);

  SELECT
    COALESCE(SUM(GREATEST(ctn_qty - returned_ctn, 0)), 0),
    COALESCE(SUM(GREATEST(ctn_qty * pcs_per_ctn - returned_pcs, 0)), 0)
  INTO c_sum, p_sum
  FROM public.receive_issue_lines
  WHERE issue_id = target;

  UPDATE public.receive_issues
    SET total_ctn = c_sum,
        total_pcs = p_sum
  WHERE id = target
  RETURNING receive_id INTO parent_receive;

  IF parent_receive IS NOT NULL THEN
    UPDATE public.receives
      SET updated_at = now()
    WHERE id = parent_receive;
  END IF;

  RETURN NULL;
END;
$$;

-- Touch parent receive when receive carton rows change
CREATE OR REPLACE FUNCTION public.touch_receive_from_carton()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  target uuid;
BEGIN
  target := COALESCE(NEW.receive_id, OLD.receive_id);
  IF target IS NOT NULL THEN
    UPDATE public.receives SET updated_at = now() WHERE id = target;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_receive_from_carton ON public.receive_cartons;
CREATE TRIGGER trg_touch_receive_from_carton
AFTER INSERT OR UPDATE OR DELETE ON public.receive_cartons
FOR EACH ROW EXECUTE FUNCTION public.touch_receive_from_carton();

-- Touch parent receive when issue header changes directly
CREATE OR REPLACE FUNCTION public.touch_receive_from_issue()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  target uuid;
BEGIN
  target := COALESCE(NEW.receive_id, OLD.receive_id);
  IF target IS NOT NULL THEN
    UPDATE public.receives SET updated_at = now() WHERE id = target;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_receive_from_issue ON public.receive_issues;
CREATE TRIGGER trg_touch_receive_from_issue
AFTER INSERT OR UPDATE OR DELETE ON public.receive_issues
FOR EACH ROW EXECUTE FUNCTION public.touch_receive_from_issue();