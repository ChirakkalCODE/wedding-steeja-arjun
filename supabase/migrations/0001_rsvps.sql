-- ---------------------------------------------------------------------------
-- 0001_rsvps.sql — the RSVP table, its constraints, and its lockdown.
--
-- Apply with `npx supabase db push`. This file is the schema; the dashboard is
-- only ever a viewer. If you change something by clicking, this file is wrong
-- and the next `db push` on a fresh project will not reproduce production.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

create table public.rsvps (
  id                  uuid primary key default gen_random_uuid(),
  first_name          text not null check (char_length(trim(first_name)) between 1 and 80),
  last_name           text not null check (char_length(trim(last_name))  between 1 and 80),
  phone               text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),  -- E.164
  email               text     check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  attending_mass      boolean not null,
  attending_reception boolean not null,
  companions          jsonb not null default '[]'::jsonb,
  message             text     check (message is null or char_length(message) <= 1000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  admin_note          text,
  source              text not null default 'web'
);

comment on table public.rsvps is
  'One row per reply. Written only by the `rsvp` edge function using the service '
  'role; see the RLS block at the foot of this file before changing any grant.';

-- ---------------------------------------------------------------------------
-- companions: a JSON array of { name: non-empty text, type: 'adult' | 'child' }
--
-- Split into two constraints on purpose. The shape check is the interesting one
-- and a violation of it should not be reported as "too many companions".
--
-- `jsonb_array_length` errors rather than returns null on a non-array, so the
-- array check has to come first and the length check has to repeat the type
-- test — CHECK constraints have no guaranteed evaluation order.
-- ---------------------------------------------------------------------------
alter table public.rsvps
  add constraint rsvps_companions_is_array
    check (jsonb_typeof(companions) = 'array');

alter table public.rsvps
  add constraint rsvps_companions_max_20
    check (jsonb_typeof(companions) <> 'array' or jsonb_array_length(companions) <= 20);

-- The element shape lives in a function because PostgreSQL forbids subqueries
-- in a CHECK constraint, and testing "every element of an array" needs one.
-- IMMUTABLE and depending on nothing outside its argument, so it is safe to
-- call from a constraint.
--
-- `is distinct from` rather than `<>` throughout: a companion object with no
-- `name` key at all yields SQL NULL, and `NULL <> 'string'` is NULL, which a
-- CHECK treats as passing. That is exactly how a malformed entry would have
-- slipped through.
create or replace function public.rsvps_companions_shape_ok(c jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1
    from jsonb_array_elements(c) as e
    where jsonb_typeof(e) is distinct from 'object'
       or jsonb_typeof(e -> 'name') is distinct from 'string'
       or char_length(btrim(e ->> 'name')) = 0
       or char_length(e ->> 'name') > 80
       or (
            (e ->> 'type') is distinct from 'adult'
        and (e ->> 'type') is distinct from 'child'
          )
  );
$$;

alter table public.rsvps
  add constraint rsvps_companions_shape
    check (
      jsonb_typeof(companions) <> 'array'
      or public.rsvps_companions_shape_ok(companions)
    );

-- ---------------------------------------------------------------------------
-- Generated columns.
--
-- `party_size` counts the person replying plus everyone they are bringing, so a
-- head count is a sum of one column rather than a query that has to know the
-- rule.
--
-- `phone_normalised` is the digits only, so +91 62821 85195 and +916282185195
-- collapse to the same value. The index is deliberately NOT unique: two people
-- in one household legitimately share a phone, and a duplicate is something the
-- admin should be able to see, never something the database refuses. It is also
-- what the edge function's rate limit counts against.
-- ---------------------------------------------------------------------------
-- The `case` is not decoration. Generated columns are computed BEFORE check
-- constraints run, and `jsonb_array_length` raises on a non-array — so without
-- it, posting `"companions": {}` fails with a raw type error from deep inside
-- the executor instead of the constraint violation that describes the problem.
alter table public.rsvps
  add column party_size integer
    generated always as (
      1 + jsonb_array_length(
        case when jsonb_typeof(companions) = 'array' then companions else '[]'::jsonb end
      )
    ) stored;

alter table public.rsvps
  add column phone_normalised text
    generated always as (regexp_replace(phone, '[^0-9]', '', 'g')) stored;

create index rsvps_phone_normalised_idx on public.rsvps (phone_normalised);
create index rsvps_created_at_desc_idx  on public.rsvps (created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
-- Not SECURITY DEFINER: it needs no privilege the writer does not already have,
-- and a definer-rights trigger is a standing escalation for no reason.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger rsvps_set_updated_at
  before update on public.rsvps
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- READ THIS BEFORE ADDING A POLICY FOR anon.
--
-- The site is a static build on GitHub Pages. There is no server of ours in
-- front of it, which means the anon key is published in the client bundle and
-- must be treated as public knowledge — anyone who opens devtools has it.
--
-- So `anon` is granted nothing at all. Not insert-only, not
-- insert-with-a-clever-check: nothing. If anon could insert, anyone with the
-- key could write rows straight to this table with curl, and the Turnstile
-- widget on the form would be decoration — it can only be verified by something
-- holding the Turnstile secret, and a static page cannot hold a secret.
--
-- Every write therefore goes through the `rsvp` edge function, which verifies
-- the Turnstile token server-side and then writes with the service role. The
-- service role bypasses RLS by design, which is why there is no insert policy
-- here for anybody: nothing that obeys RLS is ever supposed to insert.
--
-- If replies stop arriving, the bug is in the edge function or its secrets. It
-- is never "anon needs an insert policy".
-- ---------------------------------------------------------------------------
alter table public.rsvps enable row level security;

-- Supabase grants table privileges to anon/authenticated by default on new
-- tables in `public`. RLS alone would already block anon (no policy = no rows),
-- but belt and braces: take the privileges away too, so a future policy added
-- by accident still cannot be exercised.
revoke all on public.rsvps from anon;
revoke all on function public.rsvps_companions_shape_ok(jsonb) from anon;

-- Stated rather than inherited. Supabase's default privileges would grant these
-- anyway, but a migration that only ever takes privileges away is one you
-- cannot read to find out what the admin is allowed to do.
grant select, update, delete on public.rsvps to authenticated;

-- The admin, and only the admin. There is exactly one auth user and public
-- sign-up is disabled, so `true` here means "the one account that exists".
create policy rsvps_admin_select on public.rsvps
  for select to authenticated using (true);

create policy rsvps_admin_update on public.rsvps
  for update to authenticated using (true) with check (true);

create policy rsvps_admin_delete on public.rsvps
  for delete to authenticated using (true);

-- Deliberately no INSERT policy for any role. See the block above.
