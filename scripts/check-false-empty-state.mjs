#!/usr/bin/env node
/**
 * WEB-QA-030. A failed fetch must not render as "there is nothing here".
 *
 * Seven SEO landing pages fetched in a useEffect and, on failure, logged the
 * error and set the list to []. The visitor was then shown "No Events
 * Scheduled for Today" - a confident answer to a question the page could not
 * answer. Unlike the TanStack hubs these pages get no retries either, so the
 * false empty state stood until the visitor reloaded.
 *
 * This flags a page that clears its list inside a catch or an error branch
 * without also recording the failure. The fix is useReloadableFetch +
 * <ErrorState error={...} onRetry={...} /> from @/components/ui/error-state,
 * so the failure and the genuine empty result are different states and the
 * failure has a way out that is not a page reload.
 *
 * Reader-facing pages only. Admin screens are excluded; staff can read a log.
 *
 * Usage: node scripts/check-false-empty-state.mjs
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const EXCLUDE = /(^|\/)(admin|cms|crm)\/|src\/pages\/Admin|src\/pages\/CMS|src\/pages\/Campaign|Manager\.tsx$|__tests__/;

const files = execSync("git ls-files 'src/pages/*.tsx' 'src/pseo/**/*.tsx'", { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => !EXCLUDE.test(f));

const CLEARS = /^\s*set[A-Z]\w*\(\[\]\);\s*$/;
const RECORDS_FAILURE = /setLoadError|setError\(|setHasError|ErrorState/;
// A `catch (` or a supabase `if (error) {` opens a failure block.
const OPENS_FAILURE = /^\s*(\}\s*)?catch\s*\(|^\s*if\s*\(error\)\s*\{/;

const hits = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (RECORDS_FAILURE.test(text)) continue;
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (!CLEARS.test(line)) return;
    // look back a few lines for the opening of a failure block
    for (let j = Math.max(0, i - 4); j < i; j++) {
      if (OPENS_FAILURE.test(lines[j])) {
        hits.push({ file, line: i + 1, text: line.trim(), why: lines[j].trim() });
        break;
      }
    }
  });
}

if (hits.length === 0) {
  console.log('OK No reader-facing page turns a failed fetch into an empty state.');
  process.exit(0);
}

console.error('\nX A failed fetch renders as "nothing here":\n');
for (const h of hits) {
  console.error(`  ${h.file}:${h.line}`);
  console.error(`    ${h.why}`);
  console.error(`    ${h.text}`);
}
console.error(`
${hits.length} occurrence(s). Clearing the list inside a failure block tells the
visitor there is nothing on, when the truth is the page could not find out.

Use useReloadableFetch from @/hooks/useReloadableFetch and render
<ErrorState error={loadError} onRetry={retry} /> ahead of the empty state, so
a failure is distinguishable from an empty result and has a Retry that is not
a page reload.
`);
process.exit(1);
