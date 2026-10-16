-- GaGa per-owner contact remarks (never modifies public.users).
-- All personal metadata is visible only to the authenticated owner.
CREATE TABLE public.gaga_contact_remarks (
    owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contact_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    alias text NOT NULL DEFAULT '' CHECK (char_length(alias) <= 64),
    mobile text NOT NULL DEFAULT '' CHECK (char_length(mobile) <= 40),
    tags text[] NOT NULL DEFAULT '{}'::text[]
         CHECK (cardinality(tags) <= 16),
    remark text NOT NULL DEFAULT '' CHECK (char_length(remark) <= 1200),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_id, contact_user_id),
    CONSTRAINT gaga_contact_remarks_not_self CHECK (owner_id <> contact_user_id)
);
REVOKE ALL ON public.gaga_contact_remarks FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gaga_contact_remarks TO authenticated;
ALTER TABLE public.gaga_contact_remarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY gaga_contact_remarks_owner
ON public.gaga_contact_remarks
AS PERMISSIVE
FOR ALL
TO authenticated
USING (
    owner_id = (SELECT auth.uid())
    AND (SELECT gaga_private.session_active())
)
WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND (SELECT gaga_private.session_active())
);

COMMENT ON TABLE public.gaga_contact_remarks IS
  'Private per-user contact labels and notes. No shared profile mutation.';
