/**
 * Unit tests for the JSON-LD (schema.org/Event) event extractor.
 * Run with: `deno test supabase/functions/_shared/jsonLdEvents.test.ts`
 *
 * Covers the shapes real event platforms emit: WordPress "The Events Calendar"
 * (single Event with a Place + Offer), @graph/ItemList containers, @type arrays,
 * malformed blocks that must not sink the page, date-only startDates, relative
 * URL resolution, price/free handling, and title+day dedupe.
 */
import { extractEventsFromJsonLd, normalizeJsonLdDate } from './jsonLdEvents.ts';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

Deno.test('extracts a single "The Events Calendar"-style event with Place + Offer', () => {
  const html = `<html><head>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Event","name":"Summer Concert Series",
     "startDate":"2026-08-15T19:00:00-05:00",
     "location":{"@type":"Place","name":"Lauridsen Amphitheater","address":{"@type":"PostalAddress","streetAddress":"1000 Robert D Ray Dr","addressLocality":"Des Moines","addressRegion":"IA","postalCode":"50309"}},
     "url":"/event/summer-concert/","image":"https://x.com/img.jpg",
     "offers":{"@type":"Offer","price":"25","priceCurrency":"USD"}}
    </script></head><body></body></html>`;
  const r = extractEventsFromJsonLd(html, 'https://example.com/events/');
  assert(r.length === 1, 'one event');
  assert(r[0].title === 'Summer Concert Series', 'title');
  // Local wall-clock is preserved; the -05:00 offset is NOT applied.
  assert(r[0].date === '2026-08-15 19:00:00', `date preserved, got ${r[0].date}`);
  assert(r[0].venue === 'Lauridsen Amphitheater', 'venue name');
  assert(r[0].location.includes('1000 Robert D Ray'), 'full address');
  assert(r[0].price === '$25', `price, got ${r[0].price}`);
  assert(r[0].source_url === 'https://example.com/event/summer-concert/', 'relative url resolved');
});

Deno.test('walks @graph, skips non-events, handles date-only and free price', () => {
  const html = `<script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[
      {"@type":"WebSite","name":"Venue Site"},
      {"@type":"MusicEvent","name":"Jazz Night","startDate":"2026-09-01","location":"The Basement, Des Moines","offers":[{"price":"0","priceCurrency":"USD"}]},
      {"@type":"MusicEvent","name":"Rock Show","startDate":"2026-09-05T20:30","location":{"name":"Wooly's"}}
    ]}
    </script>`;
  const r = extractEventsFromJsonLd(html, 'https://venue.com/');
  assert(r.length === 2, `two events (WebSite skipped), got ${r.length}`);
  assert(r[0].category === 'Music', 'MusicEvent -> Music');
  assert(r[0].date === '2026-09-01 19:00:00', 'date-only defaults to 19:00');
  assert(r[0].price === 'Free', 'price 0 -> Free');
  assert(r[1].date === '2026-09-05 20:30:00', 'HH:MM time preserved');
});

Deno.test('a malformed block does not sink sibling valid blocks; @type array maps category', () => {
  const html = `
    <script type="application/ld+json">{ this is broken json }</script>
    <script type="application/ld+json">[{"@type":["Event","Festival"],"name":"Art Fair","startDate":"2026-10-10T10:00:00"}]</script>`;
  const r = extractEventsFromJsonLd(html, 'https://a.com/');
  assert(r.length === 1, 'valid block still parsed');
  assert(r[0].category === 'Festival', '@type array resolves to Festival');
});

Deno.test('returns nothing when there is no JSON-LD or no startDate', () => {
  assert(extractEventsFromJsonLd('<html><body>no data</body></html>', 'https://a.com/').length === 0, 'no ld+json');
  const noDate = `<script type="application/ld+json">{"@type":"Event","name":"No Date"}</script>`;
  assert(extractEventsFromJsonLd(noDate, 'https://a.com/').length === 0, 'no startDate skipped');
});

Deno.test('dedupes events with the same title on the same calendar day', () => {
  const html = `<script type="application/ld+json">[
    {"@type":"Event","name":"Repeat","startDate":"2026-11-11T18:00"},
    {"@type":"Event","name":"Repeat","startDate":"2026-11-11T21:00"}
  ]</script>`;
  assert(extractEventsFromJsonLd(html, 'https://a.com/').length === 1, 'collapsed to one');
});

Deno.test('normalizeJsonLdDate handles the common ISO shapes', () => {
  assert(normalizeJsonLdDate('2026-08-15') === '2026-08-15 19:00:00', 'date-only');
  assert(normalizeJsonLdDate('2026-08-15T09:30') === '2026-08-15 09:30:00', 'no seconds');
  assert(normalizeJsonLdDate('2026-08-15T09:30:45-05:00') === '2026-08-15 09:30:45', 'with offset');
  assert(normalizeJsonLdDate('not a date') === null, 'garbage -> null');
  assert(normalizeJsonLdDate(undefined) === null, 'undefined -> null');
});
