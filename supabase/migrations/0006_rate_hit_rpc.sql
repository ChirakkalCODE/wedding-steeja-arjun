-- ---------------------------------------------------------------------------
-- 0006_rate_hit_rpc.sql — make the rate limit from 0005 actually work.
--
-- 0005 created `private.rate_hits` and the edge function wrote to it with
-- `db.schema('private').from('rate_hits')`. That never worked: supabase-js
-- talks to PostgREST, and PostgREST only routes to the schemas it is configured
-- to serve. `private` is deliberately not one of them (see 0003), and the
-- service role bypassing RLS does not change what PostgREST will route to.
--
-- The bad part was not that it failed. It was that it failed SILENTLY: the
-- error was caught by the limiter's own fail-open branch, so every call was
-- unlimited while the code read as though it were limited. It was only caught
-- because `select count(*) from private.rate_hits` came back empty after two
-- calls that should each have recorded one.
--
-- So the table stays exactly where it is — unreachable over HTTP — and one
-- SECURITY DEFINER function does the whole thing. As a bonus the count, the
-- insert and the prune are now one statement each inside a single call rather
-- than three separate round trips that could interleave.
-- ---------------------------------------------------------------------------
create or replace function public.rate_hit(
  p_key_hash text,
  p_kind     text,
  p_window_seconds integer,
  p_max      integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  select count(*) into recent
  from private.rate_hits h
  where h.key_hash = p_key_hash
    and h.kind = p_kind
    and h.at > now() - make_interval(secs => p_window_seconds);

  insert into private.rate_hits (key_hash, kind) values (p_key_hash, p_kind);

  -- A counter, not a log: anything past the widest window is gone.
  delete from private.rate_hits where at < now() - interval '15 minutes';

  return recent >= p_max;
end;
$$;

comment on function public.rate_hit(text, text, integer, integer) is
  'Records a call and returns whether the caller is now over the limit. Service '
  'role only; the underlying table stays in the unexposed private schema.';

-- Only the edge function calls this. anon and authenticated have no business
-- writing rate-limit rows, and granting them execute would let anyone burn a
-- guest through their own allowance.
revoke all on function public.rate_hit(text, text, integer, integer) from public;
revoke all on function public.rate_hit(text, text, integer, integer) from anon;
revoke all on function public.rate_hit(text, text, integer, integer) from authenticated;
grant execute on function public.rate_hit(text, text, integer, integer) to service_role;
