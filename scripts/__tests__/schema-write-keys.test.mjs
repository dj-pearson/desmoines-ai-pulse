#!/usr/bin/env node
/**
 * The write-key parser in check-schema-usage.mjs (WEB-QA-017).
 *
 *   npx tsx scripts/__tests__/schema-write-keys.test.mjs
 *
 * This parser reads the object literal passed to .insert()/.update()/.upsert()
 * so a write naming a column the table does not have is reported. Before it
 * existed the checker read selects and filter arguments only, and nine dead
 * writes lived in that gap - including one that took the content queue's whole
 * publish with it (WEB-QUAL-015).
 *
 * MOST OF THESE CASES ARE FALSE POSITIVES, deliberately. The first draft read
 * `word:` anywhere at depth 1 and so read VALUES as keys: it turned 193
 * findings into 975, reporting `string` from `x as string`, `nowIso` from a
 * variable value, and `true` from a boolean. A checker that cries wolf 5x is a
 * checker somebody baselines into silence.
 */
import { writeKeys } from '../check-schema-usage.mjs';

let failures = 0;
const keys = (src) => writeKeys(src).map((k) => k.key);
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`);
  }
};
const same = (name, src, expected) => {
  const got = keys(src);
  check(name, JSON.stringify(got) === JSON.stringify(expected), `got ${JSON.stringify(got)}, want ${JSON.stringify(expected)}`);
};

console.log('[schema-write-keys] parser');

// --- what it must find ----------------------------------------------------
same('a plain insert', `.insert({ event_id: eventId, user_id: user.id })`, ['event_id', 'user_id']);
same('an update', `.update({ status: 'published' })`, ['status']);
same('quoted keys', `.insert({ 'event_id': a, "user_id": b })`, ['event_id', 'user_id']);
same('shorthand', `.insert({ id, name })`, ['id', 'name']);
same('an array of rows', `.insert([{ a: 1 }, { b: 2 }])`, ['a', 'b']);
same('several writes in one segment', `.update({ a: 1 }).eq('x', 1) .insert({ b: 2 })`, ['a', 'b']);

// --- what it must NOT find ------------------------------------------------
// Values read as keys is the failure mode that produced 975 findings.
same('a cast value is not a key', `.update({ status: "x", pi: session.payment_intent as string })`, ['status', 'pi']);
same('an identifier value is not a key', `.update({ broken: false, checked_at: nowIso })`, ['broken', 'checked_at']);
same('a boolean value is not a key', `.update({ a: true, b: false })`, ['a', 'b']);
same('a nested object contributes only its own key', `.insert({ confidence: { cuisine: 0.5 } })`, ['confidence']);
same('a call in a value does not leak', `.insert({ at: new Date().toISOString(), id: f({ x: 1 }) })`, ['at', 'id']);
same('a ternary value does not leak', `.update({ a: cond ? yes : no })`, ['a']);
same('a template literal value does not leak', `.insert({ a: \`x: \${y}\` })`, ['a']);
same('a string value containing a colon does not leak', `.insert({ a: "type: nlp" })`, ['a']);
same('a non-literal argument yields nothing', `.insert(payload)`, []);
same('a variable in an array yields nothing', `.insert([payload])`, []);
same('upsert options are not row keys', `.upsert({ session_id: s }, { onConflict: 'session_id' })`, ['session_id']);

// A computed key cannot be resolved, so it must be reported as nothing rather
// than as the literal text. The keys beside it are still real claims.
same('a computed key is skipped, its siblings are not', ".insert({ [`preferred_${c}s`]: v, user_id: u })", ['user_id']);
same('a spread is skipped, its siblings are not', `.insert({ ...rest, user_id: u })`, ['user_id']);

// --- it must be reachable from the real checker ---------------------------
check('writeKeys is exported', typeof writeKeys === 'function');

if (failures > 0) {
  console.error(`[schema-write-keys] ${failures} failure(s)`);
  process.exit(1);
}
console.log('[schema-write-keys] all checks passed');
