/**
 * Generated copy may only contain facts it was given (WEB-BE-053).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/writeup-grounding.test.ts
 *
 * WHAT THIS IS PROTECTING. bulk-enhance-events told the model, in capitals, to
 * "ADD STATISTICS: Include quantifiable data (attendance, years running, venue
 * capacity)" and "INCLUDE QUOTES/CITATIONS: Reference sources like 'According
 * to Des Moines Register...'" - while giving it five fields: title,
 * description, venue, date, category. None of those contains a number, a
 * founding year or a quote, so everything the model produced under those two
 * instructions was invented, and invented ATTRIBUTED, to a named newspaper.
 *
 * It went into ai_writeup, which renders on a public page AND is fed to
 * generate-seo-content, which turns it into geo_key_facts and FAQ answers. One
 * fabricated sentence became three published claims.
 *
 * THE WORKED EXAMPLE WAS THE STRONGEST INSTRUCTION IN THE PROMPT, and it
 * demonstrated five fabrications in six sentences: "Established in 1975",
 * "over 20,000 visitors weekly", "According to Des Moines Tourism", "300+
 * vendors", and a quote from "the market director". A test that only checked
 * the instructions would have missed it, so the assertions below read the
 * whole rendered prompt.
 *
 * node:assert rather than std/assert deliberately: it needs no network.
 */

import { strict as assert } from 'node:assert';
import { buildEnhancePrompt, FORBIDDEN_WRITEUP_PATTERNS } from '../bulk-enhance-events/prompt.ts';
import {
  createEventSEOPrompt,
  createRestaurantSEOPrompt,
} from '../generate-seo-content/prompts.ts';

const EVENTS = [
  {
    id: 'e1',
    title: 'Winter Market at Capital Square',
    original_description: 'Local vendors, handmade goods, food',
    location: 'Des Moines, IA',
    venue: 'Capital Square',
    category: 'Markets',
    date: '2025-12-06T15:00:00.000Z',
    source_url: 'https://example.com/winter-market',
  },
  {
    id: 'e2',
    title: 'A Sparse Event',
    location: null,
    venue: null,
    category: null,
    date: '2025-12-07T01:00:00.000Z',
  },
];

const PROMPT = buildEnhancePrompt(EVENTS, new Date('2025-11-01T12:00:00Z'));

Deno.test('the prompt no longer asks for statistics it was not given', () => {
  assert.ok(!/ADDS? STATISTICS/i.test(PROMPT));
  assert.ok(!/attendance figures/i.test(PROMPT.replace(/MUST NOT[\s\S]*?LEAVE IT OUT/i, '')));
  assert.ok(!/years running/i.test(PROMPT.replace(/MUST NOT[\s\S]*?LEAVE IT OUT/i, '')));
});

Deno.test('the prompt no longer asks for quotes or citations', () => {
  assert.ok(!/QUOTATION METHOD/i.test(PROMPT));
  assert.ok(!/CITE SOURCES METHOD/i.test(PROMPT));
  assert.ok(!/INCLUDES QUOTES/i.test(PROMPT));
});

Deno.test('no attribution phrase survives outside the prohibition', () => {
  // The phrases are allowed to appear ONCE each, in the list of things not to
  // write. Anywhere else - an instruction, an example - is the defect.
  const banned = PROMPT.slice(0, PROMPT.indexOf('If the data does not contain something'));
  const rest = PROMPT.slice(PROMPT.indexOf('If the data does not contain something'));
  for (const re of FORBIDDEN_WRITEUP_PATTERNS) {
    assert.ok(re.test(banned), `${re} should be named in the prohibition`);
    assert.ok(
      !re.test(rest),
      `${re} appears after the prohibition - an example or instruction is re-teaching it`,
    );
  }
});

Deno.test('the worked example demonstrates omission, not invention', () => {
  const example = PROMPT.slice(PROMPT.indexOf('EXAMPLE OF THE RIGHT SHAPE'));
  assert.ok(example.length > 200, 'the prompt must still carry a worked example');
  // The five fabrications the old example modelled.
  assert.ok(!/Established in \d{4}/i.test(example));
  assert.ok(!/\b\d{1,3},\d{3}\s+(visitors|attendees)/i.test(example));
  assert.ok(!/\d+\+\s+vendors/i.test(example));
  assert.ok(!/According to/i.test(example));
  assert.ok(!/["'][^"']{10,}["'],?\s*(notes|says|said)\b/i.test(example));
  // And it says out loud what it left out.
  assert.match(example, /Notice what it does NOT say/i);
});

Deno.test('the rule is stated before the writing instructions, not after', () => {
  // A constraint that arrives after the task description competes with it.
  const ruleAt = PROMPT.indexOf('THE ONE RULE THAT OVERRIDES EVERYTHING');
  const taskAt = PROMPT.indexOf('WHAT TO WRITE INSTEAD');
  assert.ok(ruleAt > 0 && taskAt > ruleAt, 'the grounding rule must come first');
});

Deno.test('a shorter writeup is stated to be the correct answer', () => {
  // Without this the model pads to the word count, and padding is invention.
  assert.match(PROMPT, /Shorter is correct when the source is thin/i);
  assert.match(PROMPT, /LEAVE IT OUT/);
});

Deno.test('every event reaches the prompt with its own source text', () => {
  assert.match(PROMPT, /EVENT e1/);
  assert.match(PROMPT, /EVENT e2/);
  assert.match(PROMPT, /Local vendors, handmade goods, food/);
  // A missing description is named as missing rather than silently blank, so
  // the model cannot read an empty line as room to improvise.
  assert.match(PROMPT, /NONE - the source gave no description/);
  assert.match(PROMPT, /Return one entry for each of the 2 events/);
});

Deno.test('the SEO prompts carry the same grounding rule', () => {
  // ai_writeup is an input to both, so a fabricated writeup becomes a
  // fabricated keyFact and a fabricated FAQ answer.
  for (const prompt of [
    createEventSEOPrompt({ title: 'X', location: 'Des Moines, IA', date: '2025-12-06', category: 'Markets' }),
    createRestaurantSEOPrompt({ name: 'Y', cuisine: 'Thai', location: 'Des Moines, IA' }),
  ]) {
    assert.match(prompt, /GROUNDING RULE/);
    assert.match(prompt, /Do not invent attendance figures/);
    assert.match(prompt, /do not attribute anything to a publication or a person/);
    assert.match(prompt, /FEWER IS CORRECT/);
    // "Fact 1, Fact 2, Fact 3, Fact 4" read as four slots to fill.
    assert.ok(
      !/"Fact 1", "Fact 2", "Fact 3", "Fact 4"/.test(prompt),
      'keyFacts must not be presented as four slots to fill',
    );
  }
});
