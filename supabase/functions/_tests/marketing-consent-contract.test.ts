/**
 * The marketing opt-out has to be read from the key the clients write
 * (WEB-LEGAL-012).
 *
 * Every nurture, re-engagement, churn, milestone and onboarding sender gates on
 * `profiles.lifecycle_signals.messagingAllowed`, and exactly one place computes
 * it: the lifecycle classifier. It read `communication_preferences.marketing`
 * and `.email`. The web clients write `email_notifications`,
 * `sms_notifications` and `event_recommendations`. Neither of the two keys the
 * classifier read has ever been written by anything in this repo, so both were
 * undefined on every profile, `undefined !== false` was true, and every user was
 * permanently opted in - a stored opt-out that no sender could see.
 *
 * Nothing else catches that. The types are `unknown` on both sides, so it
 * compiles; the field is optional, so a missing key is indistinguishable from
 * consent; and all the tables involved are empty, so no data contradicts it.
 * These assertions compare the writer and the reader directly, which is the
 * comparison that was missing.
 *
 * Offline: reads sources, runs no code, needs no credentials.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const read = (p: string) => Deno.readTextFileSync(new URL(p, import.meta.url));

const CLASSIFIERS = [
  '../_shared/agents/lifecycle-classifier.ts',
  '../agent-lifecycle/index.ts',
];
const WRITERS = [
  '../../../src/pages/Auth.tsx',
  '../../../src/components/PreferencesManager.tsx',
];

/** The keys a source assigns inside a `communication_preferences: { ... }` literal. */
function keysWritten(src: string): Set<string> {
  const keys = new Set<string>();
  const re = /communication_preferences:\s*\{([\s\S]*?)\}/g;
  for (const m of src.matchAll(re)) {
    for (const k of m[1].matchAll(/^\s*([a-z_][a-z0-9_]*)\s*:/gim)) keys.add(k[1]);
  }
  return keys;
}

/** The `commPref.<key>` reads in a classifier's messagingAllowed expression. */
function keysRead(src: string): Set<string> {
  const start = src.indexOf('const messagingAllowed =');
  assert(start !== -1, 'messagingAllowed is not computed in this file any more');
  const expr = src.slice(start, src.indexOf(';', start));
  return new Set([...expr.matchAll(/commPref\.([a-z_][a-z0-9_]*)/gi)].map((m) => m[1]));
}

Deno.test('the clients still write an email-channel preference', () => {
  const written = new Set<string>();
  for (const f of WRITERS) for (const k of keysWritten(read(f))) written.add(k);
  assert(written.size > 0, 'no communication_preferences literal found in any client');
  assert(
    written.has('email_notifications'),
    `clients write ${[...written].join(', ')} - none of which is email_notifications. ` +
      'If the key was renamed, rename it in the classifier in the same release.',
  );
});

Deno.test('the classifier reads the key the clients write', () => {
  const written = new Set<string>();
  for (const f of WRITERS) for (const k of keysWritten(read(f))) written.add(k);
  for (const f of CLASSIFIERS) {
    const reads = keysRead(read(f));
    const overlap = [...reads].filter((k) => written.has(k));
    assert(
      overlap.length > 0,
      `${f} derives messagingAllowed from ${[...reads].join(', ')}, and the clients write ` +
        `${[...written].join(', ')}. No key is common to both, so a stored opt-out is invisible ` +
        'to every sender (WEB-LEGAL-012).',
    );
  }
});

Deno.test('absence of the preference still means opted in', () => {
  // AC5: only an explicit false stops mail. A truthiness test would silently
  // opt out every profile that has never touched the setting.
  for (const f of CLASSIFIERS) {
    const src = read(f);
    const start = src.indexOf('const messagingAllowed =');
    const expr = src.slice(start, src.indexOf(';', start));
    for (const m of expr.matchAll(/commPref\.([a-z_][a-z0-9_]*)\s*(!==|===|\))/gi)) {
      assertEquals(
        m[2],
        '!==',
        `${f} tests commPref.${m[1]} with ${m[2]}; it must be \`!== false\` so a missing ` +
          'preference keeps meaning opted in (WEB-LEGAL-012 AC5).',
      );
    }
  }
});

Deno.test('the two copies of the classifier agree', () => {
  // agent-lifecycle/index.ts and _shared/agents/lifecycle-classifier.ts carry
  // the same logic. WEB-QA-017 recorded that this duplication has already
  // doubled one defect; a consent gate is a bad place for the copies to drift.
  const [a, b] = CLASSIFIERS.map((f) => [...keysRead(read(f))].sort().join(','));
  assertEquals(a, b, 'the two lifecycle classifiers derive messagingAllowed from different keys');
});
