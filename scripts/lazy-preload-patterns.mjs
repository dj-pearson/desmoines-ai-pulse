/**
 * Chunks that must NOT be preloaded in the shipped HTML.
 *
 * Single source of truth, imported by BOTH vite.config.ts (which strips them
 * from the built HTML) and scripts/prerender.mjs (which strips them again from
 * the serialized DOM). Both stages are required, and the second is the
 * non-obvious one:
 *
 *   1. Vite emits <link rel="modulepreload"> for the entry's import graph.
 *      The build plugin removes the heavy ones.
 *   2. The prerenderer then loads that page in Chromium. As lazy routes and
 *      components render, Vite's runtime __vitePreload helper INJECTS fresh
 *      modulepreload links into the live document head.
 *   3. page.content() serializes that DOM — links included — and for the '/'
 *      route writes it straight back over dist/index.html.
 *
 * So prerendering silently converts runtime-lazy chunks back into eager
 * preloads. Without step 2, a production homepage downloads the 3D engine, the
 * rich-text editor, Recharts and D3 before first paint (~440KB gzipped) even
 * though every one of them is behind a lazy boundary.
 *
 * Keeping the list here means adding a chunk fixes both stages at once.
 */
export const LAZY_PRELOAD_PATTERNS = [
  'vendor-maps',
  'vendor-three',
  'vendor-editor',
  'vendor-recharts',
  'vendor-d3',
  'HeroCityLite',
  'HeroCity',
];

/** Build the link-stripping regexes. Fresh objects each call — these are /g. */
export function lazyPreloadRegexes() {
  return LAZY_PRELOAD_PATTERNS.map(
    (name) => new RegExp(`<link rel="modulepreload"[^>]*${name}[^>]*>\\s*`, 'g'),
  );
}

/** Strip heavy modulepreload links from an HTML string. Returns [html, count]. */
export function stripLazyPreloads(html) {
  let count = 0;
  let out = html;
  for (const re of lazyPreloadRegexes()) {
    out = out.replace(re, () => {
      count++;
      return '';
    });
  }
  return [out, count];
}
