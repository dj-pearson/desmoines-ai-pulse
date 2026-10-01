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
    <meta data-rh="true" name="robots" content="index, follow" />
    <script type="application/ld+json">{"@type":"WebSite"}</script>
    <script type="application/ld+json">{"@type":"FAQPage"}</script>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
  </head>
  <body><div id="root"><header><a href="/events">Events</a></header><main id="main-content" tabindex="-1"><h1>What's Happening in Des Moines</h1><p>homepage copy</p></main><footer><a href="/about">About</a></footer></div></body>
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
// The shell's blocks are the HOMEPAGE's. At an entity URL they are claims about
// the wrong page, so they go; the entity's node is the only one left.
ck("the homepage's ld+json is removed", !out.includes('"@type":"WebSite"') && !out.includes('"@type":"FAQPage"'));
ck('exactly one ld+json block remains', [...out.matchAll(/application\/ld\+json/g)].length === 1);
ck("the homepage H1 and copy are gone", !out.includes("What's Happening") && !out.includes('homepage copy'));
ck('the header and footer navigation survive', out.includes('<a href="/events">Events</a>') && out.includes('<a href="/about">About</a>'));
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

console.log('\na restaurant with its full row');
const bonchonRow = {
  id: 'b1',
  name: 'Bonchon',
  city: 'Des Moines',
  location: '6880 EP True Pkwy Unit 104, West Des Moines, IA 50266, USA',
  cuisine: 'Korean',
  price_range: '$$',
  phone: '(515) 555-0100',
  website: 'https://restaurants.bonchon.com/locations/IA/west-des-moines',
  latitude: 41.56,
  longitude: -93.8,
  opening: null,
  seo_description: 'Bonchon West Des Moines is opening soon.',
  description: 'Coming soon!',
};
const rich = await rewrite(SHELL, {
  pageUrl: 'https://desmoinesinsider.com/restaurants/bonchon',
  sbBase: SB,
  type: 'restaurant',
  entity: { id: 'b1', title: 'Bonchon', row: bonchonRow },
});
const rn = injectedNode(rich);
// No menu_url and no hours on this row, so the title promises neither
// (restaurantPageTitle, eat-drink pass 2 WP3.5).
ck('the title names the suburb and only what the page has', rich.includes('<title>Bonchon West Des Moines - Reviews | Des Moines Insider</title>'), /<title>[^<]*/.exec(rich)?.[0]);
ck('the stale "opening soon" description is not served', !rich.includes('opening soon') && !rich.includes('Coming soon'));
ck('the H1 is the restaurant', rich.includes('<h1>Bonchon</h1>'));
ck('addressLocality is the suburb, not the city column', rn?.address?.addressLocality === 'West Des Moines', JSON.stringify(rn?.address));
ck('with the ZIP', rn?.address?.postalCode === '50266');
ck('and the street alone', rn?.address?.streetAddress === '6880 EP True Pkwy Unit 104');
ck('url is our page, the owner site is sameAs', rn?.url === 'https://desmoinesinsider.com/restaurants/bonchon' && rn?.sameAs?.[0] === bonchonRow.website);
ck('geo is carried', rn?.geo?.latitude === 41.56);
ck('the body links back into the hubs', rich.includes('href="/restaurants/open-now"') && rich.includes('href="/restaurants"'));
ck('outbound links are nofollow', /href="https:\/\/restaurants\.bonchon\.com[^"]*" rel="nofollow noopener"/.test(rich));

console.log('\nan event with its full row');
const eventRow = {
  id: 'e9',
  title: 'Red Leather',
  date: '2026-10-10T01:00:00Z',
  event_start_utc: '2026-10-10T01:00:00Z',
  end_date: null,
  venue: 'Val Air Ballroom',
  location: '301 Ashworth Rd, West Des Moines, IA 50265',
  city: 'West Des Moines',
  price: '$25',
  enhanced_description: 'A KISS tribute.',
};
const NOW = new Date('2026-09-23T12:00:00Z');
const ev = await rewrite(SHELL, {
  pageUrl: 'https://desmoinesinsider.com/events/red-leather-2026-10-09',
  sbBase: SB,
  type: 'event',
  entity: { id: 'e9', title: 'Red Leather', startDate: eventRow.event_start_utc, row: eventRow },
  now: NOW,
});
const en = injectedNode(ev);
// 01:00 UTC on the 10th is 8:00 PM Central on the 9th - the day the slug says.
ck('the title carries the Central date and venue', ev.includes('<title>Red Leather - Fri, Oct 9 | Val Air Ballroom</title>'), /<title>[^<]*/.exec(ev)?.[0]);
ck('the body shows the Central time', ev.includes('Friday, October 9, 2026 at 8:00 PM'), ev.match(/When: [^<]*/)?.[0]);
ck('the Event has a Place with a real address', en?.location?.address?.streetAddress === '301 Ashworth Rd' && en?.location?.address?.addressLocality === 'West Des Moines');
ck('eventStatus and attendance mode are set', en?.eventStatus === 'https://schema.org/EventScheduled' && !!en?.eventAttendanceMode);
ck('it links to its suburb hub', ev.includes('href="/events/west-des-moines"'));
ck('an upcoming event stays indexable', ev.includes('name="robots" content="index, follow"'));
ck('and does not say it has ended', !ev.includes('This event has ended'));

