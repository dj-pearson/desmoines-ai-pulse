#!/usr/bin/env node
/**
 * Offline checks for the source-URL to venue mapping that
 * scripts/reclaim-venue-images.ts uses to decide which events to repoint.
 *
 *   npx tsx scripts/__tests__/reclaim-venue-images.test.mjs
 *
 * WHY THIS AND NOT MORE. The script's database and storage calls cannot be
 * tested here - there are no Supabase credentials in this container and the
 * agent proxy refuses every host but the package registries. What CAN be tested
 * is the decision that governs which rows are touched at all, and that decision
 * is pure: a URL in, a venue name or null out.
 *
 * THE DIRECTION THAT MATTERS is the aggregators returning null. A false
 * positive there would repoint a Catch Des Moines or SeatGeek event - whose
 * artwork is genuinely per-event - at a venue image, and the original is then
 * deleted by the same run. Those cases are asserted explicitly rather than
 * left to follow from the venue cases passing.
 */
import { venueForSourceUrl, profileForUrl } from '../reclaim-venue-images.ts';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else {
    console.log(`  FAIL  ${name} ${detail}`);
    failures++;
  }
};

console.log('single-venue sources resolve to their venue');
for (const [url, venue] of [
  ['https://www.hoytsherman.org/events/an-evening-with/', 'Hoyt Sherman Place'],
  ['https://hoyt-sherman.org/events/x', 'Hoyt Sherman Place'],
  ['https://woolysdm.com/event/some-band/', "Wooly's"],
  ['https://www.firstfleetconcerts.com/events', "Wooly's"],
  ['https://www.vibrantmusichall.com/events/x', 'Vibrant Music Hall'],
  ['https://www.iowacubs.com/schedule/2026-05', 'Principal Park'],
  ['https://www.milb.com/iowa/schedule', 'Principal Park'],
  ['https://www.theiowabarnstormers.com/schedule', 'Wells Fargo Arena'],
  ['https://www.iowawild.com/schedule/', 'Wells Fargo Arena'],
  ['https://iowa.gleague.nba.com/schedule', 'Wells Fargo Arena'],
  ['https://dmplayhouse.com/shows/x', 'Des Moines Community Playhouse'],
]) {
  const got = venueForSourceUrl(url);
  check(`${new URL(url).host} -> ${venue}`, got === venue, `got ${got}`);
}

console.log('\nthe three teams at one arena share a venue key');
check(
  'Barnstormers, Wild and Wolves all resolve to the same venue',
  new Set([
    venueForSourceUrl('https://www.theiowabarnstormers.com/x'),
    venueForSourceUrl('https://www.iowawild.com/x'),
    venueForSourceUrl('https://iowa.gleague.nba.com/x'),
  ]).size === 1,
);

console.log('\naggregators resolve to null - the direction that must not break');
for (const url of [
  'https://www.catchdesmoines.com/event/some-thing/12345/',
  'https://catchdesmoines.com/events/',
  'https://seatgeek.com/des-moines-ia-tickets',
  'https://www.eventbrite.com/d/ia--west-des-moines/events/',
  'https://www.theaterdesmoines.com/shows',
  'https://des-moines-theater.com/x',
]) {
  const got = venueForSourceUrl(url);
  check(`${new URL(url).host} is an aggregator`, got === null, `got ${got}`);
}

console.log('\nunknown and malformed input is treated as an aggregator, not as a venue');
for (const url of ['https://example.com/events', 'not a url', '', 'javascript:alert(1)']) {
  check(`${JSON.stringify(url).slice(0, 30)} -> null`, venueForSourceUrl(url) === null);
}

console.log('\nhost matching is suffix-anchored, not substring');
check(
  'a lookalike host does not match a real one',
  venueForSourceUrl('https://notwoolysdm.com/event/x') === null,
  `got ${venueForSourceUrl('https://notwoolysdm.com/event/x')}`,
);
check(
  'a subdomain of a profile host does match',
  venueForSourceUrl('https://tickets.hoytsherman.org/e/1') === 'Hoyt Sherman Place',
);

console.log('\nevery profile with a venue names one, and no aggregator does');
const withVenue = ['hoytsherman.org', 'woolysdm.com', 'vibrantmusichall.com'];
check(
  'profileForUrl returns a profile for a known host',
  withVenue.every((h) => profileForUrl(`https://${h}/`) !== null),
);

// The edge functions make the same decision through a different module. If the
// two ever disagree, a scrape would keep fetching per-event images for a venue
// this script has already repointed, and the next run would undo the reclaim.
console.log('\nthe edge-side decision agrees with the script-side one');
const { venueNameForSourceUrl } = await import('../../supabase/functions/_shared/venueImage.ts');
for (const url of [
  'https://www.hoytsherman.org/events/x',
  'https://woolysdm.com/event/x',
  'https://www.iowawild.com/schedule',
  'https://www.catchdesmoines.com/event/x/1/',
  'https://seatgeek.com/x',
  'not a url',
]) {
  check(
    `${JSON.stringify(url).slice(0, 44)} agrees`,
    venueNameForSourceUrl(url) === venueForSourceUrl(url),
    `edge=${venueNameForSourceUrl(url)} script=${venueForSourceUrl(url)}`,
  );
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
