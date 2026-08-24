/**
 * Every workflow file must be ONE parseable YAML document (WEB-CI-027).
 *
 * WHY THIS SPECIFIC SHAPE. On 2026-08-11 release-notes.yml inlined a PR body as
 * `--body "$(cat release-notes.md) ... ---"`, which put a bare `---` at column 1.
 * YAML reads that as a document separator, so the file became two documents and
 * the workflow would not parse. A workflow that fails to PARSE does not skip -
 * it produces a startup_failure run on every push, regardless of its trigger.
 * That is why the failed run shows `event: push` on `main` while the file's push
 * trigger is `release/**`: the trigger was never evaluated. It stayed broken for
 * three days and was fixed in afd9b5e1.
 *
 * A startup_failure is nearly invisible in review. It is not a failing step, no
 * job log explains it, and the workflow still appears in the run list - so the
 * usual "which step went red" reflex finds nothing to read.
 *
 * TWO CHECKS, and the cheap one is the load-bearing one:
 *  1. No line is exactly `---` after the first. Inside a block scalar (`run: |`)
 *     real content is INDENTED, so a column-0 `---` is unambiguous - it cannot be
 *     legitimate workflow content. Dependency-free, so it always runs.
 *  2. A full parse when js-yaml resolves. It is only a TRANSITIVE dependency
 *     here, so this half is skipped rather than failed when it is absent - a
 *     check that breaks on someone else's dependency tree is worse than one that
 *     narrows.
 *
 *   node scripts/check-workflow-yaml.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, '.github', 'workflows');

if (!existsSync(DIR)) {
  console.error('[workflow-yaml] .github/workflows is missing - refusing to pass.');
  process.exit(1);
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
if (files.length === 0) {
  console.error('[workflow-yaml] no workflow files found - refusing to pass.');
  process.exit(1);
}

let yaml = null;
try {
  yaml = createRequire(import.meta.url)('js-yaml');
} catch {
  // Transitive-only; the column-0 check below still runs.
}

const problems = [];
for (const file of files) {
  const text = readFileSync(join(DIR, file), 'utf8');
  const lines = text.split(/\r?\n/);

  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trimEnd() === '---') {
      problems.push(
        `${file}:${i + 1} a bare '---' at column 1 splits this into two YAML documents. ` +
          'Move the text into a file and use --body-file, or indent it inside the block scalar.',
      );
    }
  }

  if (yaml) {
    try {
      const docs = yaml.loadAll(text);
      if (docs.length !== 1) problems.push(`${file}: parses as ${docs.length} YAML documents, expected 1.`);
      else if (!docs[0] || typeof docs[0] !== 'object' || !('jobs' in docs[0])) {
        problems.push(`${file}: parsed but has no top-level 'jobs' key.`);
      }
    } catch (error) {
      problems.push(`${file}: does not parse - ${String(error.message).split('\n')[0]}`);
    }
  }
}

console.log(
  `[workflow-yaml] ${files.length} workflow file(s) checked${yaml ? ' (full parse)' : ' (separator check only - js-yaml not resolvable)'}.`,
);

if (problems.length > 0) {
  console.error('\nX workflow YAML problems:');
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    '\n  A workflow that fails to parse does not skip - it produces a startup_failure\n' +
      '  run on every push, with no failing step to read. See WEB-CI-027.\n',
  );
  process.exit(1);
}

console.log('\nOK Every workflow is a single parseable document with a jobs key.');
process.exit(0);
