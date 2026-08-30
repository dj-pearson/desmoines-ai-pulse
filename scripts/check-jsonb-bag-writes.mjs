#!/usr/bin/env node
/**
 * A shared JSONB column must be written by merging, never by replacing.
 *
 * profiles.communication_preferences carries at least five independent
 * concerns and has four writers:
 *
 *     useUserPreferences.ts       taste_preferences
 *     use-user-preferences.ts     ui_preferences
 *     PreferencesManager.tsx      email_notifications, sms_notifications,
 *                                 event_recommendations
 *     lifecycle-classifier.ts     READS marketing / email / email_notifications
 *                                 to derive messagingAllowed
 *
 * A PostgREST update of a JSONB column REPLACES the value. So a writer that
 * sends a fresh object literal deletes every key it does not know about. That
 * is not hypothetical - PreferencesManager did exactly this until 2026-08-28,
 * so pressing Save Preferences dropped taste_preferences, ui_preferences and
 * the marketing opt-out.
 *
 * THE MARKETING KEY IS WHY THIS IS A GUARD AND NOT A LINT RULE. Every consent
 * gate reads ${BT}!== false${BT}, which WEB-LEGAL-012 AC5 settles as correct: absence
 * means opted IN. Deleting an explicit false therefore opts a user back into
 * marketing mail, silently, with nothing failing anywhere.
 *
 * WEB-QA-015 already wrote the rule down - "writeToServer ABORTS if it cannot
 * read the current bag first" - and nothing enforced it. Two of the writers
 * followed it, one did not, and the story assumed there were only two.
 *
 * WHAT COUNTS AS MERGING: the object literal assigned to the column must open
 * with a spread, or the column must be assigned a variable the file built after
 * reading the column. Creation sites are exempt - an insert has no prior value
 * to preserve - so only .update() is inspected.
 *
 * BRACE-MATCHED, NOT LINE-WINDOWED, deliberately. The nearest comparable guard
 * in this repo (check-ballot-reads) read a fixed 8 lines after each call and
 * missed everything formatted differently; its own story records that. This
 * walks the actual object literal, so formatting cannot hide a violation.
 *
 *   node scripts/check-jsonb-bag-writes.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/** Shared JSONB columns: one column, several independent owners. */
const SHARED_BAGS = ['communication_preferences'];

if (!existsSync(SRC)) {
  console.error('[bag-writes] src/ not found - refusing to pass.');
  process.exit(1);
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue;
      yield* walk(full);
    } else if (/[.]tsx?$/.test(name) && name !== 'types.ts') {
      yield full;
    }
  }
}

/**
 * The source span of the object literal starting at the '{' at or after `from`.
 * Returns null when the value is not a literal (e.g. `column: bag`).
 */
function literalAt(src, from) {
  let i = from;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return null;
}

/**
 * Files that legitimately build the bag from nothing, with the reason. A
 * creation payload has no prior value to preserve.
 *
 * MATCHING ON .update() WAS NOT ENOUGH, and getting that wrong first is worth
 * recording: PreferencesManager - the writer this guard exists for - does not
 * call .update() at all. It passes a literal to updateProfile(), a helper that
 * calls .update() one file away. A guard keyed on the Supabase call would have
 * reported a clean codebase while the defect sat in the one place it was
 * written to watch. So every object literal that sets the key is inspected,
 * whatever it is passed to, and exemptions are named here rather than inferred.
 */
const CREATION_SITES = {
  'src/pages/Auth.tsx':
    'signup metadata for a profile that does not exist yet - there is no prior bag',
};

const violations = [];
let inspected = 0;

for (const file of walk(SRC)) {
    // COMMENTS ARE STRIPPED BEFORE MATCHING. useProfile.ts:16 documents the
    // key inside a docstring; the first version of this reported it as a
    // write. check-edge-auth learned the same lesson on the same repo.
    const src = readFileSync(file, 'utf8')
      .replace(/[/][*][^]*?[*][/]/g, ' ')
      .replace(/^[ \t]*[/][/].*$/gm, ' ');
  const rel = relative(ROOT, file).split(String.fromCharCode(92)).join('/');
  for (const bag of SHARED_BAGS) {
    for (const m of src.matchAll(new RegExp(bag + ':', 'g'))) {
      // The declaration in an interface or a type, not a write.
      const line = src.slice(src.lastIndexOf(String.fromCharCode(10), m.index) + 1, m.index);
      if (/[?]$|interface |type /.test(line)) continue;

      const value = literalAt(src, m.index + bag.length + 1);
      inspected++;

      if (value === null) {
        // Assigned a variable rather than a literal, so any merge happened
        // where that variable was built - which requires reading the column.
        if (!new RegExp("select\\([^)]*" + bag).test(src)) {
          violations.push([rel, bag, 'assigned a variable, and the file never selects the column']);
        }
        continue;
      }
      if (/^[{]\s*[.][.][.]/.test(value)) continue;
      if (CREATION_SITES[rel]) continue;
      violations.push([rel, bag, 'writes a fresh object literal, replacing every key it does not set']);
    }
  }
}

// A SCAN THAT INSPECTED NOTHING IS NOT A CLEAN RESULT. Several checks in this
// repo have reported success while reading zero inputs; see check-edge-types.
if (inspected === 0) {
  console.error('[bag-writes] found no update() touching a shared bag - refusing to pass on that.');
  process.exit(1);
}

console.log(`[bag-writes] ${inspected} update(s) touch a shared JSONB bag; ${violations.length} replace it.`);

if (violations.length === 0) {
  console.log('OK Every writer merges into the current value.');
  process.exit(0);
}

const SEP = String.fromCharCode(92); // no escape sequences in this file; they
                                     // have been collapsed in transit twice.
for (const [file, bag, why] of violations) {
  console.error('');
  console.error('  ' + file);
  console.error('    ' + bag + ': ' + why);
}
console.error('');
console.error('  A PostgREST update of a JSONB column REPLACES it. Read the column first');
console.error('  and spread the current value, as useUserPreferences.ts does - and fail the');
console.error('  save if that read fails, because falling back to {} IS the losing write.');
console.error('');
console.error('  Deleting profiles.communication_preferences.marketing opts a user back');
console.error('  into every nurture agent, silently: the gates read !== false.');
console.error('');
process.exit(1);
