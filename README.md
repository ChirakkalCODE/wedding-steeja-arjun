# Steeja &amp; Arjun — wedding site

One-page wedding site for 6 September 2026, Akaparambu &amp; Nedumbassery, Kerala.

**Built so far: the hero, the countdown, Our Story, the Schedule, the Venues,
the Dress code, Travel & stay, Moments, Q&A and Contact.** Every link in the top
bar resolves; `#rsvp` is the one stub left, awaiting its section.

Moments is driven entirely by `src/data/gallery.ts`. Adding a photo is one
entry in that array — the grid, the lightbox and the reveal stagger all read
from it. The set deliberately mixes black and white with colour and portrait
with landscape; nothing normalises that, and the one landscape frame spans two
columns above 640px.

Two full-bleed `ImageBand`s break the page out of its content column — one
carrying the couple's thank-you between Our Story and the Schedule, one silent
between Travel and Moments. A fixed feTurbulence grain layer sits over the whole
page at 3.5%; both are described where they are defined
(`src/components/ImageBand.astro`, `src/styles/global.css`).

### Copy still to be written

Four placeholders render as a visible `<!-- COPY TODO -->` marker in a monospace
face — deliberately unmissable, because an empty paragraph under a heading reads
as a bug and an invisible marker is one that ships.

| file | line | what goes here |
| --- | --- | --- |
| `src/components/Travel.astro` | 35 | Flying from Switzerland |
| `src/components/Travel.astro` | 39 | Travelling within India |
| `src/components/Travel.astro` | 88 | Getting around |
| `src/components/Travel.astro` | 92 | Weather in September |

Open TODOs in data: `src/data/travel.ts:38` (`HOTELS` is empty),
`src/data/wedding.ts:43` and `:55` (venue coordinates), and the commented-out
children group in `src/data/dresscode.ts`.

Nothing about flights, drive times, taxi fares, distances or visa rules was
written speculatively. The entry-requirements line links to the official portal
and states nothing that could go stale.

`src/data/dresscode.ts` holds the three guest groups and the two colours to
avoid. **A fourth group for children is present but commented out** — the couple
has not decided a rule, so none was invented. Uncomment it, fill in `garment` and
`palette`, and the pills, the panel CSS and the selector all handle it with no
other change.

`src/data/wedding.ts` is the single source of truth for the date, the times and
the two venues. The Schedule, the Venue cards and `/wedding.ics` all read from
it, so nothing about the day is written twice.

**The venue coordinates are still `null`, marked TODO.** While they are, the
maps fall back to a text query on "venue, area", which Google resolves correctly
for both. They were left empty rather than guessed — a wrong pin sends guests to
the wrong church.

## Running it

```bash
npm install
npm run dev
```

| script | what it does |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | `astro check` (TypeScript, strict) then a static build into `dist/` |
| `npm run preview` | serve the built `dist/` |
| `npm run media` | regenerate the derived photo crops — see below |
| `npm run prune` | (runs automatically as `postbuild`) drops unreferenced files from `dist/_astro/` |

`prune` exists because Astro leaves the full-size master of any image in the
build once something reads a property off the imported object — an imported
image is a Proxy, and `<Image>`/`<Picture>` both read `width`/`height` to size
their fallback `<img>`. That is a megabyte in the deploy that no visitor ever
requests. `scripts/prune-dist.mjs` collects every `_astro/…` filename mentioned
in the built HTML/CSS/JS and deletes whatever is left over.

## Deploying

`.github/workflows/deploy.yml` builds with `withastro/action` and publishes to
GitHub Pages on every push to `main`. Two things to check once, in the repo's
**Settings → Pages**: set **Source** to **GitHub Actions**.

`astro.config.mjs` hard-codes where the site will live:

```js
site: 'https://chirakkalcode.github.io',
base: '/wedding-steeja-arjun',
```

`site` was taken from the signed-in GitHub account (`ChirakkalCODE`). **If the
repo is pushed to a different account, change `site` to match** — it is what
builds the absolute `og:image` and canonical URLs that WhatsApp reads. `base`
must stay equal to the repository name.

Nothing hand-written starts with a bare `/`: internal paths go through
`withBase()` in `src/lib/paths.ts`, and Astro rewrites the URLs it generates
itself.

## Photographs

Originals live in `src/assets/photos/` and are **never imported by the page** —
Astro copies an imported original into `dist/` alongside its transforms, and a
10 MB JPEG has no business on a Pages deploy. `scripts/prepare-media.mjs`
derives what the page actually uses:

| output | what it is |
| --- | --- |
| `src/assets/photos/EPW09695-wide.jpg` | hero, full 2:3 frame, 1920x2880 — used at 900px and up |
| `src/assets/photos/EPW09695-phone.jpg` | hero, 4:5 crop, 1920x2400 — used below 900px |
| `src/assets/photos/EPW00926-4x5.jpg` | Our Story, 4:5 crop, 1920x2400 |
| `public/og-steeja-arjun.jpg` | 1200x630 landscape crop for link previews |

These are committed, so CI never touches the originals. Re-run `npm run media`
after replacing a source photo; the script asserts the expected 5760x8640 input
because the crop windows are measured against that frame.

The hero is art-directed by hand in `Hero.astro` rather than with `<Picture>`,
because `<Picture>` emits no `media` attribute and so cannot switch crops. It is
the same `astro:assets` pipeline, the same `formats={['avif','webp']}` and the
same `widths={[640,960,1400,1920]}`.

## Design tokens

Four colours and two families, in the `@theme` block in `src/styles/global.css`.
Everything else derives from them. Two exceptions exist and are deliberate: the
warm browns behind the hero type (`--shade-rgb`, `--shade-deep-rgb`) come from
the brief and never appear as a surface colour, only between the photograph and
the text.

The `@theme` block is `@theme static`. Most of the CSS is hand-written inside
component `<style>` blocks, which Tailwind does not scan, so without `static` it
tree-shakes any token it cannot see in use — `--color-muted` silently vanished
before this was set.

## The two scripts

**The countdown** (`Countdown.astro`) counts to `2026-09-06T15:30:00+05:30`. The
IST offset is part of the literal on both sides — the frontmatter and the inline
script use the same string — so guests in Switzerland and Kerala see the same
number rather than one derived from their own clock. Values are rendered at build
time and corrected synchronously by the script's first statement, so there is no
dash to flash. It clamps at zero and clears its interval on arrival.

The clock is `aria-hidden` with `aria-live="off"`: a region announcing a new
number every second is unusable with a screen reader. A visually hidden sentence
carries the date in prose instead.

**The reveal** (`index.astro`) is one `IntersectionObserver` for both sections,
unobserving each element as it fires. It runs in the head so the hidden state
applies before first paint — set up on `DOMContentLoaded` instead and the
sections paint, vanish, then fade back in. The hidden state is gated on a `reveal`
class that the script puts on `<html>`, which buys two things for one line: with
JavaScript unavailable the class never appears and the content is simply visible,
and under `prefers-reduced-motion` the script returns before adding it, so no
observer is ever created.

## The calendar file and the maps

`/wedding.ics` is an Astro static endpoint (`src/pages/wedding.ics.ts`), built
from the same data as the page so the two can never disagree. `DTSTART`/`DTEND`
are UTC with a `Z` suffix rather than carrying a `VTIMEZONE` block — both are
valid RFC 5545, and UTC is the form no client can misread, which is what matters
when half the guest list opens it on a phone set to Swiss time. Lines are folded
at 75 octets on code-point boundaries with CRLF endings; iOS Calendar rejects
the whole file otherwise.

The maps are **click-to-load facades**, not iframes. Google's embed pulls half a
megabyte across 27 requests, and none of it is fetched until someone asks for
it. The facade is a real `<button>`, so it works from the keyboard, and the swap
is announced through a `role="status"` region. "Copy address" is a `<button>`
too rather than the ghost *link* the brief named — it copies, it does not
navigate, and a link that goes nowhere is the wrong control for a screen-reader
user. It keeps the ghost-link styling.

## The dress code section

The group selector is **CSS only** — three visually hidden radios and
`:checked ~` sibling rules. No JavaScript is involved in switching groups, so
the section works with scripting turned off; verified by loading it with script
execution disabled and switching groups. The rules are enumerated by index
rather than by id so a fourth group needs no CSS change.

The only JavaScript is the swatch copy, and it is a genuine upgrade rather than
a dependency. Swatches render as inert `<span>`s; when `navigator.clipboard`
exists the script replaces each with a real `<button>` — inheriting focus, Enter
and Space for free — and unhides the "tap a colour to copy" line. Without the
API there is no dead control and no instruction for something the browser cannot
do. The three garment silhouettes are inline SVG drawn for this site; the
"please avoid" swatches carry a diagonal strike and their names, and are neither
focusable nor copyable.

Every swatch is labelled in text — the hex for the palettes, the colour name for
the two to avoid — so colour is never the only carrier of meaning, and those
labels sit on shell rather than on the swatch, several of which are far too pale
to hold text.

## Measured

Chrome 150, `astro preview`, cold cache.

