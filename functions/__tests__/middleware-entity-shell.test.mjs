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
ck('the title names the suburb and only what the page has', rich.includes('<title>Bonchon West Des Moines: Reviews | Des Moines Insider</title>'), /<title>[^<]*/.exec(rich)?.[0]);
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
// WEB-UX-089: no menu or reservations claim for a place closed for good. The
// control is the same row open, with a menu URL and a reservable flag.
const menuRow = { ...openRow, menu_url: 'https://bonchon.com/menu', reservable: true };
const menuOpenNode = injectedNode(await rewrite(SHELL, { pageUrl: PAGE, sbBase: SB, type: 'restaurant', entity: { id: 'm1', title: 'x', row: menuRow } }));
ck('control: an open row with a menu URL has hasMenu and acceptsReservations', !!menuOpenNode?.hasMenu && menuOpenNode?.acceptsReservations === true);
const menuClosedNode = injectedNode(await rewrite(SHELL, { pageUrl: PAGE, sbBase: SB, type: 'restaurant', entity: { id: 'm2', title: 'x', row: { ...menuRow, status: 'closed' } } }));
ck('a closed row has no hasMenu or acceptsReservations', !!menuClosedNode && !('hasMenu' in menuClosedNode) && !('acceptsReservations' in menuClosedNode), JSON.stringify(menuClosedNode)?.slice(0, 120));

// SEO-059: Google's CLOSED_PERMANENTLY on a row we still call open (Bistro
// Nomad before the data pass) is the same closure.
const googleClosedOut = await rewrite(SHELL, { pageUrl: PAGE, sbBase: SB, type: 'restaurant', entity: { id: 'g1', title: 'x', row: { ...openRow, status: 'open', business_status: 'CLOSED_PERMANENTLY' } } });
ck('business_status CLOSED_PERMANENTLY says "Permanently closed"', googleClosedOut.includes('Permanently closed'));
ck('with no hours and no openingHoursSpecification', !googleClosedOut.includes('Hours:') && !('openingHoursSpecification' in (injectedNode(googleClosedOut) ?? {})));
ck('and robots noindex, follow', googleClosedOut.includes('name="robots" content="noindex, follow"'), googleClosedOut.match(/name="robots"[^>]*/)?.[0]);
const googleTempOut = await rewrite(SHELL, { pageUrl: PAGE, sbBase: SB, type: 'restaurant', entity: { id: 'g2', title: 'x', row: { ...openRow, status: 'open', business_status: 'CLOSED_TEMPORARILY' } } });
ck('CLOSED_TEMPORARILY: no hours, but still indexable and not called closed for good', !googleTempOut.includes('Hours:') && googleTempOut.includes('name="robots" content="index, follow"') && !googleTempOut.includes('Permanently closed'));

for (const status of ['opening_soon', 'announced']) {
  const soon = await rewrite(SHELL, { pageUrl: PAGE, sbBase: SB, type: 'restaurant', entity: { id: 's1', title: 'x', row: { ...openRow, status } } });
  ck(`${status}: no hours anywhere`, !soon.includes('Hours:') && !('openingHoursSpecification' in (injectedNode(soon) ?? {})));
  ck(`${status}: still indexable and not called closed`, soon.includes('name="robots" content="index, follow"') && !soon.includes('Permanently closed'));
}

console.log('\nthe answer next to the name (SEO-034)');
// 2026-10-02 is a Friday; 17:00Z is noon in Des Moines.
const FRIDAY = new Date('2026-10-02T17:00:00Z');
const answerRow = {
  ...bonchonRow,
  status: 'open',
  description: 'Korean fried chicken.',
  hours_json: {
    periods: [1, 2, 3, 4, 5].map((day) => ({ open: { day, hour: 11, minute: 0 }, close: { day, hour: 21, minute: 0 } })),
    weekdayDescriptions: ['Friday: 11:00 AM - 9:00 PM'],
  },
  updated_at: '2026-10-01T15:00:00Z',
  google_maps_uri: 'https://maps.google.com/?cid=42',
  reservable: false,
  rating: 4.7,
};
const answer = await rewrite(SHELL, {
  pageUrl: 'https://desmoinesinsider.com/restaurants/bonchon',
  sbBase: SB,
  type: 'restaurant',
  entity: { id: 'a1', title: 'x', row: answerRow },
  now: FRIDAY,
});
const an = injectedNode(answer);
ck("the day's hours are phrased by schedule", answer.includes('<li>Open 11 AM to 9 PM on Fridays</li>'), answer.match(/<ul>.*?<\/ul>/)?.[0]);
ck('and come before the address', answer.indexOf('on Fridays') < answer.indexOf('Address:'));
ck('the listing says when it last changed', answer.includes('Listing last updated October 1, 2026'));
ck('the suburb page is linked', answer.includes('href="/neighborhoods/west-des-moines"'));
ck('sameAs carries the site and the Google listing', JSON.stringify(an?.sameAs) === JSON.stringify([bonchonRow.website, 'https://maps.google.com/?cid=42']), JSON.stringify(an?.sameAs));
ck('acceptsReservations says what the row says', an?.acceptsReservations === false);
ck('dateModified rides on mainEntityOfPage', an?.mainEntityOfPage?.['@type'] === 'WebPage' && an.mainEntityOfPage.dateModified === '2026-10-01T15:00:00Z', JSON.stringify(an?.mainEntityOfPage));
ck('no aggregateRating, even with a Google rating on the row', an && !('aggregateRating' in an));
ck('still one ld+json block', [...answer.matchAll(/application\/ld\+json/g)].length === 1);
const noReservable = injectedNode(await rewrite(SHELL, { pageUrl: PAGE, sbBase: SB, type: 'restaurant', entity: { id: 'a2', title: 'x', row: { ...answerRow, reservable: null } } }));
ck('unknown reservations are left out, not published as false', noReservable && !('acceptsReservations' in noReservable));
const closedAnswer = await rewrite(SHELL, { pageUrl: PAGE, sbBase: SB, type: 'restaurant', entity: { id: 'a3', title: 'x', row: { ...answerRow, status: 'closed' } } });
ck('a closed place gets no hours sentence and no phone', !closedAnswer.includes('on Fridays') && !closedAnswer.includes('Phone:'));

