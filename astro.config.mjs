// @ts-check
import { defineConfig } from 'astro/config';
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
  vite: {
    plugins: [tailwindcss()],
  },
});
