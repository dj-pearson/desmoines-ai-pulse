/**
 * Crisis floor on the public AI surfaces (WEB-LEGAL-005).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/crisis-support.test.ts
 *
 * Two jobs. First, pin the matcher in BOTH directions: the "must not match"
 * cases matter as much as the "must match" ones, because this is a city guide
 * where people write "killer tacos" and "dying to try this place" in ordinary
 * use, and a crisis card thrown at those is both wrong and the reason someone
 * would switch the feature off.
 *
 * Second, assert structurally that every surface checks for crisis BEFORE it
 * calls the model. That ordering is the whole design: discover-chat forces its
 * output through the return_picks tool, so a model-authored safety reply has no
 * channel to reach the user. A test that only exercised detectCrisisIntent()
 * would pass even if someone moved the call site below the model.
 */

import {
  assertEquals,
  assert,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  detectCrisisIntent,
  conversationHasCrisisIntent,
  crisisMessageText,
  crisisPayload,
  CRISIS_RESOURCES,
} from '../_shared/crisisSupport.ts';

const read = (rel: string) => Deno.readTextFile(new URL(rel, import.meta.url));

// -----------------------------------------------------------------------------
// The matcher
// -----------------------------------------------------------------------------

const MUST_MATCH = [
  'i want to kill myself',
  'I have been thinking about killing myself',
  'i want to die',
  'i wanna die',
  'thinking about ending my life',
  'i want to take my own life',
  "i'm suicidal",
  'how do i commit suicide',
  'i want to hurt myself',
  'i keep cutting myself',
  'self-harm',
  'i self harm sometimes',
  "i don't want to live anymore",
  'there is no reason to live',
  'everyone would be better off dead without me',
  'I just want it all to end',
];

const MUST_NOT_MATCH = [
  // Ordinary hyperbole this product sees constantly.
  'where can i get killer tacos',
  "i'm dying to try that new place",
  'this line is killing me, any faster options',
  'the drive is murder on a friday',
  'i could die happy after that brisket',
  'best places to kill time downtown',
  'my phone is dead, any spots with outlets',
  'dead end trail or loop?',
  // Nearby but not first-person intent.
  'is there a suicide prevention walk this weekend',
  'the movie Suicide Squad showtimes',
  'my friend works at a crisis center, any events nearby',
  // Empty-ish.
  '',
  '   ',
];

Deno.test('matches explicit first-person crisis intent', () => {
  const missed = MUST_MATCH.filter((t) => !detectCrisisIntent(t));
  assertEquals(missed, [], `these should have matched: ${missed.join(' | ')}`);
});

Deno.test('does not fire on ordinary city-guide hyperbole', () => {
  const wrong = MUST_NOT_MATCH.filter((t) => detectCrisisIntent(t));
  assertEquals(
    wrong,
    [],
    `false positives interrupt normal use and are why this matcher stays narrow: ${wrong.join(' | ')}`,
  );
});

Deno.test('non-string input is safe', () => {
  for (const junk of [null, undefined, 42, {}, [], true]) {
    assertEquals(detectCrisisIntent(junk), false);
  }
});

Deno.test('only the user turns are examined', () => {
  assert(
    conversationHasCrisisIntent([
      { role: 'assistant', content: 'tell me if you want to die of laughter' },
      { role: 'user', content: 'i want to kill myself' },
    ]),
  );
  // An assistant turn alone must not trigger it.
  assertEquals(
    conversationHasCrisisIntent([
      { role: 'assistant', content: 'i want to kill myself' },
    ]),
    false,
  );
  assertEquals(conversationHasCrisisIntent('not an array'), false);
  assertEquals(conversationHasCrisisIntent([null, 3, 'x']), false);
});

// -----------------------------------------------------------------------------
// The response
// -----------------------------------------------------------------------------

Deno.test('the response carries real, reachable resources', () => {
  const text = crisisMessageText();
  assert(text.includes('988'), '988 Suicide & Crisis Lifeline must be present');
  assert(text.includes('741741'), 'Crisis Text Line must be present');
  assert(text.includes('911'), 'emergency services must be present');
  assertEquals(crisisPayload().crisis, true);
  assertEquals(crisisPayload().resources.length, CRISIS_RESOURCES.length);
  for (const r of CRISIS_RESOURCES) {
    assert(r.name && r.contact && r.description, 'every resource needs all three fields');
  }
});

// -----------------------------------------------------------------------------
// Ordering: the check must precede the model call on every surface
// -----------------------------------------------------------------------------

const SURFACES: { file: string; check: RegExp; model: RegExp; label: string }[] = [
  {
    label: 'discover-chat',
    file: '../discover-chat/index.ts',
    check: /conversationHasCrisisIntent\(/,
    model: /await runClaudeLoop\(/,
  },
  {
    label: 'support-chat',
    file: '../support-chat/index.ts',
    check: /detectCrisisIntent\(/,
    model: /runAgent\(/,
  },
  {
    label: 'generate-itinerary',
    file: '../generate-itinerary/index.ts',
    check: /detectCrisisIntent\(/,
    model: /buildClaudeRequest\(|api\.anthropic\.com/,
  },
  {
    label: 'support-responder',
    file: '../_shared/agents/support-responder.ts',
    check: /detectCrisisIntent\(/,
    model: /retrieveKb\(/,
  },
];

for (const s of SURFACES) {
  Deno.test(`${s.label} checks for crisis before reaching the model`, async () => {
    const src = await read(s.file);
    const checkAt = src.search(s.check);
    const modelAt = src.search(s.model);
    assert(checkAt !== -1, `${s.label} has no crisis check at all`);
    assert(modelAt !== -1, `${s.label}: model call pattern not found, update this test`);
    assert(
      checkAt < modelAt,
      `${s.label} calls the model at ${modelAt} before checking for crisis at ${checkAt}. ` +
        `The check must short-circuit, not run alongside.`,
    );
  });
}

/** The crisis `if` block, bounded by brace matching rather than a fixed slice. */
function crisisBlock(src: string, checkAt: number): string {
  const open = src.indexOf('{', checkAt);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

Deno.test('the crisis path does not log or store the triggering message', async () => {
  for (const s of SURFACES) {
    const src = await read(s.file);
    const block = crisisBlock(src, src.search(s.check));
    assert(block.length > 0, `${s.label}: could not locate the crisis branch`);
    for (const forbidden of ['console.log(', 'console.warn(', 'console.error(']) {
      assert(
        !block.includes(forbidden),
        `${s.label} calls ${forbidden} inside the crisis branch. The triggering ` +
          `message is sensitive and has no retention basis.`,
      );
    }
  }
});
