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
 * WEB-QA-031 ADDED THE SECOND RULE, for the shape this script deliberately did
 * not attempt when it only understood the useEffect pattern.
 *
 * A TanStack page does not clear a list in a catch - there is no catch. The
 * query throws, TanStack retries, the retries run out, `data` stays undefined,
 * and the page falls through to the same empty state. It looks nothing like
 * the useEffect defect and reads identically to the visitor. About twenty
 * pages were in that state; the ones that hurt most were the ones asserting
 * something specific, like "No games scheduled for today."
 *
 * So the second rule flags a page that FETCHES (useQuery, or a hook exposing
 * isLoading), renders an empty-state SENTENCE, and mentions no failure at all -
 * no isError, no ErrorState, not even the word error. That last condition is
 * what keeps this quiet: a page that reads `error` for any reason is assumed to
 * have thought about it, and is left to a human. The rule cannot catch a page
 * that destructures `error` and ignores it, and trying to would cost more false
 * positives than the finding is worth.
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

/**
 * WEB-QA-031, the TanStack shape.
 *
 * An empty-state SENTENCE, not a bare "No results": the verb is what makes it a
 * claim about the world rather than a label. "No events found", "No trips yet",
 * "No games scheduled" - each answers the visitor's question, and a page that
 * could not load has not answered it.
 */
const EMPTY_STATE_SENTENCE =
  /(No\s+[A-Za-z][\w'\u2019 -]{2,40}?\s+(found|yet|scheduled|available|listed|selected)\b|Nothing\s+(here|yet|to show)\b)/;
/** Any acknowledgement that the fetch can fail. Deliberately generous. */
const MENTIONS_FAILURE = /isError|ErrorState|\berror\b/i;
/** Evidence the page loads something, so an empty state can be a failure at all. */
const FETCHES = /useQuery|useInfiniteQuery|isLoading/;

const silent = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (!FETCHES.test(text)) continue;
  if (MENTIONS_FAILURE.test(text)) continue;
  const match = text.match(EMPTY_STATE_SENTENCE);
  if (!match) continue;
  silent.push({
    file,
    line: text.slice(0, match.index).split('\n').length,
    text: match[0].trim(),
  });
}

if (hits.length === 0 && silent.length === 0) {
  console.log('OK No reader-facing page turns a failed fetch into an empty state.');
  process.exit(0);
}

if (silent.length > 0) {
  console.error('\nX An empty-state sentence on a page that never mentions a failure:\n');
  for (const h of silent) {
    console.error(`  ${h.file}:${h.line}`);
    console.error(`    ${h.text}`);
  }
  console.error(`
${silent.length} page(s). These fetch with TanStack, so they do at least retry -
but when the retries run out the page falls through to this sentence, which
answers the visitor's question with something the page never found out.

Destructure isError/error/refetch from the query and render
<ErrorState error={error} onRetry={() => void refetch()} /> ahead of the empty
branch. These pages already have all three to hand; they do not need
useReloadableFetch.
`);
}

if (hits.length === 0) process.exit(1);

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
