/**
 * The entity shell rewrite, applied (WEB-SEO-006, WEB-SEO-030 AC3).
 *
 *   npx tsx functions/__tests__/middleware-entity-shell.test.mjs
 *
 * This is the richer of the two middleware rewrites: when an entity URL
 * resolves but missed the prerender budget, it gives the homepage shell that
 * entity's canonical, og:*, twitter:*, <title> and a real Event or Restaurant
 * JSON-LD node. It had no coverage at all, and running it through lol-html the
 * first time found a live defect - see "the two sinks" below.
 *
 * html-rewriter-wasm is a WebAssembly build of cloudflare/lol-html, the parser
 * Cloudflare's HTMLRewriter is built on, so this exercises the same engine
 * rather than a stand-in for it.
 *
 * THE TWO SINKS WANT OPPOSITE THINGS AND THAT IS THE WHOLE TRAP:
 *   an ATTRIBUTE value must arrive ESCAPED, because lol-html does not escape
 *     what setAttribute is given - a title with a quote in it would otherwise
 *     break out of the attribute;
 *   a TEXT value must arrive RAW, because chunk.replace() escapes - and the
 *     code pre-escaped it, so every <title> on this path double-escaped.
 * Both directions are asserted below, because a fix for one silently breaks
 * the other.
 */
import { HTMLRewriter } from 'html-rewriter-wasm';

const { entityShellRewrites, jsonLdScript } = await import('../_middleware.ts');

let bad = 0;
const ck = (name, cond, detail = '') => {
  console.log((cond ? '  ok    ' : '  FAIL  ') + name + (cond || !detail ? '' : `  -> ${detail}`));
  if (!cond) bad++;
};

