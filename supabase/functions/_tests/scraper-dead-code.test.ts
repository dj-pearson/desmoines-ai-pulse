/**
 * The scrapers do what their responses say, and carry no unreachable code
 * (WEB-BE-046).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/scraper-dead-code.test.ts
 *
 * THREE DEFECTS, all of them invisible from the outside.
 *
 * 1. scrape-events was 2,234 lines of which 1,180 were unreachable from its
 *    handler - nineteen per-site extractors, a second date parser and a whole
 *    second scraping path, none of them called since it started delegating to
 *    firecrawl-scraper. It read as if this function scrapes sites itself.
 *
 * 2. Its handler also read every event from the last 60 days plus every future
 *    one, computed a fingerprint for each, and used the result for one log
 *    line: "Found N existing events for duplicate checking". Nothing in that
 *    function deduplicates anything. It ran every 30 minutes over 1,246+ rows.
 *
 * 3. firecrawl-scraper called generateEventSEO without await and without
 *    EdgeRuntime.waitUntil. The Supabase Edge Runtime kills pending promises
 *    when the response is returned, so every one of those Haiku requests was
 *    abandoned mid-flight - and the .catch() attached to it made it look
 *    handled.
 *
 * node:assert rather than std/assert deliberately: it needs no network.
 */

import { strict as assert } from 'node:assert';

const REPO = new URL('../../../', import.meta.url);
const read = async (rel: string) => await Deno.readTextFile(new URL(rel, REPO));
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .split('\n').map((l) => l.replace(/(?<!:)\/\/.*$/, '')).join('\n');

/**
 * Every top-level function reachable from the handler, by name. Crude on
 * purpose: a name that appears followed by "(" inside a reachable body counts.
 * It over-approximates reachability, so anything it calls dead really is.
 */
function unreachableFunctions(src: string): string[] {
  const lines = codeOnly(src).split('\n');
  const starts: { name: string; line: number }[] = [];
  lines.forEach((l, i) => {
    const m = l.match(/^(?:async )?function (\w+)/);
    if (m) starts.push({ name: m[1], line: i });
    if (/^serve\(async|^Deno\.serve\(async/.test(l)) starts.push({ name: '__handler__', line: i });
  });
  const ranges: Record<string, [number, number]> = {};
  starts.forEach((s, i) => {
    ranges[s.name] = [s.line, i + 1 < starts.length ? starts[i + 1].line : lines.length];
  });
  if (!ranges.__handler__) throw new Error('no handler found');
  const bodyOf = (n: string) => lines.slice(ranges[n][0], ranges[n][1]).join('\n');
  const names = starts.map((s) => s.name).filter((n) => n !== '__handler__');

  const reached = new Set<string>();
  const queue = ['__handler__'];
  while (queue.length) {
    const body = bodyOf(queue.pop()!);
    for (const n of names) {
      if (reached.has(n)) continue;
      if (new RegExp(`\\b${n}\\s*\\(`).test(body)) { reached.add(n); queue.push(n); }
    }
  }
  return names.filter((n) => !reached.has(n));
}

Deno.test('scrape-events has no unreachable top-level function', async () => {
  const dead = unreachableFunctions(await read('supabase/functions/scrape-events/index.ts'));
  assert.deepEqual(dead, [], `unreachable: ${dead.join(', ')}`);
});

Deno.test('firecrawl-scraper has no unreachable top-level function', async () => {
  const dead = unreachableFunctions(await read('supabase/functions/firecrawl-scraper/index.ts'));
  assert.deepEqual(dead, [], `unreachable: ${dead.join(', ')}`);
});

Deno.test('the reachability walk can actually fail', async () => {
  // A checker that cannot fire is not a checker. This is the same source with
  // one unreachable function appended.
  const src = await read('supabase/functions/scrape-events/index.ts');
  const withDead = `${src}\n\nfunction thisIsNeverCalled(): void {\n  return;\n}\n`;
  assert.deepEqual(unreachableFunctions(withDead), ['thisIsNeverCalled']);
});

Deno.test('scrape-events no longer reads 60 days of events for a log line', async () => {
  const src = codeOnly(await read('supabase/functions/scrape-events/index.ts'));
  assert.ok(!/sixtyDaysAgo/.test(src), 'the 60-day duplicate-check read is back');
  assert.ok(
    !/generateEventFingerprint/.test(src),
    'scrape-events fingerprints events again, and it deduplicates nothing',
  );
});

Deno.test('no scraper fires a promise it will not await', async () => {
  // The Edge Runtime kills pending promises when the response is returned, so
  // an un-awaited async call with a .catch() is worse than no call: it starts
  // work, abandons it, and looks handled.
  for (const fn of ['firecrawl-scraper', 'ai-crawler', 'scrape-events']) {
    const src = codeOnly(await read(`supabase/functions/${fn}/index.ts`));
    assert.ok(
      !/(?<!await )\bgenerateEventSEO\s*\(/.test(src),
      `${fn} calls generateEventSEO without awaiting it`,
    );
  }
  // And the function it used to call is gone rather than left for someone to
  // re-wire the same way.
  const firecrawl = codeOnly(await read('supabase/functions/firecrawl-scraper/index.ts'));
  assert.ok(!/function generateEventSEO/.test(firecrawl));
});

Deno.test('the batch fields report what happened', async () => {
  const src = codeOnly(await read('supabase/functions/firecrawl-scraper/index.ts'));
  // batchInfo was a const literal nothing mutated: every response said
  // processedStart 0, processedEnd 0, remainingEvents 0, nextSkipEvents null.
  assert.match(src, /processedStart,\s*\n\s*processedEnd,/, 'batchInfo must carry the computed offsets');
  assert.match(
    src,
    /remainingEvents:\s*filteredItems\.length - processedEnd/,
    'remainingEvents must be derived, not hardcoded to 0',
  );
  assert.match(
    src,
    /filteredItems\.slice\(batchInfo\.processedStart, batchInfo\.processedEnd\)/,
    'the request slice must actually be applied',
  );
});

Deno.test('the write chunk no longer shadows the request batch size', async () => {
  // `const batchSize = 10` inside the insert block shadowed the request's
  // batchSize, which is how a documented, echoed-back request field came to be
  // ignored entirely.
  const src = codeOnly(await read('supabase/functions/firecrawl-scraper/index.ts'));
  assert.ok(!/const batchSize = \d+/.test(src), 'the inner batchSize shadow is back');
  assert.match(src, /const WRITE_CHUNK = \d+/, 'the inner chunk size must have its own name');
});

Deno.test('an omitted batchSize means all items, not five', async () => {
  // DEFAULT_BATCH_SIZE was 5 and the parameter was never applied, so a scrape
  // has always written everything it extracted. Applying 5 as the default
  // while implementing the parameter would have capped every scheduled scrape
  // at five events.
  const src = codeOnly(await read('supabase/functions/firecrawl-scraper/index.ts'));
  assert.ok(!/DEFAULT_BATCH_SIZE/.test(src), 'the 5-item default cap is back');
  assert.match(
    src,
    /typeof batchSize === 'number' && batchSize > 0 \? batchSize : filteredItems\.length/,
    'an unset batchSize must mean every item',
  );
});
