-- Read-only gate: owner-only RLS and no anonymous access.
DO $gaga$
DECLARE x record;
BEGIN
  SELECT p.*, c.relrowsecurity INTO x
  FROM pg_policies p JOIN pg_class c ON c.oid='public.gaga_contact_remarks'::regclass
  WHERE schemaname='public' AND tablename='gaga_contact_remarks'
    AND policyname='gaga_contact_remarks_owner';
  IF x.policyname IS NULL OR x.permissive <> 'PERMISSIVE'
     OR x.roles <> ARRAY['authenticated']::name[]
     OR NOT x.relrowsecurity
     OR x.qual NOT ILIKE '%auth.uid()%'
     OR x.with_check NOT ILIKE '%auth.uid()%'
     OR x.qual NOT ILIKE '%session_active%'
     OR x.with_check NOT ILIKE '%session_active%'
  THEN
    RAISE EXCEPTION 'GaGa owner-only contact remarks RLS unavailable';
  END IF;
  IF has_table_privilege('anon','public.gaga_contact_remarks','SELECT')
     OR has_table_privilege('anon','public.gaga_contact_remarks','INSERT')
  THEN
    RAISE EXCEPTION 'Anonymous role must not read/write contact remarks';
  END IF;
END $gaga$;
