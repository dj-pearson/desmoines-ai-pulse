#!/usr/bin/env node
/**
 * Offline checks for the duplicate-event keeper rule (WEB-SEO-017 AC2).
 *
 *   npx tsx scripts/__tests__/merge-duplicate-events.test.mjs
 *
 * WHY THIS EXISTS AT ALL. The first real run of merge-duplicate-events.ts
 * reported "10 group(s) decidable by the rule, 0 need a human". A branch that
 * has never fired is a branch nobody has tested, and this repo has been caught
 * twice by exactly that: check-edge-types announced 158 fixed errors while
 * parsing nothing, and check-ballot-reads passed the very read it existed to
 * catch. So the case that MATTERS most here is the ambiguous one, which no real
 * data has yet produced.
 *
 * The direction that must not break is over-merging: a wrong keeper loses an
 * image or a description permanently from the surviving URL, and a wrongly
 * merged row disappears from the site and its sitemap.
 */
import { decide, groupKey, descLength, normalise } from '../lib/mergeDuplicateEvents.ts';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};

/** A row with everything null unless overridden, so each test states only what it means. */
const row = (over) => ({
  id: 'id',
  title: 'T',
  date: '2026-05-20T00:00:00+00:00',
  venue: 'V',
  image_url: null,
  enhanced_description: null,
  original_description: null,
  source: null,
  source_url: null,
  price: null,
  category: null,
  is_featured: null,
  is_merged: null,
  created_at: '2026-01-01T00:00:00+00:00',
  ...over,
});

console.log('the ambiguous branch - the one real data has never produced');
{
  // One row has the picture, the other has the words. This is the editorial
  // call duplicate-events-baseline.json means by "a per-group decision".
  const d = decide('k', [
    row({ id: 'has-image-aaaa', image_url: 'https://x/i.jpg', enhanced_description: 'short' }),
    row({ id: 'has-text-bbbb', enhanced_description: 'a much longer description than the other one' }),
  ]);
  check('flags a group where image and text disagree', d.ambiguous === true, d.reason);
  check('names both rows in the reason', d.reason.includes('has-imag') && d.reason.includes('has-text'), d.reason);
}
{
  // Same shape, but the image row ALSO has the better text: nothing to decide.
  const d = decide('k', [
    row({ id: 'a', image_url: 'https://x/i.jpg', enhanced_description: 'a much longer description here' }),
    row({ id: 'b', enhanced_description: 'short' }),
  ]);
  check('does NOT flag when the image row also has the best text', d.ambiguous === false, d.reason);
  check('keeps the image row', d.keeper.id === 'a');
}

console.log('\nthe keeper rule, in order');
{
  const d = decide('k', [row({ id: 'a' }), row({ id: 'b', image_url: 'https://x/i.jpg' })]);
  check('an image beats no image', d.keeper.id === 'b' && d.reason === 'only row with an image');
}
{
  const d = decide('k', [
    row({ id: 'a', enhanced_description: 'xxxxxxxxxx' }),
    row({ id: 'b', enhanced_description: 'xx' }),
  ]);
  check('longer description wins when neither has an image', d.keeper.id === 'a' && d.reason === 'longest description');
}
{
  const d = decide('k', [
    row({ id: 'younger', created_at: '2026-06-01T00:00:00+00:00' }),
    row({ id: 'older', created_at: '2026-01-01T00:00:00+00:00' }),
  ]);
  check('a tie falls back to the oldest row', d.keeper.id === 'older', d.reason);
}
{
  // TWO rows with images is not "only row with an image" - it must fall through
  // to the text rule rather than picking whichever came first.
  const d = decide('k', [
    row({ id: 'a', image_url: 'https://x/a.jpg', enhanced_description: 'short' }),
    row({ id: 'b', image_url: 'https://x/b.jpg', enhanced_description: 'much longer text here' }),
  ]);
  check('both have images: decided on text, not flagged', d.keeper.id === 'b' && d.ambiguous === false, d.reason);
}
{
  const d = decide('k', [
    row({ id: 'a', enhanced_description: 'short', original_description: 'a very much longer one' }),
    row({ id: 'b', enhanced_description: 'medium length' }),
  ]);
  check('description length takes the LONGER of the two columns', d.keeper.id === 'a', d.reason);
}

