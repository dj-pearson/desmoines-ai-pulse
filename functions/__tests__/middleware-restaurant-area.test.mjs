/**
 * SEO-065: the shell for /restaurants/<area> when it missed the prerender.
 *
 *   npx tsx functions/__tests__/middleware-restaurant-area.test.mjs
 *
 * The detail route's lookup finds no restaurant called "ankeny", so this URL
 * was answered as a missing restaurant: 404, noindex, the homepage's title.
 * restaurantAreaShellRewrites gives it the pSEO row's own identity instead.
 * Run through html-rewriter-wasm (cloudflare/lol-html), as the entity shell's
 * suite is, so the escaping of both sinks is exercised, not only the rules.
 */
import { HTMLRewriter } from 'html-rewriter-wasm';

const { restaurantAreaShellRewrites } = await import('../_middleware.ts');
const { isRestaurantAreaSlug, isRestaurantPseoSlug, RESTAURANT_AREA_SLUGS } = await import('../../src/pseo/restaurantAreaSlugs.ts');

let bad = 0;
const ck = (name, cond, detail = '') => {
  console.log((cond ? '  ok    ' : '  FAIL  ') + name + (cond || !detail ? '' : `  -> ${detail}`));
  if (!cond) bad++;
};

async function rewrite(html, rules) {
  const decoder = new TextDecoder();
  let out = '';
  const rewriter = new HTMLRewriter((chunk) => {
    out += decoder.decode(chunk, { stream: true });
  });
  for (const rule of rules) {
    if ('appendHtml' in rule) {
      rewriter.on(rule.selector, { element: (el) => el.append(rule.appendHtml, { html: true }) });
    } else if ('setInnerHtml' in rule) {
      rewriter.on(rule.selector, { element: (el) => el.setInnerContent(rule.setInnerHtml, { html: true }) });
    } else if ('remove' in rule) {
      rewriter.on(rule.selector, { element: (el) => el.remove() });
    } else if ('setText' in rule) {
      let done = false;
      rewriter.on(rule.selector, {
        text: (chunk) => {
          chunk.replace(done ? '' : rule.setText);
          done = true;
        },
      });
    } else if ('setAttribute' in rule) {
      rewriter.on(rule.selector, { element: (el) => el.setAttribute(rule.setAttribute, rule.to) });
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

const SHELL = `<!doctype html><html><head>
<title>Des Moines Insider | Events, Restaurants &amp; Things to Do</title>
<meta name="description" content="homepage">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://desmoinesinsider.com/">
<meta property="og:url" content="https://desmoinesinsider.com/">
<meta property="og:type" content="website">
<meta property="og:title" content="homepage">
<meta name="twitter:title" content="homepage">
<script type="application/ld+json">{"@type":"Organization"}</script>
</head><body><main id="main-content"><h1>What's Happening in Des Moines</h1></main></body></html>`;

const pageUrl = 'https://desmoinesinsider.com/restaurants/west-des-moines';
const seo = {
  title: 'Restaurants in West Des Moines, Iowa',
  h1: 'Restaurants in West Des Moines',
  description: "82 restaurants in West Des Moines, Iowa, including Kikka Sushi & Joe's \"Place\".",
};

const out = await rewrite(SHELL, restaurantAreaShellRewrites(pageUrl, seo));

ck('title is the page title, branded once', out.includes('<title>Restaurants in West Des Moines, Iowa | Des Moines Insider</title>'));
ck('canonical is the requested URL', out.includes(`<link rel="canonical" href="${pageUrl}">`));
ck('og:url is the requested URL', out.includes(`<meta property="og:url" content="${pageUrl}">`));
ck("the homepage's JSON-LD is gone", !out.includes('Organization'));
const blocks = [...out.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
ck('exactly one ld+json block remains, the page\'s own', blocks.length === 1, blocks.length);
const node = blocks.length === 1 ? JSON.parse(blocks[0]) : {};
ck('it is a CollectionPage at the requested URL', node['@type'] === 'CollectionPage' && node.url === pageUrl, node);
ck('it names the page', node.name === 'Restaurants in West Des Moines');
ck("the homepage's H1 is replaced by the page's", !out.includes("What's Happening") && out.includes('<h1>Restaurants in West Des Moines</h1>'));
ck('robots stays as the shell had it for an indexable page', out.includes('<meta name="robots" content="index, follow">'));
ck(
  'a quote in the description cannot break out of the attribute',
  out.includes('content="82 restaurants in West Des Moines, Iowa, including Kikka Sushi &amp; Joe\'s &quot;Place&quot;."'),
  out.match(/<meta name="description"[^>]*>/)?.[0],
);

const noindex = await rewrite(SHELL, restaurantAreaShellRewrites(pageUrl, { ...seo, robots: 'noindex, follow' }));
ck('a noindex row keeps its noindex', noindex.includes('<meta name="robots" content="noindex, follow">'));

ck('the area slugs include the five that 404ed', ['ankeny', 'west-des-moines', 'downtown', 'east-village', 'valley-junction'].every(isRestaurantAreaSlug));
ck('a cuisine slug is not an area slug', !isRestaurantAreaSlug('asian') && !isRestaurantAreaSlug(undefined));
ck('the list is not empty', RESTAURANT_AREA_SLUGS.length > 0);

// The city-wide cuisine pages 404ed the same way (2026-10-10).
ck('the five published cuisine pages that 404ed fall back', ['italian', 'mexican', 'asian', 'bbq', 'brunch'].every(isRestaurantPseoSlug));
ck('an area slug still falls back', isRestaurantPseoSlug('ankeny'));
// Counter-assertion: the predicate is not 'anything'. An event category has no restaurant listing.
ck('a non-restaurant category or an unknown slug does not', !isRestaurantPseoSlug('festivals') && !isRestaurantPseoSlug('live-music') && !isRestaurantPseoSlug('atlas-caf') && !isRestaurantPseoSlug(undefined));

console.log(`\n${bad} failure(s)`);
process.exit(bad ? 1 : 0);
