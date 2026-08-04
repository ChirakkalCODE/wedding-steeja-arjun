/**
 * The browser Supabase client, for the admin area only.
 *
 * The public RSVP form does NOT import this. It posts to the `rsvp` edge
 * function with `fetch`, because the write has to happen behind a Turnstile
 * check that only the server can verify. Importing this into a public component
 * would pull the client into the guest bundle for no reason and invite somebody
 * to "just insert directly", which the database will refuse anyway — `anon` has
 * no privileges on `public.rsvps`.
 *
 * So the only things this client can do with the anon key are: sign the admin
 * in, and — once signed in, as `authenticated` — read and edit replies. That is
 * exactly the surface the admin area needs and nothing more.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY must be set. Copy .env.example to .env.',
  );
}

/**
 * Storage is named explicitly rather than left to detection.
 *
 * `persistSession: true` on its own was not enough: supabase-js decides where
 * to put the session by sniffing the environment, and when that sniff comes
 * back negative it silently falls back to an in-memory store. The symptom was
 * ugly and hard to attribute — signing in worked, the first SELECT worked, and
 * then every write failed with `permission denied for table rsvps`, because the
 * session existed only in a closure and the next request went out as `anon`,
 * which has every privilege revoked. Nothing in localStorage, no error, no
 * warning.
 *
 * Naming the store and the key removes the guess. It also pins the key, so a
 * future change to how the project ref is derived cannot silently orphan an
 * existing session and sign the couple out.
 *
 * `globalThis.localStorage` rather than `window.localStorage`: this module is
 * only ever bundled for the browser, but the optional access means importing it
 * anywhere else fails loudly at the call site instead of throwing at module
 * load.
 */
const browserStorage =
  typeof globalThis !== 'undefined' && globalThis.localStorage
    ? globalThis.localStorage
    : undefined;

export const supabase = createClient(url, anonKey, {
  auth: {
    // The admin signs in once on a device they own and stays signed in.
    persistSession: true,
    autoRefreshToken: true,
    storage: browserStorage,
    /* Explicit, and deliberately not derived from `url`. The session must
       survive a reload and a browser restart, so the key it is filed under has
       to be stable across builds. */
    storageKey: 'sa-wedding-admin-auth',
    // Nothing arrives back via a URL fragment: there is no magic-link or OAuth
    // flow here, just email and password for the one account.
    detectSessionInUrl: false,
  },
});

/** Shape of a row as the admin area reads it. Mirrors 0001_rsvps.sql. */
export type Rsvp = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  /* Still selected by `select('*')`, so it stays on the type to keep this an
     honest mirror of the table — but nothing reads it. The column was kept
     nullable and unused rather than dropped; the admin editor and the CSV
     export both deliberately leave it out. Do not wire it back into either. */
  email: string | null;
  attending_mass: boolean;
  attending_reception: boolean;
  companions: { name: string; type: 'adult' | 'child' }[];
  message: string | null;
  created_at: string;
  updated_at: string;
  admin_note: string | null;
  /** Set when the honeypot matched. The row is kept for review, never dropped. */
  flagged_spam: boolean;
  source: string;
  /** Generated: 1 + companions.length. */
  party_size: number;
  /** Generated: digits of `phone`. Duplicates are expected and allowed. */
  phone_normalised: string;
};
