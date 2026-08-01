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

export const supabase = createClient(url, anonKey, {
  auth: {
    // The admin signs in once on a device they own and stays signed in.
    persistSession: true,
    autoRefreshToken: true,
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
  email: string | null;
  attending_mass: boolean;
  attending_reception: boolean;
  companions: { name: string; type: 'adult' | 'child' }[];
  message: string | null;
  created_at: string;
  updated_at: string;
  admin_note: string | null;
  source: string;
  /** Generated: 1 + companions.length. */
  party_size: number;
  /** Generated: digits of `phone`. Duplicates are expected and allowed. */
  phone_normalised: string;
};
