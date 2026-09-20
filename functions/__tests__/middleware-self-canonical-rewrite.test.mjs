/**
 * The self-canonical rewrite, applied (WEB-SEO-006).
 *
 *   npx tsx functions/__tests__/middleware-self-canonical-rewrite.test.mjs
 *
 * WHY THIS FILE EXISTS. middleware-canonical.test.mjs covers the GATE that
 * decides whether to rewrite, and the RULES as data, and its own header says
 * what it cannot cover: HTMLRewriter applying them. That was the wrong half to
 * leave unexercised - this fix has already been dead once, gated on a 404 that
 * single-page-app mode never returns, and nothing noticed for months. The
 * story's notes name it as "the one place this fix could regress silently a
 * second time".
 *
 * html-rewriter-wasm closes it. It is a WebAssembly build of cloudflare/lol-html
 * - the parser Cloudflare's HTMLRewriter is built on - written for Miniflare, so
 * this is the same engine rather than a stand-in for it. The API differs
 * (write/end over a byte stream instead of transform(Response)), so the harness
 * below applies selfCanonicalRewrites() the way _middleware.ts does and reads
 * the output.
 *
 * WHAT THIS ASSERTS IS NOT lol-html's PARSING, which is Cloudflare's to get
 * right. It is that the three rules, run together over a realistic shell,
 * produce a document an entity URL can be served: its own canonical, its own
 * og:url, and none of the homepage's structured data - while leaving the
 * application's own scripts and the rest of the head alone.
 */
import { HTMLRewriter } from 'html-rewriter-wasm';

const { selfCanonicalRewrites } = await import('../_middleware.ts');

let bad = 0;
const ck = (name, cond, detail = '') => {
  console.log((cond ? '  ok    ' : '  FAIL  ') + name + (cond || !detail ? '' : `  -> ${detail}`));
  if (!cond) bad++;
};

/**
 * Applies the middleware's rules through the real parser. Mirrors
 * withSelfCanonical(): same rules, same order, same handlers.
 */
async function rewrite(html, pageUrl) {
  const decoder = new TextDecoder();
  let out = '';
  const rewriter = new HTMLRewriter((chunk) => {
    out += decoder.decode(chunk, { stream: true });
  });
  for (const rule of selfCanonicalRewrites(pageUrl)) {
    if ('remove' in rule) {
      rewriter.on(rule.selector, { element: (el) => el.remove() });
    } else {
      rewriter.on(rule.selector, { element: (el) => el.setAttribute(rule.set, rule.to) });
    }
  }
  try {
    await rewriter.write(new TextEncoder().encode(html));
    await rewriter.end();
  } finally {
    rewriter.free();
  }
  return out;
}

const PAGE = 'https://desmoinesinsider.com/restaurants/fongs-pizza';

// Close to what Pages actually serves: the built index.html shell, plus the
// JSON-LD React injects into it for the HOMEPAGE, which is the whole problem.
const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Des Moines Insider</title>
    <link rel="canonical" href="https://desmoinesinsider.com/" data-rh="true" />
    <meta property="og:url" content="https://desmoinesinsider.com/" data-rh="true" />
    <meta property="og:title" content="Des Moines Insider" data-rh="true" />
    <script type="application/ld+json" data-rh="true">{"@type":"Organization","name":"Des Moines Insider"}</script>
    <script type="application/ld+json" data-rh="true">{"@type":"WebSite","url":"https://desmoinesinsider.com/"}</script>
    <script type="module" crossorigin src="/assets/index-abc123.js"></script>
    <link rel="stylesheet" href="/assets/index-abc123.css" />
  </head>
  <body><div id="root"></div></body>
</html>`;

console.log('the rewrite, through lol-html');
const out = await rewrite(SHELL, PAGE);

ck('canonical points at the requested url', out.includes(`<link rel="canonical" href="${PAGE}"`), out.slice(0, 400));
ck('the homepage canonical is gone', !out.includes('href="https://desmoinesinsider.com/" data-rh="true" />\n    <meta property="og:url"'));
ck('og:url points at the requested url', /<meta property="og:url" content="https:\/\/desmoinesinsider\.com\/restaurants\/fongs-pizza"/.test(out), out.slice(0, 600));
ck('no ld+json survives', !out.includes('application/ld+json'));
ck('neither ld+json payload survives', !out.includes('Organization') && !out.includes('WebSite'));

// The failure that would matter most: removing the app's own script blanks
// every page. `script[type="application/ld+json"]` must not touch a module.
ck('the application module script survives', out.includes('src="/assets/index-abc123.js"'));
ck('the stylesheet survives', out.includes('/assets/index-abc123.css'));
ck('the title survives', out.includes('<title>Des Moines Insider</title>'));
ck('og:title is left alone', out.includes('<meta property="og:title" content="Des Moines Insider"'));
ck('the body is untouched', out.includes('<div id="root"></div>'));

console.log('\nshapes the rules have to survive');

// Attribute order is not guaranteed: Helmet writes data-rh first in some builds.
const reordered = await rewrite(
  `<html><head><link data-rh="true" rel="canonical" href="https://desmoinesinsider.com/"></head></html>`,
  PAGE,
);
ck('canonical with attributes reordered is still rewritten', reordered.includes(`href="${PAGE}"`), reordered);

// Single quotes in the source must not defeat the selector.
const singleQuoted = await rewrite(
  `<html><head><meta property='og:url' content='https://desmoinesinsider.com/'></head></html>`,
  PAGE,
);
ck('single-quoted og:url is still rewritten', singleQuoted.includes(PAGE), singleQuoted);

// A shell with nothing to rewrite must come through unchanged rather than empty.
const nothingToDo = `<html><head><title>x</title></head><body>y</body></html>`;
ck('a document with no matches is passed through', (await rewrite(nothingToDo, PAGE)) === nothingToDo);

// An entity page that ALREADY has its own canonical (a prerendered one) is not
// what this path serves, but if it ever reaches here the rewrite must be a
// no-op in value rather than a corruption.
const already = await rewrite(`<html><head><link rel="canonical" href="${PAGE}"></head></html>`, PAGE);
ck('an already-correct canonical is left correct', already.includes(`href="${PAGE}"`) && already.split('canonical').length === 2);

// og:url absent entirely - the real index.html has no static og:url on purpose
// (WEB-SEO-002), so the middleware must not depend on one being there.
const noOgUrl = await rewrite(
  `<html><head><link rel="canonical" href="https://desmoinesinsider.com/"></head></html>`,
  PAGE,
);
ck('a shell with no og:url still gets its canonical', noOgUrl.includes(`href="${PAGE}"`));

console.log(`\n${bad} failure(s)`);
process.exit(bad ? 1 : 0);
