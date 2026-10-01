/**
 * Venue canonicalization is conservative (WEB-BE-039 AC4).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/venue-match.test.ts
 *
 * firecrawl-scraper matched a scraped venue with `includes` either way, guarded
 * by `searchText.length >= 5 || venueLower.length >= 5`. The OR is the bug: the
 * right-hand side is about the KNOWN venue, which is always long enough, so the
 * guard passed for any extraction at all and "Park" matched the first known
 * venue containing it.
 *
 * A match is not a label. The caller overwrites the event's venue name, its
 * full street address and its latitude and longitude, so a 4-character
 * extraction put the event at another venue's address and pinned it there.
 */

import { strict as assert } from 'node:assert';
import { matchKnownVenue, type MatchableVenue } from '../_shared/venueMatch.ts';

const VENUES: MatchableVenue[] = [
  { name: 'Principal Park', aliases: ['Sec Taylor Stadium'] },
  { name: 'Hoyt Sherman Place', aliases: ['Hoyt Sherman'] },
  { name: 'Iowa Events Center', aliases: ['Wells Fargo Arena'] },
  { name: 'The Temple for Performing Arts', aliases: [] },
  { name: 'Wells Fargo Arena', aliases: [] },
];

Deno.test('AC4: "Park" does not match "Principal Park"', () => {
  // The defect, exactly as filed. Four characters, a common noun, and the old
  // guard let it through because "principal park" is longer than five.
  assert.equal(matchKnownVenue('Park', VENUES), null);
});

Deno.test('AC4: "Hoyt Sherman" matches "Hoyt Sherman Place"', () => {
  const m = matchKnownVenue('Hoyt Sherman', VENUES);
  assert.ok(m, 'a real abbreviation must still canonicalize');
  assert.equal(m.venue.name, 'Hoyt Sherman Place');
  // It is an alias here, which is the strongest kind - worth asserting so a
  // future edit cannot downgrade it to a lucky partial.
  assert.equal(m.kind, 'alias');
});

Deno.test('short common words match nothing', () => {
  for (const word of ['The', 'Hall', 'Room', 'Park', 'Arena', 'Iowa']) {
    const m = matchKnownVenue(word, VENUES);
    assert.equal(m, null, `"${word}" matched ${m?.venue.name}`);
  }
});

Deno.test('a long word that is only part of a venue does not match', () => {
  // Six characters clears the length rule, so coverage is what has to stop it:
  // "Center" is 6 of the 18 in "Iowa Events Center". An event at some other
  // centre would otherwise take that venue's address and pin.
  assert.equal(matchKnownVenue('Center', VENUES), null);
  assert.equal(matchKnownVenue('Performing', VENUES), null);
});

Deno.test('exact and alias matches are unaffected', () => {
  assert.equal(matchKnownVenue('Principal Park', VENUES)?.kind, 'exact');
  assert.equal(matchKnownVenue('  principal   park  ', VENUES)?.kind, 'exact');
  assert.equal(matchKnownVenue('Sec Taylor Stadium', VENUES)?.venue.name, 'Principal Park');
  assert.equal(matchKnownVenue('Wells Fargo Arena', VENUES)?.kind, 'exact');
});

Deno.test('a scrape that swept up extra words still matches the venue', () => {
  // The other direction: the extraction is longer than the venue name.
  const m = matchKnownVenue('Hoyt Sherman Place Theater', VENUES);
  assert.ok(m);
  assert.equal(m.venue.name, 'Hoyt Sherman Place');
});

Deno.test('a whole sentence does not match on one venue inside it', () => {
  // Coverage applies in that direction too, or a scrape that grabbed a
  // paragraph would canonicalize on any venue named in it.
  assert.equal(
    matchKnownVenue(
      'Doors open at seven for the show, held this Friday somewhere near Wells Fargo Arena downtown',
      VENUES,
    ),
    null,
  );
});

Deno.test('word boundaries are required', () => {
  // "Hall" inside "Marshalltown" is the shape plain includes() allows.
  assert.equal(matchKnownVenue('Marsh', [{ name: 'Marshalltown Arena' }]), null);
});

Deno.test('empty and whitespace input match nothing', () => {
  assert.equal(matchKnownVenue('', VENUES), null);
  assert.equal(matchKnownVenue('   ', VENUES), null);
});

const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '');

Deno.test('every ingestion path canonicalizes through the shared matcher', async () => {
  // The regression that matters: the rules above are correct and irrelevant if
  // a scraper keeps its own copy.
  //
  // The chain gained a link under WEB-BE-050. firecrawl-scraper held the venue
  // cache, the query and the matcher wrapper privately, which is why it was the
  // only path that set coordinates; they moved to _shared/knownVenues.ts so
  // ai-crawler could use them too. So the assertion is now that the scrapers
  // reach matchKnownVenue THROUGH that module, and that the module is the only
  // thing between them and it.
  const shared = codeOnly(
    await Deno.readTextFile(new URL('../_shared/knownVenues.ts', import.meta.url)),
  );
  assert.match(
    shared,
    /import \{ matchKnownVenue[^}]*\} from "\.\/venueMatch\.ts"/,
    '_shared/knownVenues.ts must canonicalize through _shared/venueMatch.ts',
  );

  for (const fn of ['firecrawl-scraper', 'ai-crawler']) {
    const code = codeOnly(
      await Deno.readTextFile(new URL(`../${fn}/index.ts`, import.meta.url)),
    );
    assert.match(
      code,
      /from "\.\.\/_shared\/knownVenues\.ts"/,
      `${fn} must look venues up through _shared/knownVenues.ts`,
    );
    assert.ok(
      !/searchText\.length\s*>=\s*5\s*\|\|/.test(code),
      `${fn}: the OR-guarded partial match is back`,
    );
    assert.ok(
      !/from\(['"]known_venues['"]\)/.test(code),
      `${fn} queries known_venues directly again - the cache and the match rules belong in one place`,
    );
  }
});
