// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';

/**
 * Refuses to build a site whose reply form cannot send.
 *
 * The three PUBLIC_* values are compiled into the client bundle. When one is
 * missing, Astro substitutes `undefined` and the build SUCCEEDS: the RSVP form
 * ships pointing at `undefined/functions/v1/rsvp` with `undefined` for the
 * Turnstile site key, looks perfect, and cannot send a single reply. That has
 * happened once already on GitHub Pages, where the three are repository
 * variables that a fork or a renamed variable silently drops.
 *
 * It is a likelier failure on Cloudflare Pages, not a less likely one, because
 * build-time variables there live only in the dashboard — they cannot be
 * committed alongside the code, so nothing in this repository proves they were
 * set. This is what replaces that proof.
 *
 * Build only. `astro dev` stays usable without a .env, which is how somebody
 * new to the project reads the layout without being handed keys first.
 *
 * @returns {import('astro').AstroIntegration}
 */
function requirePublicEnv() {
  const REQUIRED = [
    'PUBLIC_SUPABASE_URL',
    'PUBLIC_SUPABASE_ANON_KEY',
    'PUBLIC_TURNSTILE_SITE_KEY',
  ];

  return {
    name: 'require-public-env',
    hooks: {
      'astro:config:setup': ({ command }) => {
        if (command !== 'build') return;

        /* `loadEnv` rather than `process.env` alone: a local build reads its
           values from .env, which Vite has not loaded yet at config time. With
           an empty prefix it returns the .env files AND the real environment,
           which is where a Pages or Actions build gets them. */
        const env = loadEnv('production', process.cwd(), '');
        const missing = REQUIRED.filter((key) => !env[key] && !process.env[key]);
        if (missing.length === 0) return;

        throw new Error(
          `Refusing to build: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set.\n\n` +
            'These are compiled into the client bundle. Without them the build\n' +
            'would succeed and the RSVP form would ship `undefined` for the\n' +
            'function URL and the Turnstile key — a form that looks right and\n' +
            'cannot send.\n\n' +
            '  Locally         copy .env.example to .env and fill it in\n' +
            '  Cloudflare Pages  Workers & Pages > steeja-arjun >\n' +
            '                    Settings > Environment variables, for BOTH\n' +
            '                    Production and Preview\n' +
            '  GitHub Actions  repository Settings > Secrets and variables >\n' +
            '                    Actions > Variables\n',
        );
      },
    },
  };
}

// Deployed to Cloudflare Pages, which serves the project at the ROOT of its own
// hostname. There is no `base` any more and there must not be one: it was
// `/wedding-steeja-arjun` for GitHub Pages, which is a *project* site and puts
// every repository under a path. A leftover base here produces
// `/wedding-steeja-arjun/wedding-steeja-arjun/...` on the new host, which 404s
// while looking like a routing bug rather than a config one.
//
// `src/lib/paths.ts` (withBase) still stands between hand-written paths and the
// deploy root, and it now resolves to `/`. It is kept rather than deleted so
// that moving under a path again is one line here instead of an audit of every
// href in the project.
//
// THE OLD HOST IS STILL LIVE. GitHub Pages continues to serve the last build it
// received, which carries the old base and works. What it cannot do is take a
// NEW build from this config — see the note at the top of
// .github/workflows/deploy.yml before re-running it.
export default defineConfig({
  site: 'https://steeja-arjun.pages.dev',
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    // One page, small CSS: inlining it removes the only render-blocking
    // request, which is what keeps the hero paint on the critical path short.
    inlineStylesheets: 'always',
  },
  integrations: [
    requirePublicEnv(),
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
