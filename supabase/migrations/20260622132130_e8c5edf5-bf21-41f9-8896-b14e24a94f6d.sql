
-- Parent: a single Receive entry per SI/Challan
CREATE TABLE public.receives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL,
  buyer text,
  si_no text,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  challan_no text,
  po_no text,
  style text,
  remarks text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receives TO authenticated, anon;
GRANT ALL ON public.receives TO service_role;
ALTER TABLE public.receives ENABLE ROW LEVEL SECURITY;
CREATE POLICY receives_all ON public.receives FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_receives_updated BEFORE UPDATE ON public.receives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_receives_office_buyer ON public.receives(office_id, buyer);

-- Child rows: cartons within a receive (qty x pcs/ctn + location)
CREATE TABLE public.receive_cartons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receive_id uuid NOT NULL REFERENCES public.receives(id) ON DELETE CASCADE,
  ctn_qty integer NOT NULL DEFAULT 0,
  pcs_per_ctn integer NOT NULL DEFAULT 0,
  location text,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receive_cartons TO authenticated, anon;
GRANT ALL ON public.receive_cartons TO service_role;
ALTER TABLE public.receive_cartons ENABLE ROW LEVEL SECURITY;
CREATE POLICY receive_cartons_all ON public.receive_cartons FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_receive_cartons_receive ON public.receive_cartons(receive_id);

-- Issues (Sample / Inspection / Shipment) against a receive
CREATE TYPE public.issue_type AS ENUM ('sample', 'inspection', 'shipment');
CREATE TABLE public.receive_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receive_id uuid NOT NULL REFERENCES public.receives(id) ON DELETE CASCADE,
  issue_type public.issue_type NOT NULL,
  ctn_qty integer NOT NULL DEFAULT 0,
  pcs_per_ctn integer NOT NULL DEFAULT 0,
  issued_to text,
  remarks text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receive_issues TO authenticated, anon;
GRANT ALL ON public.receive_issues TO service_role;
ALTER TABLE public.receive_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY receive_issues_all ON public.receive_issues FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_receive_issues_receive ON public.receive_issues(receive_id);

-- Migrate existing cartons -> 1 receive + 1 receive_carton each; if issued/shipment/sample create issue
DO $$
DECLARE
  c RECORD;
  new_receive_id uuid;
  itype public.issue_type;
BEGIN
  FOR c IN SELECT * FROM public.cartons WHERE carton_no NOT LIKE '%-PLACEHOLDER-%' LOOP
    INSERT INTO public.receives (office_id, buyer, si_no, entry_date, challan_no, po_no, style, created_by, created_at)
    VALUES (c.office_id, c.buyer, c.si_no, c.entry_date, c.carton_no, c.po_no, COALESCE(c.style, c.style_no), c.created_by, c.created_at)
    RETURNING id INTO new_receive_id;

    INSERT INTO public.receive_cartons (receive_id, ctn_qty, pcs_per_ctn, location)
    VALUES (new_receive_id, 1, c.quantity, NULLIF(CONCAT_WS(' / ', c.color, c.size), ''));

    IF c.category IN ('sample','shipment') OR c.status = 'issued' THEN
      itype := CASE
        WHEN c.category = 'sample' THEN 'sample'::public.issue_type
        WHEN c.category = 'shipment' THEN 'shipment'::public.issue_type
        ELSE 'shipment'::public.issue_type
      END;
      INSERT INTO public.receive_issues (receive_id, issue_type, ctn_qty, pcs_per_ctn, issued_to, remarks, issued_at, created_by)
      VALUES (new_receive_id, itype, 1, c.quantity, c.issued_to, c.inspection_notes, COALESCE(c.issued_at, c.updated_at), c.created_by);
    END IF;
  END LOOP;
END $$;
