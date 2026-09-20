/**
 * Every ingestion path agrees on what "no published time" means (WEB-BE-037).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/no-time-marker.test.ts
 *
 * FOUR PATHS HAD FOUR ANSWERS. _shared/eventDateTime.ts defines
 * NO_TIME_MARKER = 19:31:58 as the sentinel; ai-crawler used 19:30:00, the
 * Python crawler 19:00:00, the Catch Des Moines adapter 19:00 and jsonLdEvents
 * 19:00. So the same event arriving through two producers got two different
 * instants, and both the fingerprint and the same-date dedup tier failed to
 * match them - the duplicates this creates are invisible in review because
 * each file is self-consistent.
 *
 * ai-crawler's private parser was worse than merely different. Its fallback
 * read `hours = fallbackDate.getHours() || 19` and
 * `minutes = fallbackDate.getMinutes() || 30`. Zero is falsy, so every
 * on-the-hour time became :30 and midnight became 7 PM - a corruption of a
 * time the source DID publish, not a default for a missing one.
 *
 * Source-text assertions rather than execution for the producers: they import
 * deno_dom and esm.sh modules that a container without network cannot resolve,
 * and the defect is a literal in the source either way.
 */

import { strict as assert } from 'node:assert';

const REPO = new URL('../../../', import.meta.url);
const read = async (rel: string) => await Deno.readTextFile(new URL(rel, REPO));

/** Comments describe the old defaults; they must not count as committing them. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*(?:\/\/|#)[^\n]*$/gm, '');

const MARKER = '19:31:58';

Deno.test('the marker is defined once, and it is an odd value', async () => {
  const src = await read('supabase/functions/_shared/eventDateTime.ts');
  assert.ok(
    src.includes(`NO_TIME_MARKER = "${MARKER}"`),
    'NO_TIME_MARKER moved or changed; every assertion below is keyed to it',
  );
  // A round value would be indistinguishable from a real showtime, which is the
  // whole reason the sentinel exists.
  assert.notEqual(MARKER.slice(3), '00:00');
});

Deno.test('ai-crawler no longer carries its own date parser', async () => {
  const src = stripComments(await read('supabase/functions/ai-crawler/index.ts'));
  assert.ok(
    !/function\s+parseEventDateTime\s*\(/.test(src),
    'ai-crawler defines parseEventDateTime again; it must import the shared one',
  );
  assert.ok(
    /import\s*\{[^}]*\bparseEventDateTime\b[^}]*\}\s*from\s*["'][^"']*_shared\/eventDateTime\.ts["']/
      .test(src),
    'ai-crawler must import parseEventDateTime from _shared/eventDateTime.ts',
  );
});

Deno.test('the shared producers carry no evening-time literal at all', async () => {
  // In these two, every clock literal WAS a default - neither has any other
  // reason to name a time - so banning the literals is exact.
  const banned = [/\b19:30:00\b/, /\b19:00:00\b/, /["']19:00["']/];

  for (const rel of [
    'supabase/functions/_shared/jsonLdEvents.ts',
    'supabase/functions/_shared/domain-adapters/catchdesmoines.ts',
  ]) {
    const src = stripComments(await read(rel));
    for (const re of banned) {
      assert.ok(!re.test(src), `${rel} still defaults a missing time (${re})`);
    }
  }
});

Deno.test('ai-crawler does not INSTRUCT the model to invent a time', async () => {
  // THE FIFTH SITE, and the one that produces most of the rows. The story lists
  // five code defaults and misses these: the extraction prompts told Claude
  // "No time? Default to 19:00:00" and "No specific time? -> default to 7:00 PM
  // Central". Fixing the parser is pointless while the model is asked to fill
  // the gap first - what arrives is a full timestamp the parser must believe.
  //
  // A literal ban is wrong here: "7:00 PM" -> "19:00:00" is a CORRECT example
  // of converting a published time. What must not come back is the defaulting
  // instruction.
  const src = stripComments(await read('supabase/functions/ai-crawler/index.ts'));

  assert.ok(
    !/No time\?\s*Default to/i.test(src),
    'the prompt tells the model to default a missing time again',
  );
  assert.ok(
    !/No specific time\?.*default to/i.test(src),
    'the prompt tells the model to default a missing time again',
  );
  assert.ok(
    !/\bAll-day events\s*→\s*use\b/i.test(src),
    'the prompt assigns all-day events a clock time again',
  );
  assert.ok(
    /DATE ONLY/.test(src),
    'the prompt must tell the model to return the date alone when no time is published',
  );
});

Deno.test('the Python crawler writes the same marker', async () => {
  // It cannot import the TS constant, so it carries the literal with a comment
  // pointing at the source of truth. This is what keeps the two in step.
  const src = await read('crawlers/catchdesmoines_crawler.py');
  const code = stripComments(src);

  assert.ok(
    /hour=19,\s*minute=31,\s*second=58/.test(code),
    'crawlers/catchdesmoines_crawler.py no longer stamps NO_TIME_MARKER for a date-only value',
  );
  assert.ok(
    !/minute=0,\s*second=0\)\s*$/m.test(code),
    'the Python crawler is back to an invented 7 PM',
  );
  // The comment naming the TS constant is load-bearing: it is the only link
  // between the two files.
  assert.ok(
    src.includes('eventDateTime.ts'),
    'the Python marker must point at _shared/eventDateTime.ts, or nothing keeps them in step',
  );
});

Deno.test('the adapter hands a date-only value straight through', async () => {
  // Emitting the date alone is what lets the shared parser stamp the marker.
  // Emitting "<date> 19:00:00" instead would parse as a real showtime.
  const src = stripComments(
    await read('supabase/functions/_shared/domain-adapters/catchdesmoines.ts'),
  );
  assert.ok(
    /if\s*\(m\[2\]\s*===\s*undefined\)\s*return\s+date;/.test(src),
    'the adapter must return the bare date when schema.org gave no time',
  );
});

Deno.test('the || 19 / || 30 corruption is gone', async () => {
  // getHours() || 19 turns midnight into 7 PM; getMinutes() || 30 turns every
  // on-the-hour time into :30. Neither is a default - both rewrite a time the
  // source published.
  const src = stripComments(await read('supabase/functions/ai-crawler/index.ts'));
  assert.ok(!/getHours\(\)\s*\|\|/.test(src), 'getHours() || N is back');
  assert.ok(!/getMinutes\(\)\s*\|\|/.test(src), 'getMinutes() || N is back');
});
