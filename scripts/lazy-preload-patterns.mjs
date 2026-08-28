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
 * Strip EVERY modulepreload the prerenderer added that Vite did not emit.
 *
 * This supersedes the named-chunk allowlist above for the general case. That
 * list was written for the handful of heavy vendor chunks somebody noticed;
 * diffing the Vite-built HTML against the prerendered HTML showed ~30 MORE
 * runtime-injected preloads (route chunks, admin dashboards, search, calendar)
 * that the allowlist never covered. Maintaining a name list means re-finding
 * this bug every time a chunk is added.
 *
 * The invariant is simple and does not need maintenance: Vite emits preloads
 * for the entry's static import graph at build time. Anything appearing ONLY
 * after Chromium ran the page was injected by the __vitePreload runtime helper
 * for a chunk that is, by definition, lazily loaded. Preloading it in the
 * initial HTML is exactly backwards.
 *
 * @param html      serialized DOM from the prerenderer
 * @param buildHtml the Vite-built index.html, before prerendering
 */
export function stripInjectedPreloads(html, buildHtml) {
  const hrefsIn = (src) =>
    new Set(
      [...src.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"[^>]*>/g)].map((m) => m[1]),
    );

  const emitted = hrefsIn(buildHtml);
  let count = 0;

  const out = html.replace(/<link[^>]*rel="modulepreload"[^>]*>\s*/g, (tag) => {
    const href = tag.match(/href="([^"]+)"/)?.[1];
    if (href && emitted.has(href)) return tag; // Vite put it there; keep it.
    count++;
    return '';
  });

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

/**
 * Drop superseded Helmet JSON-LD blocks (WEB-SEO-013).
 *
 * MEASURED, not guessed. Five prerendered routes emitted the same schema @type
 * twice from Helmet-managed script tags: FAQPage on /events/today,
 * /events/ankeny, /events/johnston and /events/urbandale, and LocalBusiness on
 * the homepage. Google treats a duplicated entity type on one page as ambiguous
 * and may use neither copy.
 *
 * WEB-SEO-013's note attributed this to a route collision - "the React route
 * and the published pSEO page for the same slug each emit one". The bytes say
 * otherwise. On /events/ankeny the two blocks are both 733 bytes and differ at
 * exactly one character:
 *     "We currently have 0 upcoming events in Ankeny..."
 *     "We currently have 1 upcoming events in Ankeny..."
 * That is ONE component captured at two data states. Helmet updates the head by
 * removing its previous tags and inserting new ones, so a DOM snapshot taken
 * between those steps keeps both. The giveaway is that the affected set MOVES
 * between runs: production had /events/altoona duplicated and /events/ankeny
 * clean, while a local prerender of the same commit produced the opposite. No
 * wait fixes that - there is no observable "Helmet has settled" state, only a
 * longer gamble.
 *
 * FIXED AT SOURCE 2026-08-23 (WEB-SEO-008), and this is now a backstop rather
 * than the fix. Eight pages passed `faqData` whose every answer interpolates a
 * live count, so the loading render and the loaded render genuinely differed
 * and both got captured. They now pass `undefined` while loading, so the
 * loading render emits no FAQPage at all and there is only ever one block to
 * snapshot. The prerender summary went from "dropped 1" to "dropped 0" and
 * every hub route emits exactly one FAQPage. Keep this function: it still
 * catches the next component that does the same thing, and it counts what it
 * drops so the next one is visible rather than silently corrected.
 *
 * So the LAST block of each @type wins, which is the settled render, since
 * Helmet appends the newest. Only `data-rh` tags are considered: that attribute
 * is what marks a tag as Helmet-managed and therefore replaceable. A JSON-LD
 * block written directly into index.html is never touched.
 *
 * NOT a general "one @type per page" rule, and the difference matters. The
 * homepage's two LocalBusiness blocks were genuinely different objects, 1437
 * and 799 bytes, from two components that each emitted one - a source defect,
 * fixed in Index.tsx by giving SEOStructure the block the page already builds.
 * This function would have masked that by silently dropping the richer copy,
 * which is why every drop is counted and reported in the prerender summary
 * instead of being done quietly.
 */
export function dedupeJsonLd(html) {
  const blocks = [];
  const re = /<script([^>]*type="application\/ld\+json"[^>]*)>([\s\S]*?)<\/script>/g;

  for (let m = re.exec(html); m; m = re.exec(html)) {
    const [full, attrs, body] = m;
    const type = /"@type"\s*:\s*"([^"]+)"/.exec(body);
    blocks.push({
      full,
      index: m.index,
      helmet: /\bdata-rh\b/.test(attrs),
      type: type ? type[1] : null,
    });
  }

  // Last occurrence of each @type wins, among Helmet-managed blocks only.
  const lastOfType = new Map();
  for (const b of blocks) {
    if (b.helmet && b.type) lastOfType.set(b.type, b.index);
  }

  const doomed = blocks.filter((b) => b.helmet && b.type && lastOfType.get(b.type) !== b.index);
  if (doomed.length === 0) return [html, 0, []];

  // Splice from the end so earlier offsets stay valid.
  let out = html;
  for (const b of [...doomed].sort((a, c) => c.index - a.index)) {
    out = out.slice(0, b.index) + out.slice(b.index + b.full.length);
  }
  // THE @TYPES COME BACK WITH THE COUNT. A bare total says a duplicate happened
  // somewhere across 35 routes, which is not enough to act on - and the header
  // above is explicit that this function can mask a source defect, so the report
  // has to be specific enough to tell "Helmet caught mid-update" from "two
  // components each emit one". Third element, so existing two-element
  // destructures keep working.
  return [out, doomed.length, doomed.map((b) => b.type)];
}

