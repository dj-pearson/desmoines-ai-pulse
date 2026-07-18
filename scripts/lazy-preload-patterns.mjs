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

/**
 * Undo the font stylesheet's own onload mutation.
 *
 * index.html ships the correct async-CSS pattern:
 *
 *   <link rel="preload" as="style" href="…fonts.googleapis…"
 *         onload="this.onload=null;this.rel='stylesheet'">
 *
 * That handler is the whole point — it flips the link to a stylesheet only
 * AFTER it has downloaded, so the font CSS never blocks first paint. But the
 * prerenderer runs the page in Chromium, the handler fires, and page.content()
 * serializes the MUTATED link with rel="stylesheet" already applied. The
 * shipped HTML therefore render-blocks on a third-party origin from the very
 * first byte, which is exactly what the pattern existed to prevent.
 *
 * Measured on a production build before this fix: the local CSS resolved in
 * 10-17ms, the fonts.googleapis.com request took 3035ms, and FCP landed at
 * 3204ms — immediately after it. Every route's first paint was gated on a
 * third-party request, and on a network where fonts.googleapis.com is slow or
 * blocked the page shows nothing at all.
 *
 * Same class of bug as the modulepreload stripping above: prerendering bakes
 * runtime DOM mutations into the initial HTML and silently defeats any
 * optimisation that depends on progressive behaviour.
 */
export function restoreAsyncFontLinks(html) {
  let count = 0;
  const out = html.replace(
    /<link([^>]*?)rel="stylesheet"([^>]*?onload="this\.onload=null;this\.rel='stylesheet'"[^>]*?)>/g,
    (_m, before, after) => {
      count++;
      return `<link${before}rel="preload"${after}>`;
    },
  );
  return [out, count];
}
