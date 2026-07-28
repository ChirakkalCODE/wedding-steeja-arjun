# Steeja &amp; Arjun — wedding site

One-page wedding site for 6 September 2026, Akaparambu &amp; Nedumbassery, Kerala.

**Step 1 of the build: project setup and the hero only.** No other section is
scaffolded yet. The top bar's Story / Schedule / Q&amp;A links already point at
`#story`, `#schedule`, `#faq`, which do not exist until a later step.

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
| `src/assets/photos/EPW09695-wide.jpg` | full 2:3 frame, 1920x2880 — used at 900px and up |
| `src/assets/photos/EPW09695-phone.jpg` | 4:5 crop, 1920x2400 — used below 900px |
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

## Measured

Chrome 150, `astro preview`, cold cache.

| viewport | hero image transferred | page total |
| --- | --- | --- |
| 320x568 @2 | 52.5 kB | 148.8 kB |
| 412x823 @1.75 (Lighthouse mobile) | 91.4 kB | 187.8 kB |
| 390x844 @3 | 146.0 kB | 242.4 kB |
| 1440x900 and above | 163.8 kB | 260.1 kB |

Six requests, zero of them JavaScript. All CSS is inlined into the document, so
there is no render-blocking stylesheet; the document is 20.1 kB raw and 5.6 kB
on the wire.

Lighthouse (mobile, default simulated throttling, three consecutive runs):
**performance 100, accessibility 100, best practices 100, SEO 100.**
FCP 0.64 s, LCP 1.58 s, TBT 0 ms, CLS 0.

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
