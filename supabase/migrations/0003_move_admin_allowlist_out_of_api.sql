-- ---------------------------------------------------------------------------
-- 0003_move_admin_allowlist_out_of_api.sql
--
-- 0002 left `admins` and `is_admin()` in `public`, which PostgREST exposes over
-- HTTP. Neither was exploitable — the table had every privilege revoked, and the
-- function returns one boolean about the caller — but the allowlist that guards
-- the guest list should not be part of the API surface at all. Reachability
-- should be denied by construction, not by remembering to write a `revoke`.
--
-- In `private` it is not routable: PostgREST serves only its configured schemas.
-- The get_advisors WARN about a signed-in user being able to call a SECURITY
-- DEFINER function via /rest/v1/rpc/is_admin goes away for the same reason.
-- ---------------------------------------------------------------------------
create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;

-- The policies below call into this schema as the invoking user, so the role
-- needs USAGE. `private` is not among PostgREST's exposed schemas, so this
-- grants no HTTP reachability — only the ability to be called from a policy.
grant usage on schema private to authenticated;

drop policy rsvps_admin_select on public.rsvps;
drop policy rsvps_admin_update on public.rsvps;
drop policy rsvps_admin_delete on public.rsvps;

drop function public.is_admin();

alter table public.admins set schema private;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.admins a where a.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_admin() from public;
revoke all on function private.is_admin() from anon;
grant execute on function private.is_admin() to authenticated;

create policy rsvps_admin_select on public.rsvps
  for select to authenticated using ((select private.is_admin()));

create policy rsvps_admin_update on public.rsvps
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy rsvps_admin_delete on public.rsvps
  for delete to authenticated using ((select private.is_admin()));
