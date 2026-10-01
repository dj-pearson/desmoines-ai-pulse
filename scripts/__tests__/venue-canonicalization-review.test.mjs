#!/usr/bin/env node
/**
 * The review that finds events canonicalized onto the wrong venue
 * (WEB-BE-039 AC5).
 *
 * THE DIRECTION THAT MUST NOT BREAK IS THE FALSE POSITIVE. This list is handed
 * to a human to act on, and every wrong entry is a correct row somebody is
 * invited to "fix". So the cases below are weighted toward rows that must come
 * back OK: an aggregator source, a venue named by an alias, a venue the site
 * does not know at all.
 *
 * The matching half has one case that matters - a Wooly's URL storing Principal
 * Park - and it is the exact shape the story describes: "Park" matched
 * Principal Park under the old rule, and the row took that venue's name,
 * address and coordinates.
 */
import { reviewEvent, summarize } from '../lib/venueCanonicalizationReview.ts';
import { venueForSourceUrl, profileForUrl } from '../reclaim-venue-images.ts';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

const VENUES = [
  { name: "Wooly's", aliases: ['Woolys', 'The Wooly'], latitude: 41.5868, longitude: -93.6191 },
  { name: 'Principal Park', aliases: [], latitude: 41.5806, longitude: -93.6152 },
  { name: 'Hoyt Sherman Place', aliases: ['Hoyt Sherman'], latitude: 41.5933, longitude: -93.6398 },
];

const ev = (over) => ({ id: 'e1', title: 'A show', venue: null, location: null, latitude: null, longitude: null, source_url: null, ...over });
const review = (over) => reviewEvent(ev(over), VENUES, venueForSourceUrl);

console.log('\nthe resolver this is built on');
{
  // If the shared resolver stops recognising a venue source, every row from it
  // becomes "not checkable" and this whole review quietly reports nothing.
  check("a Wooly's URL resolves to a venue", venueForSourceUrl('https://www.woolysdm.com/events/123') === "Wooly's", String(venueForSourceUrl('https://www.woolysdm.com/events/123')));
  check('an aggregator resolves to no venue', venueForSourceUrl('https://www.catchdesmoines.com/events/') === null);
  check('and a profile is found for it either way', profileForUrl('https://www.catchdesmoines.com/events/') !== null);
}

console.log('\nthe case the story describes');
{
  const r = review({
    venue: 'Principal Park',
    source_url: 'https://www.woolysdm.com/events/123',
    latitude: 41.5806,
    longitude: -93.6152,
  });
  check('a Wooly\'s event stored at Principal Park is SUSPECT', r.verdict === 'suspect', r.reason);
  check('  and the reason names both venues', /Wooly/.test(r.reason) && /Principal Park/.test(r.reason), r.reason);
  // The address is not the only thing that moved - the pin did too.
  check('  the moved coordinates are flagged', r.coordinatesMoved === true);
}
{
  // Same mismatch, but the row kept its own coordinates. Still suspect; the
  // flag is about how much damage was done, not about whether it happened.
  const r = review({ venue: 'Principal Park', source_url: 'https://www.woolysdm.com/e/1', latitude: 41.99, longitude: -93.99 });
  check('a mismatch with different coordinates is still suspect', r.verdict === 'suspect');
  check('  but is not flagged as moved', r.coordinatesMoved === false);
}

console.log('\nthe false positives that would waste a reviewer');
{
  const r = review({ venue: "Wooly's", source_url: 'https://www.woolysdm.com/events/123' });
  check('the right venue is OK', r.verdict === 'ok', r.reason);
}
{
  // The row names the venue by an alias. Treating that as a mismatch would put
  // every correctly-canonicalized row on the list.
  const r = review({ venue: 'Woolys', source_url: 'https://www.woolysdm.com/events/123' });
  check('an alias for the right venue is OK', r.verdict === 'ok', r.reason);
  // ASSERT THE REASON, NOT JUST THE VERDICT. Without the alias rule this row
  // still comes back 'ok' - it falls through to "stored venue is not a known
  // venue", which is a different claim and happens to have the same verdict.
  // A negative control proved the alias branch could be deleted with the
  // suite still green, which is how a rule stops being tested.
  check(
    '  recognised AS that venue, not merely unrecognised',
    /its source always covers/.test(r.reason),
    r.reason,
  );
}
{
  // A venue the site does not know was never canonicalized, so it cannot have
  // been canonicalized wrongly - whatever it says is what the source said.
  const r = review({ venue: 'Some Back Room', source_url: 'https://www.woolysdm.com/events/123' });
  check('an unknown venue name is OK, not suspect', r.verdict === 'ok', r.reason);
  check('  and the reason says why', /not a known venue/.test(r.reason), r.reason);
}
{
  const r = review({ venue: 'Principal Park', source_url: 'https://www.catchdesmoines.com/event/1' });
  check('an aggregator source is UNKNOWN, not ok and not suspect', r.verdict === 'unknown', r.reason);
  check('  because its URL says nothing about the venue', /aggregator|unrecognised/.test(r.reason), r.reason);
}
{
  const r = review({ venue: 'Principal Park', source_url: null });
  check('no source_url is UNKNOWN', r.verdict === 'unknown', r.reason);
}
{
  const r = review({ venue: null, source_url: 'https://www.woolysdm.com/e/1' });
  check('a row with no venue at all is OK', r.verdict === 'ok', r.reason);
}

console.log('\nthe summary separates checked from not checkable');
{
  const rows = [
    review({ venue: 'Principal Park', source_url: 'https://www.woolysdm.com/e/1', latitude: 41.5806, longitude: -93.6152 }),
    review({ venue: "Wooly's", source_url: 'https://www.woolysdm.com/e/2' }),
    review({ venue: 'Principal Park', source_url: 'https://www.catchdesmoines.com/e/3' }),
  ];
  const s = summarize(rows);
  check('one suspect', s.suspect === 1, JSON.stringify(s));
  check('one ok', s.ok === 1, JSON.stringify(s));
  // "Not checkable" counted as fine is how a review reports a clean bill of
  // health it did not earn.
  check('one not checkable, counted separately', s.unknown === 1, JSON.stringify(s));
  check('and the moved-coordinate count is its own number', s.coordinatesMoved === 1, JSON.stringify(s));
}

console.log('\nthe script is read-only');
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('scripts/review-canonicalized-venues.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/(?<!:)\/\/.*$/, '')).join('\n');
  check('it never writes', !/\.update\(|\.insert\(|\.upsert\(|\.delete\(/.test(src));
  check('and has no --apply to grow one', !/--apply/.test(src));
  // A failed read that returns [] would report a clean bill of health.
  check('zero venues is refused, not passed', /refusing to report/.test(src));
  check('zero events is refused too', /zero events read/.test(src));
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