console.log('\nabsences the shell really has');
// A title-less entity must not blank the shell's own title.
const untitled = await rewrite(SHELL, { pageUrl: PAGE, sbBase: SB, type: 'restaurant', entity: { id: 'r2', title: '' } });
ck("an empty title leaves the shell's title alone", untitled.includes('<title>Des Moines Insider'), /<title>[^<]*/.exec(untitled)?.[0]);

console.log('\nannual event series (SEO-043)');
{
  const { eventShellBody } = await import('../_middleware.ts');
  const annual = eventShellBody({ title: '11th Annual Cloris Awards', date: '2026-08-30T23:00:00Z', venue: 'Sheslow Auditorium' });
  ck('an annual event links its series page', annual.includes('href="/events/series/cloris-awards"'), annual.slice(0, 400));
  const oneOff = eventShellBody({ title: 'Gary Clark Jr.', date: '2026-09-30T23:00:00Z', venue: 'Hoyt Sherman Place' });
  ck('a one-off event links no series', !oneOff.includes('/events/series/'));
}

console.log('\nno start time published when the source gave none (WEB-SEO-072)');
{
  const { eventShellBody } = await import('../_middleware.ts');
  const tbdPage = 'https://desmoinesinsider.com/events/hawkeye-watch-party-2026-10-09';
  // SeatGeek flags an unannounced showtime with time_tbd and fills the instant
  // with 03:30 local; other sources write the 19:31:58 marker. The React page
  // (eventStartIso, WEB-BE-038) publishes a date-only startDate for both.
  const tbdRow = {
    ...eventRow,
    title: 'Hawkeye Watch Party',
    date: '2026-10-09T08:30:00Z',
    event_start_utc: '2026-10-09T08:30:00Z',
    time_tbd: true,
  };
  const tbd = injectedNode(await rewrite(SHELL, {
    pageUrl: tbdPage, sbBase: SB, type: 'event',
    entity: { id: 't9', title: tbdRow.title, startDate: tbdRow.event_start_utc, row: tbdRow }, now: NOW,
  }));
  ck('time_tbd: startDate is the Central date, no clock time', tbd?.startDate === '2026-10-09', tbd?.startDate);
  const tbdBody = eventShellBody(tbdRow, NOW);
  ck('time_tbd: the body prints no 3:30 AM', !/3:30/.test(tbdBody), tbdBody.match(/When: [^<]*/)?.[0]);
  ck('time_tbd: the body says the time is not listed', tbdBody.includes('When: Friday, October 9, 2026 (time not listed)'), tbdBody.match(/When: [^<]*/)?.[0]);

  // 19:31:58 Central on Oct 9 is 00:31:58 UTC on Oct 10: the Central day must
  // survive, not the UTC one.
  const markerRow = { ...eventRow, title: 'Fall Fest', date: '2026-10-10T00:31:58Z', event_start_utc: '2026-10-10T00:31:58Z', time_tbd: false };
  const marker = injectedNode(await rewrite(SHELL, {
    pageUrl: 'https://desmoinesinsider.com/events/fall-fest-2026-10-09', sbBase: SB, type: 'event',
    entity: { id: 'm9', title: 'Fall Fest', startDate: markerRow.event_start_utc, row: markerRow }, now: NOW,
  }));
  ck('marker: startDate is the Central day of the marker', marker?.startDate === '2026-10-09', marker?.startDate);
  ck('marker: the body prints no 7:31 PM', !/7:31/.test(eventShellBody(markerRow, NOW)));

  const seatgeekRow = {
    ...eventRow, title: 'Tour Stop', time_tbd: undefined, source_url: 'https://seatgeek.com/tour-stop-tickets/1',
    date: '2026-10-09T08:30:00Z', event_start_utc: '2026-10-09T08:30:00Z', event_start_local: '2026-10-09T03:30:00',
  };
  const sg = injectedNode(await rewrite(SHELL, {
    pageUrl: 'https://desmoinesinsider.com/events/tour-stop-2026-10-09', sbBase: SB, type: 'event',
    entity: { id: 's9', title: 'Tour Stop', startDate: seatgeekRow.event_start_utc, row: seatgeekRow }, now: NOW,
  }));
  ck('SeatGeek 03:30 placeholder without the flag: date only', sg?.startDate === '2026-10-09', sg?.startDate);

  // A run with a real end date keeps it, as a Central date to match.
  const runRow = { ...tbdRow, end_date: '2026-10-12T04:59:00Z' };
  const run = injectedNode(await rewrite(SHELL, {
    pageUrl: tbdPage, sbBase: SB, type: 'event',
    entity: { id: 'r9', title: runRow.title, startDate: runRow.event_start_utc, row: runRow }, now: NOW,
  }));
  ck('time_tbd run: endDate is the Central end day', run?.endDate === '2026-10-11', run?.endDate);

  // Without the full row (the minimal select), the marker is still caught.
  const thin = injectedNode(await rewrite(SHELL, {
    pageUrl: 'https://desmoinesinsider.com/events/fall-fest-2026-10-09', sbBase: SB, type: 'event',
    entity: { id: 'm8', title: 'Fall Fest', startDate: '2026-10-10T00:31:58Z' }, now: NOW,
  }));
  ck('minimal path: the marker becomes a date-only startDate', thin?.startDate === '2026-10-09', thin?.startDate);

  // A real showtime is untouched.
  ck('a stated time keeps its instant', en?.startDate === '2026-10-10T01:00:00Z', en?.startDate);
}

