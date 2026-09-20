/**
 * Plans the weekly Dependency Update Agent's batch.
 *
 * Reads `npm outdated --json` on stdin (or from --file) and splits it three
 * ways: non-breaking bumps to apply, majors to escalate, and packages held
 * back by .github/dependency-update-holds.json.
 *
 * THIS WAS INLINE IN .github/workflows/dependency-update.yml AND WRONG IN TWO
 * WAYS FOR TEN WEEKS. Every run from 2026-07-13 to 2026-09-14 installed the
 * batch, failed `npm run validate`, opened no PR, and reported SUCCESS, because
 * the only thing the failure path did was echo a `::warning::`. The single
 * error behind all ten was scripts/event-datetime-sql-generator.ts TS2589 under
 * @supabase/supabase-js 2.85+, so one package blocked sixty (WEB-QUAL-011).
 *
 * Extracted here so the selection rules have a test. A rule that lives in a
 * YAML heredoc gets exercised once a week, in production, with no assertion.
 *
 *   node scripts/plan-dep-updates.mjs --file outdated.json --out-dir .
 */
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_HOLD_FILE = '.github/dependency-update-holds.json';

/** Numeric compare of two semver-ish strings; range prefixes are stripped. */
export function compareVersions(a, b) {
  const pa = String(a).replace(/^[^\d]*/, '').split('.').map(Number);
  const pb = String(b).replace(/^[^\d]*/, '').split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

const majorOf = (v) => String(v || '').replace(/^[^\d]*/, '').split('.')[0];

/**
 * @param {object} outdated  parsed `npm outdated --json`
 * @param {Array}  holds     entries from dependency-update-holds.json
 * @returns {{nonBreaking: Array, majors: Array, held: Array}}
 */
export function planUpdates(outdated, holds = []) {
  const nonBreaking = [];
  const majors = [];
  const held = [];

  // `firstBadVersion` is the earliest version known to fail the gate, so a
  // hold blocks that version and everything after it and NOT the patch
  // releases below it. A hold with no `firstBadVersion` blocks the package
  // outright. Holds do not expire on their own - `review` says when somebody
  // has to look again, and the test asserts every entry carries one, because a
  // pin with no date is how a temporary hold becomes permanent.
  const holdFor = (name, target) =>
    holds.find((h) => h.name === name && (!h.firstBadVersion || compareVersions(target, h.firstBadVersion) >= 0));

  for (const [name, info] of Object.entries(outdated || {})) {
    const cur = info?.current;
    const latest = info?.latest;
    if (!cur || !latest) continue;

    if (majorOf(cur) !== majorOf(latest)) {
      majors.push({ name, current: cur, latest });
      continue;
    }

    const target = info.wanted || latest;
    // npm publishes deprecation stubs BELOW the installed version for some
    // packages - @types/dompurify's `latest` is 3.0.5 against an installed
    // 3.2.0 - so `latest` is not always forward. Never move backwards.
    if (compareVersions(target, cur) <= 0) continue;

    const hold = holdFor(name, target);
    if (hold) {
      held.push({ name, target, reason: hold.reason, story: hold.story ?? null });
      continue;
    }
    nonBreaking.push({ name, wanted: target });
  }

  return { nonBreaking, majors, held };
}

export function loadHolds(file = DEFAULT_HOLD_FILE) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8')).holds || [];
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  const args = process.argv.slice(2);
  const arg = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const file = arg('--file', null);
  const outDir = arg('--out-dir', '.');
  const holdFile = arg('--holds', DEFAULT_HOLD_FILE);

  const raw = file ? fs.readFileSync(file, 'utf8') : readStdin();
  let outdated = {};
  try {
    outdated = JSON.parse(raw || '{}');
  } catch {
    // `npm outdated` writes nothing when everything is current.
    outdated = {};
  }

  const priority = new Set(JSON.parse(process.env.PRIORITY || '[]'));
  const { nonBreaking, majors, held } = planUpdates(outdated, loadHolds(holdFile));

  // Security-affected packages first, so a batch that has to be trimmed keeps them.
  nonBreaking.sort((a, b) => (priority.has(b.name) ? 1 : 0) - (priority.has(a.name) ? 1 : 0));

  fs.writeFileSync(path.join(outDir, 'nonbreaking.json'), JSON.stringify(nonBreaking));
  fs.writeFileSync(path.join(outDir, 'majors.json'), JSON.stringify(majors));
  fs.writeFileSync(path.join(outDir, 'held.json'), JSON.stringify(held));

  for (const h of held) {
    console.log(`held: ${h.name} -> ${h.target}${h.story ? ` (${h.story})` : ''} :: ${h.reason}`);
  }
  console.log(`non-breaking=${nonBreaking.length} majors=${majors.length} held=${held.length}`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]).endsWith('plan-dep-updates.mjs');
if (invokedDirectly) main();
