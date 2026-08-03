-- ---------------------------------------------------------------------------
-- 0004_is_admin_probe.sql — one bit, so the dashboard can say why it is empty.
--
-- WHY THIS PARTIALLY REVERSES 0003
--
-- 0003 moved `admins` and `is_admin()` into `private` on the principle that the
-- allowlist guarding the guest list should not be reachable over HTTP at all.
-- That principle is untouched here: `private.admins` stays unreadable and
-- unroutable, and this migration adds no way to enumerate it, read it or write
-- to it.
--
-- What it adds back is a single SECURITY DEFINER function in `public` that
-- answers exactly one question about the caller — "am I on the list?" — and
-- returns a boolean.
--
-- The reason is a real failure, observed three times while building the admin
-- area. `private.admins.user_id` references `auth.users on delete cascade`, so
-- deleting and recreating the admin account SILENTLY empties the allowlist. RLS
-- then filters every row rather than raising, and the dashboard renders the
-- same empty screen it shows before any guest has replied. The couple would see
-- "No entries yet" and have no way to tell that from "your account lost its
-- access" — the worse of the two by far, because the guest list looks like it
-- has been wiped.
--
-- The caller can already infer this bit: they can see whether a select returns
-- rows. Stating it explicitly leaks nothing new and turns a silent, alarming
-- failure into a sentence that tells the reader what to do.
--
-- It is NOT a security control. The policies on public.rsvps still call
-- private.is_admin() and still decide everything; this function is only ever
-- consulted to choose which message to render. Lying to it changes nothing.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin();
$$;

comment on function public.is_admin() is
  'Returns whether the CALLER is on the private.admins allowlist. Presentation '
  'only — the guest list is protected by the RLS policies on public.rsvps, not '
  'by this. Cannot read or enumerate the allowlist.';

-- `anon` has no business asking: it can never be an admin, and an unauthenticated
-- caller should not get a probe endpoint at all.
revoke all on function public.is_admin() from public;
revoke all on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;