console.log('\nthe field union - merging must not lose what only the loser had');
{
  const d = decide('k', [
    row({ id: 'keep', image_url: 'https://x/i.jpg', enhanced_description: 'the longest description of them all' }),
    row({ id: 'lose', price: '$20', category: 'Music' }),
  ]);
  check('carries price and category across', d.fill.price === '$20' && d.fill.category === 'Music', JSON.stringify(d.fill));
  check('does not flag: the keeper has both the image and the text', d.ambiguous === false);
}
{
  // fill.image_url is reachable ONLY in a group of three or more, and finding
  // that out is why this file exists. With exactly one image row, that row
  // BECOMES the keeper, so no loser can be holding an image. It takes two image
  // rows plus a third with better text before the keeper lacks one.
  const d = decide('k', [
    row({ id: 'keep', enhanced_description: 'the longest description of them all' }),
    row({ id: 'lose1', image_url: 'https://x/1.jpg', enhanced_description: 'short' }),
    row({ id: 'lose2', image_url: 'https://x/2.jpg', enhanced_description: 'short' }),
  ]);
  check('keeper is the text row when two others hold images', d.keeper.id === 'keep', d.reason);
  check('carries an image across from a loser', d.fill.image_url === 'https://x/1.jpg', JSON.stringify(d.fill));
}
{
  const d = decide('k', [
    row({ id: 'keep', image_url: 'https://x/keep.jpg' }),
    row({ id: 'lose', image_url: 'https://x/lose.jpg' }),
  ]);
  check('never overwrites a field the keeper already has', d.fill.image_url === undefined, JSON.stringify(d.fill));
}
{
  // The one that would be a visible regression: an editor featured the row that
  // happens to lose, and merging silently un-features the event.
  const d = decide('k', [
    row({ id: 'keep', enhanced_description: 'the longest description of them all' }),
    row({ id: 'lose', is_featured: true }),
  ]);
  check('is_featured is OR-ed onto the keeper', d.fill.is_featured === true, JSON.stringify(d.fill));
}
{
  const d = decide('k', [
    row({ id: 'keep', is_featured: true, enhanced_description: 'the longest description of them all' }),
    row({ id: 'lose', is_featured: false }),
  ]);
  check('an already-featured keeper needs no fill', d.fill.is_featured === undefined);
}

console.log('\nlosers, and three-row groups');
{
  const d = decide('k', [
    row({ id: 'a', enhanced_description: 'xxx' }),
    row({ id: 'b', enhanced_description: 'xxxxxxxxxxxxxxxxxxxx' }),
    row({ id: 'c', enhanced_description: 'xxxxx' }),
  ]);
  check('keeps one of three', d.keeper.id === 'b');
  check('both others are losers', d.losers.length === 2 && !d.losers.some((l) => l.id === 'b'));
}

console.log('\ngroupKey must match check-duplicate-entities exactly');
{
  const a = groupKey(row({ title: "Chef George's Steak Bar", venue: "Chef George's Steak Bar" }));
  const b = groupKey(row({ title: 'Chef Georges Steak Bar', venue: 'Chef Georges Steak Bar' }));
  check('punctuation is stripped, so both spellings group together', a === b, `${a} vs ${b}`);
  check('matches the baseline key format', a.startsWith('chefgeorgessteakbar|'), a);
}
{
  // The apostrophe in "Casey's Center" appears as both ' and the curly ’ in real
  // rows, which is why normalise strips non-alphanumerics rather than trimming.
  check(
    'a curly apostrophe normalises the same as a straight one',
    normalise("Casey's Center") === normalise('Casey’s Center'),
  );
}
{
  const differentDate = groupKey(row({ date: '2026-05-21T00:00:00+00:00' }));
  const base = groupKey(row({}));
  check('a different date is a different group', differentDate !== base);
}
{
  check('descLength handles both columns null', descLength(row({})) === 0);
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
