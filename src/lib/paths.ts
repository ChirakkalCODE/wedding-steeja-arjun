/**
 * The site is served from a GitHub Pages sub-path (`/wedding-steeja-arjun`),
 * so nothing hand-written may start with a bare `/`. Astro rewrites the paths
 * it generates itself (bundled CSS, `astro:assets` output); everything written
 * by hand goes through here.
 */
const BASE = import.meta.env.BASE_URL;

/** Joins a site-relative path onto the deploy base without doubling slashes. */
export function withBase(path: string): string {
  return `${BASE.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** Absolute URL for tags that cannot take a relative path (canonical, og:*). */
export function absoluteUrl(path: string, site: URL): string {
  return new URL(withBase(path), site).href;
}