| viewport | hero image transferred | page total |
| --- | --- | --- |
| 320x568 @2 | 52.5 kB | 148.8 kB |
| 412x823 @1.75 (Lighthouse mobile) | 91.4 kB | 187.8 kB |
| 390x844 @3 | 146.0 kB | 242.4 kB |
| 1440x900 and above | 163.8 kB | 260.1 kB |

All CSS is inlined into the document, so there is no render-blocking stylesheet.
The Our Story photo is lazy and below the fold, so it is not in those totals; it
costs a further 13–37 kB depending on viewport.

Gallery images, cold cache, whole page scrolled: **281 kB** for all eight at
390x844 @3, **184 kB** at 1440x900 @1. The lightbox fetches nothing until a
photo is opened, and then only the current frame and its two neighbours.

**JavaScript: 8.6 kB raw, in zero requests.** Five inline
scripts — the
countdown clock, the shared reveal observer, the map facades and the dress-code
swatch copy. No bundle, no framework, no `<script src>`. Every one of them is an
enhancement: with scripting off the page loses the live clock, the reveal
animation, the inline maps and the copy button, and keeps everything else.

Whole page, scrolled to the bottom, on a 412px phone:

| | page weight | requests | third-party |
| --- | --- | --- | --- |
| as loaded | 207.8 kB | 7 | **0 bytes** |
| after opening one map | 753.4 kB | 34 | 545.5 kB |
| after opening both maps | 829.4 kB | 45 | 621.5 kB |

That is the whole argument for the facade: the page costs 208 kB and contacts
nobody, and a single map costs two and a half times the entire rest of the site.
The second map adds only 76 kB because it reuses the first one's payload.

Lighthouse (mobile, default simulated throttling, three consecutive runs):
**performance 100, accessibility 100, best practices 100, SEO 100.**
FCP 0.65 s, LCP 1.66 s, TBT 0 ms, **CLS 0** — measured independently too, via a
`layout-shift` PerformanceObserver at seven viewports from 320px to 2560px,
scrolling the full page each time.

## Where this departs from the brief

Three places. Each was measured, not guessed.

**1. The hero scrim is not fully transparent at its centre.** The brief's radial
layer started at `transparent 30%`, which leaves the middle of the scrim clear —
exactly where the centred content sits, and on this photograph exactly where the
sunlit ochre wall is. Sampling the real composited pixels under every run of
glyphs, at eight viewports from 320px to 2560px, the type came out at
**2.37–4.30:1** where WCAG asks 4.5:1 (3:1 for the names). 46 of 69
element/viewport combinations failed.

The inner stop is now `0.38` instead of `transparent`. The gradient's geometry
and its outer stop are untouched. Alongside it, the secondary type sits closer
to full shell than the brief's values — eyebrow `.86 → .95`, location
`.78 → .92`, reply-by `.72 → .88`, scroll `.72 → .85`, nav links `.82 → .92`.
Both levers were needed: holding the brief's opacities would have forced the
inner stop to `0.45`, which flattens the vignette into a uniform wash and
darkens the photograph considerably more. Buying legibility with opacity instead
keeps the picture brighter, which is the way round the brief's own rule points —
the photo carries the colour, the interface stays quiet. Every element now
clears its threshold at every viewport, worst case 5.19:1.

**2. The top bar does not animate in.** Chrome excludes an image that covers the
*entire* viewport from being a Largest Contentful Paint candidate (verified
directly: at `inset: 1px` the hero photo becomes the LCP, at `inset: 0` it does
not). The entrance animation starts every text element at `opacity: 0`, which
disqualifies those as well — so the page had **no LCP candidate at all**, and
Lighthouse's default simulated run did not merely score it badly, it failed with
`NO_LCP` and returned performance 0. Painting the wordmark immediately gives the
page a real first contentful element. The brief's 0 / .12s / .2s stagger applies
to the hero content, which is untouched; animating the bar as well had been an
addition rather than a requirement.

**3. Two padding rules respond to viewport height.** The frame's padding is
driven by viewport *width*, so on a screen that is short for its width — a
1280x720 laptop — it pushed the frame's bottom edge and the Scroll label below
the fold. A `max-height` rule compresses it there. Separately, below 900px the
frame keeps a top-padding floor that clears the top bar: on a 320px screen the
eyebrow wraps to two lines and ran straight into the wordmark.

At 320x568 the hero ends up 23px taller than the viewport. That is deliberate —
the section is `min-height: 100svh` and grows rather than clipping the names.

## Notes for later steps

