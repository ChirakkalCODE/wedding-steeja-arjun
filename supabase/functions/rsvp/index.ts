/**
 * POST /functions/v1/rsvp — the only way a row reaches `public.rsvps`.
 *
 * The site is a static build on GitHub Pages, so there is no server of ours in
 * front of it and the anon key is public knowledge. A Turnstile token can only
 * be verified by something holding the Turnstile secret, and a static page
 * cannot hold a secret — so the verification, and therefore the write, happens
 * here. `anon` has no privileges on the table at all (see 0001_rsvps.sql); this
 * function writes with the service role, which bypasses RLS.
 *
 * Everything the client sends is re-validated here against the same rules the
 * database enforces. The client's copy of those rules is a courtesy to the
 * guest, not a control.
 *
 * Deploy:  npx supabase functions deploy rsvp
 * Secrets: npx supabase secrets set TURNSTILE_SECRET_KEY=...
 *          (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the
 *           platform — do not set them yourself and do not commit them.)
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

type ErrorCode =
  | 'captcha_failed'
  | 'validation_failed'
  | 'rate_limited'
  | 'server_error';

/** Explicit, no wildcard. The deployed site and local `astro dev`. */
const ALLOWED_ORIGINS = new Set([
  'https://chirakkalcode.github.io',
  'http://localhost:4321',
]);

const MAX_COMPANIONS = 20;
const RATE_WINDOW_MINUTES = 10;
const RATE_MAX_ROWS = 3;

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(
  body: unknown,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function fail(code: ErrorCode, status: number, origin: string | null): Response {
  return json({ ok: false, error: code }, status, origin);
}

/**
 * Strip C0/C1 control characters and collapse whitespace. Guests paste from
 * Word and WhatsApp; a stray U+0000 or a right-to-left override has no business
 * in a name.
 */
function clean(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * To E.164. Accepts the shapes people actually type — spaces, dashes, brackets,
 * a leading 00 — and rejects anything still not conforming afterwards. A local
 * number with no country code is rejected rather than guessed at: this guest
 * list spans India and Switzerland and a wrong guess is worse than a prompt.
 */
function toE164(raw: unknown): string | null {
  const s = clean(raw).replace(/[\s()\-.]/g, '');
  const withPlus = s.startsWith('00') ? `+${s.slice(2)}` : s;
  return /^\+[1-9][0-9]{7,14}$/.test(withPlus) ? withPlus : null;
}

type Companion = { name: string; type: 'adult' | 'child' };

function parseCompanions(raw: unknown): Companion[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_COMPANIONS) return null;

  const out: Companion[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null;
    const name = clean((entry as Record<string, unknown>).name);
    const type = (entry as Record<string, unknown>).type;
    if (name.length < 1 || name.length > 80) return null;
    if (type !== 'adult' && type !== 'child') return null;
    out.push({ name, type });
  }
  return out;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'validation_failed' }, 405, origin);
  }

  if (!req.headers.get('Content-Type')?.includes('application/json')) {
    return fail('validation_failed', 415, origin);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return fail('validation_failed', 400, origin);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return fail('validation_failed', 400, origin);
  }

  // 1. Honeypot. A field no human ever sees, so anything in it is a bot.
  //    Answer 200 with a plausible id: a bot that gets a 400 learns it was
  //    caught and tries something else, a bot that gets a success does not.
  const honeypot = clean(body.company ?? body.website ?? '');
  if (honeypot.length > 0) {
    return json({ ok: true, id: crypto.randomUUID() }, 200, origin);
  }

  // 2. Turnstile, before any other work — it is the cheapest way to stop the
  //    rest of this function being a free validation oracle.
  const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!turnstileSecret) {
    console.error('rsvp: TURNSTILE_SECRET_KEY is not set');
    return fail('server_error', 500, origin);
  }

  const token = typeof body.turnstile_token === 'string' ? body.turnstile_token : '';
  if (!token) return fail('captcha_failed', 403, origin);

  try {
    const form = new FormData();
    form.append('secret', turnstileSecret);
    form.append('response', token);
    const ip = req.headers.get('CF-Connecting-IP') ??
      req.headers.get('X-Forwarded-For')?.split(',')[0].trim();
    if (ip) form.append('remoteip', ip);

    const verify = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: form },
    );
    const result = await verify.json() as { success?: boolean; 'error-codes'?: string[] };

    if (!result.success) {
      // Cloudflare's own codes describe the token, not the person.
      console.warn('rsvp: turnstile rejected', result['error-codes'] ?? []);
      return fail('captcha_failed', 403, origin);
    }
  } catch (err) {
    console.error('rsvp: turnstile request failed', String(err));
    return fail('server_error', 502, origin);
  }

  // 3. Validate everything, mirroring the database constraints.
  const first_name = clean(body.first_name);
  const last_name = clean(body.last_name);
  const phone = toE164(body.phone);
  const emailRaw = clean(body.email);
  const email = emailRaw.length ? emailRaw.toLowerCase() : null;
  const message = clean(body.message);
  const companions = parseCompanions(body.companions);

  const attending_mass = body.attending_mass;
  const attending_reception = body.attending_reception;

  const invalid =
    first_name.length < 1 || first_name.length > 80 ||
    last_name.length < 1 || last_name.length > 80 ||
    phone === null ||
    (email !== null && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) ||
    typeof attending_mass !== 'boolean' ||
    typeof attending_reception !== 'boolean' ||
    companions === null ||
    message.length > 1000;

  if (invalid) {
    // No field values, and no field names either — a name plus a length is
    // still a fragment of somebody's personal data in a log.
    console.warn('rsvp: validation_failed');
    return fail('validation_failed', 400, origin);
  }

  // 4. A decline needs no guest list.
  if (!attending_mass && !attending_reception && companions!.length > 0) {
    console.warn('rsvp: validation_failed (declined with companions)');
    return fail('validation_failed', 400, origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('rsvp: supabase env missing');
    return fail('server_error', 500, origin);
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const phoneNormalised = phone!.replace(/[^0-9]/g, '');

  // 5. Rate limit, per phone rather than per IP: a family replying from one
  //    house shares an address, and blocking them is worse than letting a
  //    determined bot through a captcha it already had to solve.
  try {
    const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000).toISOString();
    const { count, error } = await db
      .from('rsvps')
      .select('id', { count: 'exact', head: true })
      .eq('phone_normalised', phoneNormalised)
      .gte('created_at', since);

    if (error) throw error;
    if ((count ?? 0) >= RATE_MAX_ROWS) {
      console.warn('rsvp: rate_limited');
      return fail('rate_limited', 429, origin);
    }
  } catch (err) {
    console.error('rsvp: rate check failed', String(err));
    return fail('server_error', 500, origin);
  }

  // 6. Insert. `select('id')` returns only the id — the stored row is never
  //    echoed back, so a caller cannot use this endpoint to read anything.
  try {
    const { data, error } = await db
      .from('rsvps')
      .insert({
        first_name,
        last_name,
        phone,
        email,
        attending_mass,
        attending_reception,
        companions,
        message: message.length ? message : null,
        source: 'web',
      })
      .select('id')
      .single();

    if (error) throw error;
    return json({ ok: true, id: data.id }, 201, origin);
  } catch (err) {
    console.error('rsvp: insert failed', String(err));
    return fail('server_error', 500, origin);
  }
});
