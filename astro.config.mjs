// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Deployed to GitHub Pages as a project site, so every absolute path on the
// page has to carry the `base` prefix — see `src/lib/paths.ts` (withBase).
export default defineConfig({
  site: 'https://chirakkalcode.github.io',
  base: '/wedding-steeja-arjun',
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    // One page, small CSS: inlining it removes the only render-blocking
    // request, which is what keeps the hero paint on the critical path short.
    inlineStylesheets: 'always',
  },
  integrations: [
    sitemap({
      // The guest list is not for crawlers. It carries `noindex, nofollow` on
      // the page and a Disallow in robots.txt as well — this is the third of
      // the three, and the only one that stops the URL being *advertised* in
      // the first place. `filter` receives absolute URLs.
      filter: (page) => !page.includes('/admin'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