const past = await rewrite(SHELL, {
  pageUrl: 'https://desmoinesinsider.com/events/touch-a-truck-2026-05-22',
  sbBase: SB,
  type: 'event',
  entity: { id: 't1', title: 'Touch a Truck', startDate: '2026-05-22T15:00:00Z', row: { ...eventRow, title: 'Touch a Truck', event_start_utc: '2026-05-22T15:00:00Z' } },
  now: NOW,
});
ck('an event four months past is noindex', past.includes('name="robots" content="noindex, follow"'));
ck('and says it has ended', past.includes('This event has ended'));

const hostile = await rewrite(SHELL, {
  pageUrl: PAGE,
  sbBase: SB,
  type: 'restaurant',
  entity: { id: 'h', title: 'x', row: { ...bonchonRow, name: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>' } },
});
ck('row text is escaped in the body', !hostile.includes('<img src=x') && !hostile.includes('<script>alert'), hostile.match(/<h1>[^]*?<\/h1>/)?.[0]);

console.log('\nlinks are http(s) or nothing (eat-drink pass 2 WP5.2)');
const hostileLinks = await rewrite(SHELL, {
  pageUrl: PAGE,
  sbBase: SB,
  type: 'restaurant',
  entity: {
    id: 'j1',
    title: 'x',
    row: { ...bonchonRow, website: 'javascript:alert(document.cookie)', menu_url: 'JavaScript:alert(1)' },
  },
});
const hn = injectedNode(hostileLinks);
ck('a javascript: website renders no <a>', !/<a [^>]*href="javascript:/i.test(hostileLinks) && !hostileLinks.includes('>Website</a>'), hostileLinks.match(/<li><a[^>]*>(Website|Menu)<\/a>/g)?.join(' '));
ck('nor a javascript: menu', !hostileLinks.includes('>Menu</a>'));
ck('sameAs and hasMenu are left out', hn && !('sameAs' in hn) && !('hasMenu' in hn), JSON.stringify(hn?.sameAs ?? hn?.hasMenu));
const bareHost = await rewrite(SHELL, {
  pageUrl: PAGE,
  sbBase: SB,
  type: 'restaurant',
  entity: { id: 'j2', title: 'x', row: { ...bonchonRow, website: 'www.bonchon.com', menu_url: 'bonchon.com/menu' } },
});
ck('a bare host becomes an https link', bareHost.includes('href="https://www.bonchon.com/"') && bareHost.includes('href="https://bonchon.com/menu"'));
ck('and sameAs carries the same https URL', injectedNode(bareHost)?.sameAs?.[0] === 'https://www.bonchon.com/');

console.log('\nclosed and not-yet-open rows (eat-drink pass 2 WP5.3)');
const HOURS = 'Mon-Sun: 11:00 AM - 9:00 PM';
const openRow = { ...bonchonRow, status: 'open', opening: HOURS, description: 'Korean fried chicken.' };
const openOut = await rewrite(SHELL, { pageUrl: PAGE, sbBase: SB, type: 'restaurant', entity: { id: 'o1', title: 'x', row: openRow } });
ck('control: an open row shows its hours', openOut.includes(`Hours: ${HOURS}`) && Array.isArray(injectedNode(openOut)?.openingHoursSpecification), JSON.stringify(injectedNode(openOut)?.openingHoursSpecification)?.slice(0, 80));
ck('control: an open row stays indexable', openOut.includes('name="robots" content="index, follow"'));

const closedOut = await rewrite(SHELL, { pageUrl: PAGE, sbBase: SB, type: 'restaurant', entity: { id: 'c1', title: 'x', row: { ...openRow, status: 'closed' } } });
ck('a closed row says "Permanently closed"', closedOut.includes('Permanently closed'));
ck('with no hours in the body', !closedOut.includes('Hours:'));
ck('and no openingHoursSpecification', injectedNode(closedOut) && !('openingHoursSpecification' in injectedNode(closedOut)));
ck('and robots noindex, follow', closedOut.includes('name="robots" content="noindex, follow"'), closedOut.match(/name="robots"[^>]*/)?.[0]);

for (const status of ['opening_soon', 'announced']) {
  const soon = await rewrite(SHELL, { pageUrl: PAGE, sbBase: SB, type: 'restaurant', entity: { id: 's1', title: 'x', row: { ...openRow, status } } });
  ck(`${status}: no hours anywhere`, !soon.includes('Hours:') && !('openingHoursSpecification' in (injectedNode(soon) ?? {})));
  ck(`${status}: still indexable and not called closed`, soon.includes('name="robots" content="index, follow"') && !soon.includes('Permanently closed'));
}

console.log('\nabsences the shell really has');
// A title-less entity must not blank the shell's own title.
const untitled = await rewrite(SHELL, { pageUrl: PAGE, sbBase: SB, type: 'restaurant', entity: { id: 'r2', title: '' } });
ck("an empty title leaves the shell's title alone", untitled.includes('<title>Des Moines Insider'), /<title>[^<]*/.exec(untitled)?.[0]);

console.log(`\n${bad} failure(s)`);
process.exit(bad ? 1 : 0);