/** Applies the rules the way entityShell does: same handlers, same order. */
async function rewrite(html, opts) {
  const decoder = new TextDecoder();
  let out = '';
  const rewriter = new HTMLRewriter((chunk) => {
    out += decoder.decode(chunk, { stream: true });
  });
  for (const rule of entityShellRewrites(opts)) {
    if ('appendHtml' in rule) {
      rewriter.on(rule.selector, { element: (el) => el.append(rule.appendHtml, { html: true }) });
    } else if ('setText' in rule) {
      let done = false;
      rewriter.on(rule.selector, {
        text: (chunk) => {
          chunk.replace(done ? '' : rule.setText);
          done = true;
        },
      });
    } else {
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

/**
 * The node entityShellRewrites injected, parsed. Grepping the whole document
 * for `"description"` finds the shell's own <meta name="description">, which
 * is how the first draft of this file asserted something it had not tested.
 */
function injectedNode(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const last = blocks.at(-1)?.[1];
  return last ? JSON.parse(last) : null;
}

const SB = 'https://proj.supabase.co';
const PAGE = 'https://desmoinesinsider.com/restaurants/fongs-pizza';

// The tags the real index.html carries, in the shapes it carries them.
const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <title>Des Moines Insider: Events, Restaurants &amp; Attractions</title>
    <link rel="canonical" href="https://desmoinesinsider.com/" data-rh="true" />
    <meta data-rh="true" property="og:url" content="https://desmoinesinsider.com/" />
    <meta data-rh="true" property="og:type" content="website" />
    <meta data-rh="true" property="og:title" content="Des Moines Insider" />
    <meta data-rh="true" property="og:image" content="https://desmoinesinsider.com/og.png" />
    <meta data-rh="true" property="og:image:secure_url" content="https://desmoinesinsider.com/og.png" />
    <meta data-rh="true" property="og:description" content="Home" />
    <meta data-rh="true" name="description" content="Home" />
    <meta data-rh="true" name="twitter:title" content="Des Moines Insider" />
    <meta data-rh="true" name="twitter:image" content="https://desmoinesinsider.com/og.png" />
    <meta data-rh="true" name="twitter:description" content="Home" />
    <script type="application/ld+json">{"@type":"WebSite"}</script>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>`;

const RESTAURANT = {
  pageUrl: PAGE,
  sbBase: SB,
  type: 'restaurant',
  entity: { id: 'r1', title: "Fong's Pizza & Tiki <Lounge>", description: 'Thai chili & cream cheese' },
};

console.log('a restaurant that missed the prerender budget');
const out = await rewrite(SHELL, RESTAURANT);

ck('canonical is the entity url', out.includes(`<link rel="canonical" href="${PAGE}"`), out.slice(0, 300));
ck('og:url is the entity url', out.includes(`property="og:url" content="${PAGE}"`));
ck('og:type follows the segment', out.includes('property="og:type" content="website"'));
ck('og:image points at the og-image function', out.includes(`content="${SB}/functions/v1/og-image/restaurant/r1"`));
ck('twitter:image too', out.includes(`name="twitter:image" content="${SB}/functions/v1/og-image/restaurant/r1"`));

// THE DEFECT THIS SUITE FOUND. `title` was escapeHtml'd and then handed to a
// TEXT replacement, which escapes again: the page shipped
// "Fong's Pizza &amp; Tiki &lt;Lounge&gt;" as its visible title.
ck(
  'the title escapes exactly once',
  out.includes("<title>Fong's Pizza &amp; Tiki &lt;Lounge&gt;</title>"),
  /<title>[^<]*<\/title>/.exec(out)?.[0],
);
ck('and not twice', !out.includes('&amp;amp;') && !out.includes('&amp;lt;'));

// The attribute sink needs the OPPOSITE: escaped input, because lol-html does
// not escape what setAttribute is given.
ck(
  'og:title is escaped in the attribute',
  out.includes('property="og:title" content="Fong&#39;s Pizza &amp; Tiki &lt;Lounge&gt;"') ||
    out.includes(`property="og:title" content="Fong's Pizza &amp; Tiki &lt;Lounge&gt;"`),
  /property="og:title"[^>]*/.exec(out)?.[0],
);
ck('description is escaped in the attribute', out.includes('content="Thai chili &amp; cream cheese"'));

console.log('\nthe JSON-LD node');
ck('a Restaurant node is injected', injectedNode(out)?.['@type'] === 'Restaurant');
// Only `<` is escaped, and only `<` needs to be: nothing else can start a tag.
// The node still PARSES to the entity's real title, which is what a consumer
// reads.
ck('it carries the entity name', injectedNode(out)?.name === "Fong's Pizza & Tiki <Lounge>", JSON.stringify(injectedNode(out)?.name));
ck('with < escaped in the wire form', out.includes('\\u003cLounge>'), out.match(/"name":"[^"]*"/)?.[0]);
ck('it is @id-ed and url-ed to the page', out.includes(`"@id":"${PAGE}"`) && out.includes(`"url":"${PAGE}"`));
ck("the shell's own WebSite node is NOT removed", out.includes('"@type":"WebSite"'));
ck('the application module script survives', out.includes('src="/assets/index-abc.js"'));

// `</script>` inside a title would end the block early and inject markup.
const xss = jsonLdScript({ name: 'Evil </script><img src=x onerror=alert(1)>' });
ck('a closing script tag in the node cannot end the block', !xss.slice(0, -9).includes('</script>'), xss);
ck('the closing tag is escaped as \\u003c', xss.includes('\\u003c/script>'), xss);
ck('and the block still parses to the real string', JSON.parse(xss.replace(/^[^>]*>/, '').replace(/<\/script>$/, '')).name === 'Evil </script><img src=x onerror=alert(1)>');

console.log('\nwhat varies by type');
const event = await rewrite(SHELL, {
  pageUrl: 'https://desmoinesinsider.com/events/e1',
  sbBase: SB,
  type: 'event',
  entity: { id: 'e1', title: 'Jazz Night', startDate: '2026-10-01T19:00:00Z' },
});
ck('an event is og:type article', event.includes('property="og:type" content="article"'));
ck('an event gets an Event node', injectedNode(event)?.['@type'] === 'Event');
ck('with the startDate it actually has', injectedNode(event)?.startDate === '2026-10-01T19:00:00Z');

// An Event with a fabricated startDate is worse than one without.
const dateless = await rewrite(SHELL, {
  pageUrl: 'https://desmoinesinsider.com/events/e2',
  sbBase: SB,
  type: 'event',
  entity: { id: 'e2', title: 'Undated' },
});
ck('no startDate is invented when the row has none', injectedNode(dateless) && !('startDate' in injectedNode(dateless)));
ck('no description key when the row has none', injectedNode(dateless) && !('description' in injectedNode(dateless)), JSON.stringify(injectedNode(dateless)));

const unknown = await rewrite(SHELL, {
  pageUrl: PAGE,
  sbBase: SB,
  type: 'somethingelse',
  entity: { id: 'x', title: 'X' },
});
ck('an unmapped type falls back to Thing', injectedNode(unknown)?.['@type'] === 'Thing');
ck('and to og:type website', unknown.includes('property="og:type" content="website"'));

console.log('\nabsences the shell really has');
// A title-less entity must not blank the shell's own title.
const untitled = await rewrite(SHELL, { pageUrl: PAGE, sbBase: SB, type: 'restaurant', entity: { id: 'r2', title: '' } });
ck("an empty title leaves the shell's title alone", untitled.includes('<title>Des Moines Insider'), /<title>[^<]*/.exec(untitled)?.[0]);

console.log(`\n${bad} failure(s)`);
process.exit(bad ? 1 : 0);
