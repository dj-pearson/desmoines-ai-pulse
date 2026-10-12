/**
 * A hotel takes a Google place id only when the address and the name agree.
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/hotel-place-match.test.ts
 *
 * The restaurant enricher's rule (first result whose name contains our first
 * word, else the first result) would put most of this corpus on the wrong
 * property: it is chains, and "Hampton Inn" is four different buildings around
 * Des Moines. A guessed place id is stored indefinitely and every photo and
 * refresh follows it, so the matcher refuses rather than guesses.
 */

import { strict as assert } from 'node:assert';
import {
  decideHotelMatch,
  judgeCandidate,
  nameScore,
  streetParts,
  type HotelForMatch,
  type PlaceCandidate,
} from '../_shared/hotelPlaceMatch.ts';

const HAMPTON_WAUKEE: HotelForMatch = {
  name: 'Hampton Inn & Suites Waukee',
  address: '855 NE Alices Rd',
  city: 'Waukee',
  state: 'IA',
  zip: '50263',
};

const place = (id: string, name: string, address: string, types = ['lodging', 'point_of_interest']): PlaceCandidate => ({
  id,
  displayName: { text: name },
  formattedAddress: address,
  types,
  businessStatus: 'OPERATIONAL',
});

const WAUKEE = place('P-waukee', 'Hampton Inn & Suites by Hilton Waukee', '855 NE Alices Rd, Waukee, IA 50263, USA');
const ANKENY = place('P-ankeny', 'Hampton Inn & Suites by Hilton Ankeny', '1900 SE 13th St, Ankeny, IA 50021, USA');

Deno.test('the right building at the right address is high confidence', () => {
  const v = judgeCandidate(HAMPTON_WAUKEE, WAUKEE);
  assert.equal(v.address, 'match');
  assert.equal(v.confidence, 'high');
});

Deno.test('the same chain at another address is refused, whatever the name says', () => {
  const v = judgeCandidate(HAMPTON_WAUKEE, ANKENY);
  assert.equal(v.address, 'mismatch');
  assert.equal(v.confidence, 'low');
  assert.ok(v.reasons.some((r) => r.includes('855 vs 1900')), v.reasons.join('; '));
});

Deno.test('when only the wrong branch comes back, nothing is written', () => {
  // The restaurant rule would take this: first result, first word matches.
  const d = decideHotelMatch(HAMPTON_WAUKEE, [ANKENY]);
  assert.equal(d.accepted, null);
  assert.equal(d.status, 'refused');
  assert.equal(d.best?.placeId, 'P-ankeny', 'the report still names what was considered');
});

Deno.test('the right branch is picked from among the wrong ones', () => {
  const d = decideHotelMatch(HAMPTON_WAUKEE, [ANKENY, WAUKEE]);
  assert.equal(d.status, 'matched');
  assert.equal(d.accepted?.placeId, 'P-waukee');
});

Deno.test('same number on a different street is a mismatch', () => {
  const v = judgeCandidate(
    HAMPTON_WAUKEE,
    place('P-x', 'Hampton Inn & Suites Waukee', '855 Grand Ave, West Des Moines, IA 50265, USA'),
  );
  assert.equal(v.address, 'mismatch');
  assert.equal(v.confidence, 'low');
});

Deno.test('a matching address with a different hotel name is refused', () => {
  // Rebrands and shared addresses (a hotel inside a convention complex) are
  // exactly where "same address, other name" happens.
  const v = judgeCandidate(HAMPTON_WAUKEE, place('P-y', 'Holiday Inn Express', '855 NE Alices Rd, Waukee, IA 50263, USA'));
  assert.equal(v.address, 'match');
  assert.equal(v.confidence, 'low');
});

Deno.test('a place Google does not call lodging is refused', () => {
  const v = judgeCandidate(
    HAMPTON_WAUKEE,
    place('P-z', 'Hampton Inn & Suites Waukee Parking', '855 NE Alices Rd, Waukee, IA 50263, USA', ['parking']),
  );
  assert.equal(v.confidence, 'low');
});

Deno.test('a permanently closed place is refused', () => {
  const v = judgeCandidate(HAMPTON_WAUKEE, { ...WAUKEE, businessStatus: 'CLOSED_PERMANENTLY' });
  assert.equal(v.confidence, 'low');
});

Deno.test('two different places that both score high is ambiguous, not a pick', () => {
  const twin = { ...WAUKEE, id: 'P-waukee-2' };
  const d = decideHotelMatch(HAMPTON_WAUKEE, [WAUKEE, twin]);
  assert.equal(d.status, 'ambiguous');
  assert.equal(d.accepted, null);
});

Deno.test('the same place returned twice is not ambiguous', () => {
  const d = decideHotelMatch(HAMPTON_WAUKEE, [WAUKEE, { ...WAUKEE }]);
  assert.equal(d.status, 'matched');
});

Deno.test('no street number on our side is medium, and medium needs opting in', () => {
  const hotel: HotelForMatch = { name: 'Hotel Fort Des Moines', address: 'Downtown', city: 'Des Moines', zip: '50309' };
  const fort = place('P-fort', 'Hotel Fort Des Moines, Curio Collection by Hilton', '1000 Walnut St, Des Moines, IA 50309, USA');
  assert.equal(judgeCandidate(hotel, fort).confidence, 'medium');
  const refused = decideHotelMatch(hotel, [fort]);
  assert.equal(refused.accepted, null);
  assert.equal(refused.status, 'refused');
  assert.ok(refused.reasons[0].includes('allowMedium'));
  assert.equal(decideHotelMatch(hotel, [fort], { allowMedium: true }).accepted?.placeId, 'P-fort');
});

Deno.test('no street number and a weak name is low even with allowMedium', () => {
  const hotel: HotelForMatch = { name: 'Downtown Suites', address: 'Downtown', city: 'Des Moines', zip: '50309' };
  const d = decideHotelMatch(hotel, [place('P-q', 'Suites at the Plaza', '300 Walnut St, Des Moines, IA 50309, USA')], { allowMedium: true });
  assert.equal(d.accepted, null);
});

Deno.test('no candidates is its own status', () => {
  const d = decideHotelMatch(HAMPTON_WAUKEE, []);
  assert.equal(d.status, 'no_candidates');
  assert.equal(d.accepted, null);
});

Deno.test('street parts normalise the usual spellings', () => {
  assert.deepEqual(streetParts('855 Northeast Alice\'s Road'), { number: '855', words: ['ne', 'alice', 's', 'rd'] });
  assert.deepEqual(streetParts('1050 6th Avenue, Des Moines'), { number: '1050', words: ['6', 'ave'] });
  assert.equal(streetParts('Downtown').number, null);
  assert.equal(streetParts(null).number, null);
});

Deno.test('name agreement ignores the brand suffix Places appends', () => {
  assert.equal(nameScore('Hampton Inn & Suites Waukee', 'Hampton Inn & Suites by Hilton Waukee'), 1);
  assert.ok(nameScore('Hampton Inn & Suites Waukee', 'Holiday Inn Express') < 0.5);
  assert.equal(nameScore('The Hotel', 'Hotel'), 0, 'generic words alone are not agreement');
});
