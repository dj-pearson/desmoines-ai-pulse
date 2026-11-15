/**
 * WEB-SEO-069: the shell for a sitemapped route that skips the prerender.
 *
 *   npx tsx functions/__tests__/middleware-static-page-shell.test.mjs
 *
 * SITEMAP_ONLY_ROUTES are submitted but never rendered to static HTML, so a
 * crawler that does not run JavaScript got the homepage shell with only the
 * canonical fixed: the homepage's title, description, og:title and H1 at
 * /privacy-policy, /terms and four more. staticPageShellRewrites writes the
 * page's own words from STATIC_PAGE_META, the entry the page hands SEOHead.
 * Run through html-rewriter-wasm (cloudflare/lol-html), as the restaurant-area
 * suite is, so the output is exercised and not only the rules.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HTMLRewriter } from 'html-rewriter-wasm';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');

const { staticPageShellRewrites, selfCanonicalRewrites } = await import('../_middleware.ts');
const { STATIC_PAGE_META, staticPageMeta, brandedTitle } = await import('../../src/lib/staticPageMeta.ts');
const { SITEMAP_ONLY_ROUTES } = await import('../../scripts/prerender-routes.mjs');

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
    } else if ('set' in rule) {
      rewriter.on(rule.selector, { element: (el) => el.setAttribute(rule.set, rule.to) });
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

const HOME_TITLE = 'Des Moines Insider | Events, Restaurants &amp; Things to Do';
const SHELL = `<!doctype html><html><head>
<title>${HOME_TITLE}</title>
<meta name="description" content="homepage description">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://desmoinesinsider.com/">
<meta property="og:url" content="https://desmoinesinsider.com/">
<meta property="og:type" content="website">
<meta property="og:title" content="homepage og title">
<meta property="og:description" content="homepage og description">
<meta name="twitter:title" content="homepage twitter title">
<meta name="twitter:description" content="homepage twitter description">
<script type="application/ld+json">{"@type":"Organization"}</script>
<script type="module" src="/assets/index.js"></script>
</head><body><main id="main-content"><h1>What's Happening in Des Moines</h1></main></body></html>`;

// --- The defect, reproduced on the rules that shipped before this change ---
console.log('before: the self-canonical rewrite alone');
const before = await rewrite(SHELL, selfCanonicalRewrites('https://desmoinesinsider.com/terms'));
ck('it kept the homepage title at /terms (the bug this fixes)', before.includes(`<title>${HOME_TITLE}</title>`));

// --- Coverage: every sitemap-only route has an entry, and nothing else does ---
console.log('\ncoverage');
const keys = Object.keys(STATIC_PAGE_META).sort();
const routes = [...SITEMAP_ONLY_ROUTES].sort();
ck('STATIC_PAGE_META keys equal SITEMAP_ONLY_ROUTES', JSON.stringify(keys) === JSON.stringify(routes), `meta ${keys.join(',')} vs routes ${routes.join(',')}`);
ck('an unknown path has no entry', staticPageMeta('/events') === null && staticPageMeta('/toString') === null && staticPageMeta('/__proto__') === null);

// --- Each page reads its own entry, so the shell and the page say the same thing ---
console.log('\npages read their entry');
const PAGE_FILES = {
  '/advertise': 'src/pages/Advertise.tsx',
  '/business-partnership': 'src/pages/BusinessPartnership.tsx',
  '/submit-event': 'src/pages/SubmitEvent.tsx',
  '/whats-new': 'src/pages/WhatsNew.tsx',
  '/privacy-policy': 'src/pages/PrivacyPolicy.tsx',
  '/terms': 'src/pages/Terms.tsx',
};
for (const [route, file] of Object.entries(PAGE_FILES)) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  ck(`${file} takes title and description from STATIC_PAGE_META["${route}"]`, src.includes(`STATIC_PAGE_META["${route}"]`));
  ck(`${file} renders the entry's heading as its H1`, src.includes(STATIC_PAGE_META[route].heading));
  ck(`${file} carries no literal copy of the description`, !src.includes(STATIC_PAGE_META[route].description));
}
ck('every page file is mapped', Object.keys(PAGE_FILES).sort().join() === keys.join());

// check-seo-meta-length.mjs reads literals in src/pages, and these left them
// for STATIC_PAGE_META, so the same 60/160 limits are held here.
console.log('\nlengths (the check-seo-meta-length limits)');
for (const route of keys) {
  const { title, description } = STATIC_PAGE_META[route];
  ck(`${route} title fits 60 with the brand`, brandedTitle(title).length <= 60, `${brandedTitle(title).length}`);
  ck(`${route} description fits 160`, description.length <= 160, `${description.length}`);
}

// --- The rewrite itself ---
for (const route of keys) {
  console.log(`\n${route}`);
  const page = STATIC_PAGE_META[route];
  const pageUrl = `https://desmoinesinsider.com${route}`;
  const out = await rewrite(SHELL, staticPageShellRewrites(pageUrl, page));
  const title = brandedTitle(page.title);
  const attr = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  ck('title is the page title, branded once', out.includes(`<title>${attr(title)}</title>`) && title.split('Des Moines Insider').length - 1 >= 1 && !/Des Moines Insider \| Des Moines Insider/.test(title), out.match(/<title>.*?<\/title>/)?.[0]);
  ck('no homepage title survives', !out.includes(HOME_TITLE));
  ck('meta description is the page\'s', out.includes(`<meta name="description" content="${attr(page.description)}">`));
  ck('og:title and twitter:title are the page title', out.includes(`<meta property="og:title" content="${attr(title)}">`) && out.includes(`<meta name="twitter:title" content="${attr(title)}">`));
  ck('og:description and twitter:description are the page\'s', out.includes(`<meta property="og:description" content="${attr(page.description)}">`) && out.includes(`<meta name="twitter:description" content="${attr(page.description)}">`));
  ck('no homepage meta text survives', !/homepage (description|og|twitter)/.test(out));
  ck('canonical and og:url are the requested URL', out.includes(`<link rel="canonical" href="${pageUrl}">`) && out.includes(`<meta property="og:url" content="${pageUrl}">`));
  ck("the homepage's JSON-LD is gone and nothing replaces it", !out.includes('application/ld+json'));
  ck('the app module script is untouched', out.includes('<script type="module" src="/assets/index.js"></script>'));
  ck("the homepage's H1 is replaced by the page's", !out.includes("What's Happening") && out.includes(`<h1>${attr(page.heading)}</h1>`));
  ck('robots is left as the shell had it', out.includes('<meta name="robots" content="index, follow">'));
}

// An apostrophe and an ampersand must survive both sinks.
console.log('\nescaping');
const tricky = { title: 'Tom & Jerry\'s "Place"', description: 'A <b>bold</b> & "quoted" claim', heading: 'Tom & Jerry' };
const esc = await rewrite(SHELL, staticPageShellRewrites('https://desmoinesinsider.com/x', tricky));
ck('a quote cannot leave the description attribute', esc.includes('content="A &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot; claim"'), esc.match(/<meta name="description"[^>]*>/)?.[0]);
ck('markup in the description is text in the body, not an element', !esc.includes('<b>bold</b>'));
ck('the title text is escaped exactly once', esc.includes('<title>Tom &amp; Jerry\'s "Place" | Des Moines Insider</title>'), esc.match(/<title>.*?<\/title>/)?.[0]);

console.log(`\n${bad} failure(s)`);
process.exit(bad ? 1 : 0);
