-- ---------------------------------------------------------------------------
-- 0002_rsvps_admin_allowlist.sql — replace `using (true)` with an allowlist.
--
-- WHY THIS EXISTS
--
-- 0001 granted every `authenticated` user select/update/delete over the whole
-- guest list, and justified it in a comment: "There is exactly one auth user and
-- public sign-up is disabled, so `true` here means the one account that exists."
--
-- Both halves of that were false when checked against the live project:
--
--   * `select count(*) from auth.users` returned 0 — there was no admin account.
--   * POSTing the *published* anon key to /auth/v1/signup returned 200 and
--     minted an `authenticated` JWT for an attacker-chosen address.
--
-- Confirmed end to end before this migration was written: a self-registered
-- account read every column of a canary row — name, phone, email, private
-- message — and then deleted it, using nothing but the key that ships in the
-- client bundle. The whole guest list was readable and destroyable by anyone.
--
-- `authenticated` does not mean "the admin". It means "anyone who completed a
-- sign-up form". Access is now explicit membership, and the table starts EMPTY,
-- so it does not depend on an auth setting that a dashboard click can flip back.
--
-- TO GRANT THE ADMIN ACCESS, from the SQL editor (never from the client):
--   insert into private.admins (user_id, note)
--   values ('<uuid from auth.users>', 'steeja+arjun admin');
-- (`private` is the schema as of 0003; this migration created it in `public`.)
-- ---------------------------------------------------------------------------
create table public.admins (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  note     text
);

comment on table public.admins is
  'Allowlist for guest-list access. Empty by default. Add a row only via the service role / SQL editor, never from the client.';

alter table public.admins enable row level security;

-- No policy for anybody: nothing that obeys RLS may read or write this table.
-- Only the service role, which bypasses RLS, can change who is an admin.
revoke all on public.admins from anon, authenticated;

-- SECURITY DEFINER so a policy can consult `admins` while `admins` itself stays
-- unreadable to the caller. STABLE, argument-free, and fully qualified under an
-- empty search_path: it can leak nothing but the one boolean about the caller.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a where a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from anon, public;
grant execute on function public.is_admin() to authenticated;

drop policy rsvps_admin_select on public.rsvps;
drop policy rsvps_admin_update on public.rsvps;
drop policy rsvps_admin_delete on public.rsvps;

-- `(select public.is_admin())` rather than a bare call: wrapping it makes it an
-- InitPlan, evaluated once per statement instead of once per row.
create policy rsvps_admin_select on public.rsvps
  for select to authenticated using ((select public.is_admin()));

create policy rsvps_admin_update on public.rsvps
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy rsvps_admin_delete on public.rsvps
  for delete to authenticated using ((select public.is_admin()));
