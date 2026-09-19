-- 20260919001200_signup_creates_user_row.sql
--
-- BUG: handle_new_profile() only inserted into public.profiles, never into
-- public.users. As a result, brand-new signups (and admin-created auth users)
-- had no public.users row, which caused foreign-key violations on every table
-- that references public.users(id) -- posts, messages, comments, follows, etc.
--
-- The client compensated with a best-effort upsert on sign-in, but that path
-- is skipped for email-verification-pending users and for any server-side
-- user creation. This migration makes the trigger authoritative: it creates
-- the public.users row (and keeps the legacy public.profiles row) for every
-- new auth user, deriving a friendly display name from metadata/email.

CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_name text;
    v_username text;
BEGIN
    -- Derive a display name from signup metadata, falling back to the email
    -- local-part, then to a generic label.
    v_name := COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'name', ''),
        NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
        NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
        'GaGa User'
    );

    -- Best-effort unique username seed (lowercased, alnum only).
    v_username := lower(regexp_replace(v_name, '[^a-zA-Z0-9]', '', 'g'));
    IF v_username IS NULL OR length(v_username) < 3 THEN
        v_username := 'user';
    END IF;
    v_username := left(v_username, 20) || '_' || substr(NEW.id::text, 1, 6);

    -- Primary identity row used by the whole app.
    INSERT INTO public.users (id, email, name, display_name, username, created_at)
    VALUES (NEW.id, NEW.email, v_name, v_name, v_username, now())
    ON CONFLICT (id) DO NOTHING;

    -- Legacy minimal profile row (kept for backwards compatibility).
    INSERT INTO public.profiles (id) VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$function$;

-- Backfill: create public.users rows for any existing auth users that are
-- missing one (e.g. accounts created while the bug was live).
INSERT INTO public.users (id, email, name, display_name, username, created_at)
SELECT
    u.id,
    u.email,
    COALESCE(
        NULLIF(u.raw_user_meta_data->>'name', ''),
        NULLIF(u.raw_user_meta_data->>'full_name', ''),
        NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
        'GaGa User'
    ) AS name,
    COALESCE(
        NULLIF(u.raw_user_meta_data->>'name', ''),
        NULLIF(u.raw_user_meta_data->>'full_name', ''),
        NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
        'GaGa User'
    ) AS display_name,
    left(
        COALESCE(NULLIF(lower(regexp_replace(
            COALESCE(NULLIF(u.raw_user_meta_data->>'name', ''),
                     NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
                     'user'),
            '[^a-zA-Z0-9]', '', 'g')), ''), 'user'),
        20
    ) || '_' || substr(u.id::text, 1, 6) AS username,
    COALESCE(u.created_at, now())
FROM auth.users u
LEFT JOIN public.users pu ON pu.id = u.id
WHERE pu.id IS NULL
ON CONFLICT (id) DO NOTHING;
