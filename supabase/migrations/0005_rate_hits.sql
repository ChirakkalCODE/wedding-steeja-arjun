-- ---------------------------------------------------------------------------
-- 0005_rate_hits.sql — somewhere to count recent callers.
--
-- WHY A TABLE AT ALL
--
-- Edge functions are stateless, so "5 submissions per IP per 10 minutes" needs
-- shared storage. The existing limit counts rows already in `rsvps` keyed on
-- `phone_normalised`, which stops working the moment the phone becomes optional:
-- everyone who leaves it blank shares the same (null) key and is therefore
-- unlimited.
--
-- WHAT IS STORED, AND WHAT DELIBERATELY IS NOT
--
-- Never the address. `key_hash` is sha256(ip || pepper), where the pepper is an
-- edge-function secret that never leaves the server. That is enough to count
-- repeat callers and not enough to answer "was this person on the list", which
-- is the only question anyone would want the raw addresses for.
--
-- A hash of an IPv4 address is not anonymous on its own — the space is small
-- enough to enumerate — which is exactly what the pepper is for. Rotating
-- RATE_LIMIT_PEPPER invalidates every existing row, which is fine: they expire
-- in minutes anyway.
--
-- It is a counter, not a log. Rows older than the widest window are deleted on
-- every write, so the table holds minutes of data rather than a record of who
-- visited. There is no user id, no phone, no reply content, and nothing that
-- joins to `rsvps`.
--
-- Unreachable by anything that obeys RLS: `private` is not an exposed schema,
-- and every privilege is revoked besides. Only the service role — which the
-- edge function uses and which bypasses RLS — touches it.
-- ---------------------------------------------------------------------------
create table private.rate_hits (
  id       bigint generated always as identity primary key,
  -- sha256(ip || pepper), hex. Fixed width, so a long address cannot be
  -- distinguished from a short one by the value stored.
  key_hash text        not null check (char_length(key_hash) = 64),
  -- Which limit this counts against: 'submit' or 'check'. Separate buckets, so
  -- filling in the form does not exhaust the duplicate-check allowance.
  kind     text        not null check (kind in ('submit', 'check')),
  at       timestamptz not null default now()
);

comment on table private.rate_hits is
  'Short-lived rate-limit counters keyed on a peppered hash of the caller IP. '
  'Never stores an address. Pruned on every write; holds minutes, not history.';

-- The only query this table ever serves: count rows for one key and kind since
-- a cutoff. Leading with `at` also makes the prune below an index scan.
create index rate_hits_at_idx on private.rate_hits (at);
create index rate_hits_lookup_idx on private.rate_hits (key_hash, kind, at desc);

alter table private.rate_hits enable row level security;

-- No policy for anybody, and no privileges either. Nothing that obeys RLS may
-- read, insert or delete here; the service role bypasses RLS and is the only
-- writer. Stated rather than inherited, as in 0001.
revoke all on table private.rate_hits from anon, authenticated;