// WEB-SEO-073. Helmet removes only the tags it wrote, so a crawler that runs
// JavaScript sees the shell's node AND the React page's. The shell used the bare
// page URL as @id for every type: the React Event is `<url>#event`, so that
// crawler read two Events, and the bare URL is the page's own WebPage @id, so
// the shell's Event also merged into "a WebPage that is an Event".
console.log('\nthe entity @id matches the React page (WEB-SEO-073)');
{
  const { buildEventJsonLd } = await import('../../src/lib/eventSchema.ts');
  const { buildArticleJsonLd } = await import('../../src/lib/articleSchema.ts');
  const { entityNodeId } = await import('../../src/lib/schemaNodeIds.ts');

  // Full row: the React builder and the shell, one row, one id rule.
  const evPage = 'https://desmoinesinsider.com/events/red-leather-2026-10-09';
  ck('full-row shell Event is <url>#event', en?.['@id'] === `${evPage}#event`, en?.['@id']);
  const reactEvent = buildEventJsonLd({ ...eventRow, slug: 'red-leather-2026-10-09' });
  ck(
    'and the React Event uses the same rule',
    reactEvent['@id'] === `${reactEvent.url}#event` && reactEvent['@id'] === entityNodeId('event', reactEvent.url),
    reactEvent['@id'],
  );
  ck('the shell Event @id is not the bare page URL', en?.['@id'] !== evPage);

  const reactArticle = buildArticleJsonLd({ slug: 'fall-guide', title: 'Fall guide', published_at: '2026-10-01T00:00:00Z' });
  ck(
    'the React Article has <url>#article, apart from its WebPage',
    reactArticle['@id'] === `${reactArticle.url}#article` && reactArticle.mainEntityOfPage['@id'] === reactArticle.url,
    reactArticle['@id'],
  );

  // Minimal path, every type: the fragment the React page uses.
  const want = { event: '#event', attraction: '#place', playground: '#place', hotel: '#hotel', article: '#article', restaurant: '' };
  for (const [type, frag] of Object.entries(want)) {
    const page = `https://desmoinesinsider.com/${type}s/x-1`;
    const node = injectedNode(await rewrite(SHELL, { pageUrl: page, sbBase: SB, type, entity: { id: 'x1', title: 'X' } }));
    ck(`minimal ${type} node @id is <url>${frag}`, node?.['@id'] === `${page}${frag}`, node?.['@id']);
    ck(`minimal ${type} node url stays the page`, node?.url === page, node?.url);
  }
  const other = injectedNode(await rewrite(SHELL, { pageUrl: PAGE, sbBase: SB, type: 'somethingelse', entity: { id: 'x', title: 'X' } }));
  ck('an unmapped type keeps the bare URL', other?.['@id'] === PAGE, other?.['@id']);
}

console.log(`\n${bad} failure(s)`);
process.exit(bad ? 1 : 0);
