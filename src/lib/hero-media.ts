import { getImage } from 'astro:assets';
// Derived masters, not the originals — see scripts/prepare-media.mjs. Astro
// copies an imported original into `dist/` next to its transforms, so the
// 5760x8640 files are deliberately never imported anywhere.
import wideSource from '../assets/photos/EPW09695-wide.jpg';
import phoneSource from '../assets/photos/EPW09695-phone.jpg';

/**
 * The hero is art-directed, and `<Picture>` cannot do art direction — it emits
 * one `<source>` per format with no `media`. So the variants are generated with
 * `getImage()` (same `astro:assets` pipeline, same formats and widths) and the
 * `<picture>` element is assembled by hand in `Hero.astro`.
 *
 * The 5760x8640 original is never referenced directly by the page; every URL
 * below is a processed derivative.
 */
export const HERO_WIDTHS = [640, 960, 1400, 1920];

/** Below this the phone crop is used, at or above it the full frame. */
export const PHONE_MEDIA = '(max-width: 899.98px)';
export const WIDE_MEDIA = '(min-width: 900px)';

/**
 * The photo is `object-fit: cover` on a 100svh box, so its painted width is not
 * the viewport width. On a tall phone the 4:5 crop is scaled to match the
 * viewport *height*, which makes it roughly half again as wide as the screen —
 * hence 150vw. Above 900px the full frame is wider than it is tall relative to
 * the box, so it is pinned by width and 100vw is exact.
 */
export const PHONE_SIZES = '150vw';
export const WIDE_SIZES = '100vw';

/**
 * Per-format quality. AVIF holds detail on this photo far below the default,
 * and the hero is the LCP element on mobile, so it is tuned down hardest.
 */
const QUALITY = { avif: 45, webp: 62, jpeg: 74 } as const;

type Variant = { srcset: string };

async function variant(
  src: typeof wideSource,
  format: keyof typeof QUALITY,
): Promise<Variant> {
  const image = await getImage({
    src,
    // `widths` alone leaves the primary `src` transform unbounded, which emits
    // a full-resolution copy of the master into `dist/` on top of the srcset.
    // Pinning it to the widest entry makes it dedupe with that entry instead.
    width: HERO_WIDTHS[HERO_WIDTHS.length - 1],
    widths: HERO_WIDTHS,
    format,
    quality: QUALITY[format],
  });
  return { srcset: image.srcSet.attribute };
}

export type HeroMedia = {
  phone: Record<keyof typeof QUALITY, Variant>;
  wide: Record<keyof typeof QUALITY, Variant>;
  /** Plain `<img>` fallback: the widest desktop JPEG. */
  fallback: { src: string; width: number; height: number };
};

let cached: Promise<HeroMedia> | undefined;

export function heroMedia(): Promise<HeroMedia> {
  // `Hero.astro` needs the sources and `index.astro` needs the preload; both
  // must resolve to byte-identical URLs or the preload double-downloads.
  cached ??= build();
  return cached;
}

async function build(): Promise<HeroMedia> {
  const [
    phoneAvif,
    phoneWebp,
    phoneJpeg,
    wideAvif,
    wideWebp,
    wideJpeg,
    fallback,
  ] = await Promise.all([
    variant(phoneSource, 'avif'),
    variant(phoneSource, 'webp'),
    variant(phoneSource, 'jpeg'),
    variant(wideSource, 'avif'),
    variant(wideSource, 'webp'),
    variant(wideSource, 'jpeg'),
    getImage({
      src: wideSource,
      width: 1920,
      format: 'jpeg',
      quality: QUALITY.jpeg,
    }),
  ]);

  // Taken off the resolved transform rather than off `wideSource`. An imported
  // image is a Proxy, and reading any property of it registers the file as
  // "referenced", which stops Astro deleting the untransformed master from
  // `dist/` — a silent 2 MB on the deploy.
  // See node_modules/astro/dist/assets/utils/proxy.js.
  const { width, height } = fallback.options;
  if (width === undefined || height === undefined) {
    throw new Error(
      'astro:assets returned no intrinsic size for the hero fallback image.',
    );
  }

  return {
    phone: { avif: phoneAvif, webp: phoneWebp, jpeg: phoneJpeg },
    wide: { avif: wideAvif, webp: wideWebp, jpeg: wideJpeg },
    fallback: { src: fallback.src, width, height },
  };
}
