-- ---------------------------------------------------------------------------
-- 0007_flagged_spam_and_optional_phone.sql
--
-- Two launch blockers, both found by reading the edge-function logs after a
-- real submission vanished.
--
-- 1. THE HONEYPOT WAS EATING REAL REPLIES.
--
--    The log showed `POST | 200` where a successful insert returns 201. The
--    only path returning 200 was the honeypot's fake success: it answered
--    "Thank you" and wrote nothing. It fired on a genuine guest because the
--    field was called `website` and carried a visible "Website" label, which is
--    precisely what Chrome and Safari autofill from a saved profile —
--    `autocomplete="off"` is widely ignored for non-credential fields.
--
--    The guest could not possibly find out: they saw the same success screen as
--    everyone else. At 300 guests, one silently lost reply costs far more than
--    a spam row somebody deletes in two seconds.
--
--    So nothing is discarded any more. A caught submission is stored with
--    `flagged_spam = true`, the guest gets the identical response, and the
--    admin area shows it for review, keeps it out of the attendance counters,
--    and offers a one-click "Not spam".
--
-- 2. A BLANK PHONE COULD NOT BE STORED.
--
--    13b made the phone optional in the form and in the function but left the
--    column `not null`, so every guest who left it blank hit a 500. The CHECK
--    constraint needs no change and deliberately gets none: `null ~ '...'`
--    evaluates to null, and a CHECK treats null as passing, so a malformed
--    NON-null value is still rejected. Verified both ways before this file was
--    written.
-- ---------------------------------------------------------------------------
alter table public.rsvps
  add column flagged_spam boolean not null default false;

comment on column public.rsvps.flagged_spam is
  'Set when the honeypot matched. The row is kept and shown for review rather '
  'than discarded — a false positive must never lose a real reply.';

-- Partial: almost every row is false, and the admin only ever queries the true
-- ones. An index over the whole column would be mostly dead weight.
create index rsvps_flagged_spam_idx on public.rsvps (created_at desc)
  where flagged_spam;

alter table public.rsvps
  alter column phone drop not null;