/**
 * Removes Leaflet's runtime image layers from a captured page.
 *
 * Chromium runs the app, so by capture time Leaflet has built a complete map:
 * one <img> per marker, one more per marker SHADOW, and one per visible tile.
 * Measured on the live prerendered /map, 2026-08-28:
 *
 *     1,958 elements in #root, of which 1,124 are <img>
 *       517  img.leaflet-marker-icon
 *       517  img.leaflet-marker-shadow
 *        87  img.leaflet-tile
 *     -----
 *     1,121 of them Leaflet's, against 550 words of actual page text
 *
 * NONE OF IT SURVIVES HYDRATION. react-leaflet initialises a fresh map and
 * rebuilds every pane, so these nodes are parsed, laid out, and thrown away.
 * What they cost in the meantime is real: 87 OpenStreetMap tile requests for a
 * viewport the visitor may never look at, 1,034 nodes React must walk past on
 * boot (WEB-PERF-023 AC3 is exactly this), and 517 elements carrying
 * role="button" tabindex="0" that are in the tab order and do nothing.
 *
 * NOTHING IS LOST TO A CRAWLER. marker-icon.png has alt="Marker", the shadows
 * and tiles have alt="", and the page's 550 words are untouched. This is the
 * opposite trade-off from WEB-SEO-006, which fought to get CONTENT into the
 * prerendered HTML - these are not content.
 *
 * THE ONE REAL COST, stated rather than buried: a visitor with JavaScript
 * disabled or still loading now sees an empty map frame instead of a static
 * snapshot. That snapshot was of a fixed viewport chosen at build time, so it
 * was already showing the wrong place to most people, and it could not be
 * panned, zoomed or clicked.
 *
 * Images only. The pane <div>s stay, because Leaflet expects its container
 * structure to be present and the divs are a few dozen nodes against a
 * thousand.
 */
export function stripLeafletRuntime(html) {
  // Self-closing <img> tags with a leaflet-* class. Matched on the class
  // attribute rather than on src: the marker src is the relative
  // "marker-icon.png", which is not distinctive, while the classes are.
  const re = /<img\b[^>]*\bclass="[^"]*\bleaflet-(?:marker-icon|marker-shadow|tile)\b[^"]*"[^>]*>/g;
  let removed = 0;
  const out = html.replace(re, () => {
    removed++;
    return '';
  });
  return removed === 0 ? [html, 0] : [out, removed];
}

/**
 * Removes the prerenderer's own handshake attribute from the shipped HTML.
 *
 * src/components/PrerenderSignal.tsx publishes data-queries-settled on <html>
 * so scripts/prerender.mjs knows when TanStack Query has finished. That is
 * build-time metadata: by the time the file is written it has served its whole
 * purpose, and leaving it in bakes `data-queries-settled="true"` into all 35
 * pages.
 *
 * NOTHING READS IT, so this is not a bug fix - it is the same hygiene applied
 * to the injected modulepreloads and the Leaflet panes. The reason to bother is
 * that a stale "true" in production HTML is actively misleading: it says the
 * queries have settled for a visitor whose queries have not started, and the
 * next person to grep production for a load signal would believe it.
 *
 * Attribute only. The <html> tag keeps its lang, class and style.
 */
export function stripPrerenderSignal(html) {
  const re = /\s*data-queries-settled="[^"]*"/g;
  let removed = 0;
  const out = html.replace(re, () => {
    removed++;
    return '';
  });
  return removed === 0 ? [html, 0] : [out, removed];
}