- The hero's small type is smaller than the 1rem–1.125rem floor the brief sets
  for body copy (eyebrow `.7rem`, reply-by `.82rem`, Scroll `.65rem`). Those are
  the brief's own values for hero micro-typography and are captions rather than
  body text, but with an audience skewing over 60 they are worth a second look
  when the rest of the page exists to compare them against.
- At desktop widths the names sit across her face. That follows from
  `object-position: 50% 38%` plus grid-centred content, both as specified; it is
  a composition call rather than a bug, and moving either one would fix it.
- Inter Variable is 47 kB of the 90 kB of fonts, for a page that uses a single
  weight. If the font budget ever matters more than it does now, the static
  `@fontsource/inter` 400 face is about a third of that.

## Supabase backend (RSVPs)

### Why guests never touch the database

The site is a static build on GitHub Pages. There is no server of ours in front
of it, so the anon key is compiled into the client bundle and must be treated as
public. A Turnstile token can only be verified by something holding the
Turnstile *secret*, and a static page cannot hold a secret.

So `anon` is granted nothing on `public.rsvps` — no select, insert, update or
delete. The anon key is useless on its own; it exists only so the admin area can
sign in. Every write goes through the `rsvp` edge function, which verifies
Turnstile server-side and then inserts with the service role (which bypasses
RLS). There is deliberately no INSERT policy for anybody.

If replies ever stop arriving, the fault is in the edge function or its secrets.
It is never "anon needs an insert policy".

### Where each secret lives

| Value | Lives in | Public? |
| --- | --- | --- |
| `PUBLIC_SUPABASE_URL` | `.env`, compiled into the bundle | yes, by design |
| `PUBLIC_SUPABASE_ANON_KEY` | `.env`, compiled into the bundle | yes, by design |
| `PUBLIC_TURNSTILE_SITE_KEY` | `.env`, compiled into the bundle | yes, by design |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function secrets **only** | **never** — injected by the platform |
| `TURNSTILE_SECRET_KEY` | Edge Function secrets **only** | **never** |

`.env` is gitignored (`.env`, `.env.*`, with `!.env.example` re-included).
The two secrets appear in no file in this repo, and never should.

### Applying migrations

```bash
npx supabase@latest login
npx supabase@latest link --project-ref <your-project-ref>
npx supabase@latest db push          # applies supabase/migrations/*.sql in order
```

The schema is the migration file, not the dashboard. If you change something by
clicking, this repo is wrong and the next `db push` onto a fresh project will
not reproduce production. Verify what actually landed with:

```bash
npx supabase@latest db diff --linked   # should print nothing
```

### Deploying the edge function

```bash
npx supabase@latest secrets set TURNSTILE_SECRET_KEY=<cloudflare-secret>
npx supabase@latest functions deploy rsvp
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into the function by
the platform — do not set them yourself. The deployed URL is
`https://<project-ref>.supabase.co/functions/v1/rsvp`.

CORS is an explicit allowlist, not a wildcard: `https://chirakkalcode.github.io`
and `http://localhost:4321`. A new origin means editing `ALLOWED_ORIGINS` in
`supabase/functions/rsvp/index.ts` and redeploying.

### Rotating keys

- **Turnstile secret** — roll it in the Cloudflare dashboard, then
  `npx supabase@latest secrets set TURNSTILE_SECRET_KEY=<new>` and redeploy the
  function. The site key is unchanged, so the front end needs no rebuild.
- **Service role key** — Supabase dashboard → Settings → API → roll. It is
  injected automatically, so redeploy the function and nothing else.
- **Anon key** — rolling it invalidates the compiled bundle: update `.env`,
  rebuild and push, because the old key is baked into the deployed HTML.
- After any rotation, re-run the anon lockdown check in the test log below. A
  rotated anon key must still be able to do nothing.

### Auth settings (must be set in the dashboard)

Both of these are project settings, not migrations, so they are recorded here:

1. **Email confirmations: OFF.** The admin address is
   `admin@steeja-arjun.invalid`, a non-routable placeholder on the reserved
   `.invalid` TLD. It has no inbox, so a confirmation mail could never be
   answered. Dashboard → Authentication → Providers → Email → uncheck
   "Confirm email".
2. **Public sign-ups: DISABLED.** There must be exactly one account, forever.
   Dashboard → Authentication → Sign In / Providers → "Allow new users to sign
   up" → off. With this off, the `authenticated` RLS policies (`using (true)`)
   mean "the one account that exists" rather than "anyone who registers".

The admin user is created once, by hand, and its password is generated at 32+
characters and kept in a password manager. It is never committed and never
printed into a terminal that is being recorded.