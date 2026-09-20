#!/usr/bin/env node
/**
 * The cross-source duplicate tier (WEB-BE-052 AC2, AC4).
 *
 *   npx tsx scripts/__tests__/event-dedup-normalizer.test.mjs
 *
 * Tiers 1-3 of isDuplicateEvent compare titles for EQUALITY, so the same
 * concert arriving from SeatGeek, the venue and Catch Des Moines is three rows
 * the moment one of them adds a subtitle or a promoter prefix.
 *
 * AN OFFLINE SUITE RATHER THAN A DENO ONE, on purpose. eventDedup.ts imports
 * nothing but ./centralTime.ts, so it loads under tsx and runs in
 * `npm run test:offline` - which CI runs without Deno. The Deno lane names its
 * files one by one in subscription-sync-tests.yml, and WEB-CI-028 records what
 * happens to a spec nobody adds to a lane.
 *
 * ── THE OVER-MERGE IS THE DANGEROUS DIRECTION ────────────────────────────────
 *
 * A missed duplicate lists a show twice. A false duplicate DELETES a real event
 * from the site. So most of what follows asserts what must NOT merge, and the
 * rule that protects it is "at most one of the two titles had a subtitle":
 * a plain title against a subtitled one is one show described twice; two
 * different subtitles under one prefix is a series.
 */
import { isDuplicateEvent, normalizeEventTitle, normalizeVenueName } from '../../supabase/functions/_shared/eventDedup.ts';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`);
  }
};

const DATE = new Date('2026-05-20T19:00:00-05:00');
const ev = (title, venue = 'Vibrant Music Hall', date = DATE, source_url = 'https://a.example/1') => ({
  title, venue, date, source_url,
});
const existing = (title, venue = 'Vibrant Music Hall', date = DATE, source_url = 'https://b.example/2') => ({
  id: 'x', title, venue, date: date.toISOString(), source_url,
});

const verdict = (a, b) => isDuplicateEvent(a, [b]);

console.log('[event-dedup] the title key');
check('a subtitle after a colon is cut', normalizeEventTitle('George Thorogood & The Destroyers: The Baddest Show on Earth').key === 'georgethorogoodthedestroyers', normalizeEventTitle('George Thorogood & The Destroyers: The Baddest Show on Earth').key);
check('and the flag records that it was', normalizeEventTitle('A Very Long Show Name: Subtitle').hadSubtitle === true);
check('a plain title reports no subtitle', normalizeEventTitle('George Thorogood & The Destroyers').hadSubtitle === false);
check('a spaced dash is a subtitle too', normalizeEventTitle('George Thorogood and Friends - Live Tour').key === 'georgethorogoodfriends', normalizeEventTitle('George Thorogood and Friends - Live Tour').key);
// "&" and "and" are one word. Without this the story's own example still fails:
// SeatGeek writes "George Thorogood & The Destroyers" and the venue writes
// "...and the Destroyers", and stripping punctuation leaves those unequal.
check('an ampersand and the word "and" agree', normalizeEventTitle('George Thorogood & The Destroyers').key === normalizeEventTitle('George Thorogood and the Destroyers').key, normalizeEventTitle('George Thorogood and the Destroyers').key);
check('but "and" inside a word survives', normalizeEventTitle('Sandra Boynton Storytime Hour').key.startsWith('sandra'), normalizeEventTitle('Sandra Boynton Storytime Hour').key);
check('a promoter prefix is dropped', normalizeEventTitle('Live Nation presents: The Mountain Goats').key === 'themountaingoats', normalizeEventTitle('Live Nation presents: The Mountain Goats').key);
check('filler words go', normalizeEventTitle('The Mountain Goats Live In Concert').key === 'themountaingoats', normalizeEventTitle('The Mountain Goats Live In Concert').key);
check('but a word merely containing filler does not', normalizeEventTitle('Tourist Trap Comedy Hour').key.includes('tourist'), normalizeEventTitle('Tourist Trap Comedy Hour').key);

// A short prefix is NOT trusted. "comedynight" is eleven characters.
check('a short prefix keeps its subtitle', normalizeEventTitle('Comedy Night: Bob Smith').key === 'comedynightbobsmith', normalizeEventTitle('Comedy Night: Bob Smith').key);
check('and reports no subtitle was cut', normalizeEventTitle('Comedy Night: Bob Smith').hadSubtitle === false);

console.log('\nthe venue key');
check('punctuation and case go', normalizeVenueName("Wooly's") === 'woolys');
check('a leading "the" goes', normalizeVenueName('The Val Air Ballroom') === 'valairballroom');
check('a trailing location qualifier goes', normalizeVenueName('Wells Fargo Arena - Des Moines') === 'wellsfargoarena');
check('two spellings of one venue agree', normalizeVenueName('Vibrant Music Hall') === normalizeVenueName('vibrant music hall'));

console.log('\nwhat MUST merge');
{
  const v = verdict(ev('George Thorogood & The Destroyers'), existing('George Thorogood & The Destroyers: The Baddest Show on Earth'));
  check('the story\'s own example', v.isDuplicate === true, JSON.stringify(v));
  check('with a reason a log reader can trust', v.reason === 'normalized_title_venue_same_day', v.reason);
}
check(
  'a promoter prefix on one side',
  verdict(ev('AEG Presents: The Mountain Goats Tour'), existing('The Mountain Goats')).isDuplicate === true,
);
check(
  'a venue spelled with a qualifier',
  verdict(ev('Iowa Wild vs Texas Stars', 'Wells Fargo Arena'), existing('Iowa Wild vs Texas Stars', 'Wells Fargo Arena - Des Moines')).isDuplicate === true,
);

console.log('\nwhat MUST NOT merge');
check(
  'two different subtitles under one prefix are a series',
  verdict(ev('An Evening With Somebody: Bob Smith'), existing('An Evening With Somebody: Sue Jones')).isDuplicate === false,
);
check(
  'a short shared prefix is not an identity',
  verdict(ev('Comedy Night: Bob Smith'), existing('Comedy Night: Sue Jones')).isDuplicate === false,
);
check(
  'different opponents are different games',
  verdict(ev('Iowa Barnstormers vs Green Bay Blizzard', 'Caseys Center'), existing('Iowa Barnstormers vs Tulsa Oilers', 'Caseys Center')).isDuplicate === false,
);
check(
  'the same show at a different venue',
  verdict(ev('George Thorogood & The Destroyers'), existing('George Thorogood & The Destroyers: The Baddest Show on Earth', "Wooly's")).isDuplicate === false,
);
check(
  'the same show on a different day',
  verdict(
    ev('George Thorogood & The Destroyers'),
    existing(
      'George Thorogood & The Destroyers: The Baddest Show on Earth',
      'Vibrant Music Hall',
      new Date('2026-05-22T19:00:00-05:00'),
    ),
  ).isDuplicate === false,
);
check(
  'a title too short to identify anything',
  verdict(ev('Trivia'), existing('Trivia Night')).isDuplicate === false,
);

console.log('\nthe earlier tiers still decide first');
check(
  'an identical title and venue is still tier 3',
  verdict(ev('Outlander in Concert'), existing('Outlander in Concert')).reason === 'same_title_venue_same_day',
);

if (failures > 0) {
  console.error(`\n[event-dedup] ${failures} failure(s)`);
  process.exit(1);
}
console.log('\n[event-dedup] all checks passed');
