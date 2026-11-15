#!/usr/bin/env node
/**
 * public/openapi.yaml against what api-events actually serves (WEB-FEAT-081).
 *
 *   npx tsx scripts/__tests__/openapi-api-events.test.mjs
 *
 * openapi.yaml is the contract ai-plugin.json and llms.txt point AI clients
 * at. WEB-FEAT-078 changed api-events (Central-time days, a running arm, a new
 * end_date field) and the description stayed as it was: no end_date in the
 * Event schema, start_date documented as a plain lower bound, `date` typed as a
 * calendar date when the column is a timestamptz, `time` shown as "7:00 PM"
 * when the code returns 24-hour HH:MM. Nothing compared the two, so these do.
 *
 * The YAML is read line by line rather than through js-yaml, which is only a
 * transitive dependency here. The file is hand-written with fixed two-space
 * indentation, and every extractor below fails loudly if it finds nothing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPEC = readFileSync(join(ROOT, 'public/openapi.yaml'), 'utf8');
const FN = readFileSync(join(ROOT, 'supabase/functions/api-events/index.ts'), 'utf8');
const LLMS_RENDERER = readFileSync(join(ROOT, 'scripts/lib/llmsTxt.ts'), 'utf8');
const LLMS_FILE = readFileSync(join(ROOT, 'public/llms.txt'), 'utf8');

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL  ${name}\n        ${err.message}`);
  }
}

/** Lines of the block that starts at `header` (exact line) and ends at the next line indented no deeper. */
function yamlBlock(header) {
  const lines = SPEC.split('\n');
  const start = lines.indexOf(header);
  assert.ok(start !== -1, `openapi.yaml has no line ${JSON.stringify(header)}`);
  const indent = header.length - header.trimStart().length;
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && line.length - line.trimStart().length <= indent) break;
    out.push(line);
  }
  return out;
}

function keysAtIndent(lines, indent) {
  const re = new RegExp(`^ {${indent}}([a-z_]+):`);
  const keys = lines.map((l) => re.exec(l)?.[1]).filter(Boolean);
  assert.ok(keys.length > 0, `no keys at indent ${indent}`);
  return keys;
}

/** Text between `open` and the first `close` after it, in the edge function source. */
function sourceBlock(open, close) {
  const i = FN.indexOf(open);
  assert.ok(i !== -1, `api-events/index.ts no longer contains ${JSON.stringify(open)}`);
  const j = FN.indexOf(close, i + open.length);
  assert.ok(j !== -1, `no ${JSON.stringify(close)} after ${JSON.stringify(open)}`);
  return FN.slice(i + open.length, j).split('\n');
}

const sorted = (a) => [...new Set(a)].sort();

// What the function returns, read from its own object literals.
const listKeys = keysAtIndent(sourceBlock('const events = (data || []).map((event) => ({', '\n      }));'), 8);
const detailKeys = keysAtIndent(sourceBlock('const event = {', '\n      };'), 8);
const acceptedParams = keysAtIndent(sourceBlock('validateQueryParams(url, {', '\n      });'), 8);

// What the spec says.
const eventProps = keysAtIndent(yamlBlock('    Event:'), 8);
const detailExtra = keysAtIndent(yamlBlock('    EventDetails:'), 12);
const listOp = yamlBlock('  /api-events:');
const specParams = listOp.map((l) => /^ {8}- name: ([a-z_]+)$/.exec(l)?.[1]).filter(Boolean);

function paramDescription(name) {
  const i = listOp.findIndex((l) => l === `        - name: ${name}`);
  assert.ok(i !== -1, `listEvents has no ${name} parameter`);
  const rest = listOp.slice(i + 1);
  const end = rest.findIndex((l) => /^ {8}- name:/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join(' ').replace(/\s+/g, ' ');
}

/** The YAML lines describing one Event property, joined. */
function eventProp(name) {
  const block = yamlBlock('    Event:');
  const i = block.indexOf(`        ${name}:`);
  assert.ok(i !== -1, `Event schema has no ${name}`);
  const rest = block.slice(i + 1);
  const end = rest.findIndex((l) => /^ {8}[a-z_]+:/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join(' ').replace(/\s+/g, ' ');
}

test('the Event schema lists exactly the keys the list endpoint returns', () => {
  assert.deepEqual(sorted(eventProps), sorted(listKeys));
});

test('Event plus EventDetails lists exactly the keys the detail endpoint returns', () => {
  assert.deepEqual(sorted([...eventProps, ...detailExtra]), sorted(detailKeys));
});

// status is validated with a default and then never read; documenting it would
// promise a filter that does nothing.
const UNDOCUMENTED_PARAMS = new Set(['status']);

test('listEvents documents every query parameter the function reads, and no other', () => {
  assert.deepEqual(sorted(specParams), sorted(acceptedParams.filter((p) => !UNDOCUMENTED_PARAMS.has(p))));
  assert.ok(acceptedParams.includes('status'), 'status is no longer accepted; drop it from UNDOCUMENTED_PARAMS');
});

test('end_date is in the Event schema, nullable, as a timestamp', () => {
  const d = eventProp('end_date');
  assert.match(d, /format: date-time/);
  assert.match(d, /nullable: true/);
});

test('date is typed as the timestamp events.date is, not a calendar date', () => {
  assert.match(eventProp('date'), /format: date-time/);
});

test('time is described as the 24-hour HH:MM the function returns', () => {
  assert.match(FN, /const m = \/T\(\\d\{2\}:\\d\{2\}\)\/\.exec\(startLocal\)/, 'localStartTime changed; recheck the time description');
  const d = eventProp('time');
  assert.match(d, /HH:MM/);
  assert.match(d, /nullable: true/);
  assert.doesNotMatch(d, /PM/);
});

test('start_date and end_date are described as Central time days', () => {
  for (const p of ['start_date', 'end_date']) {
    assert.match(paramDescription(p), /Central time day/, p);
    assert.match(paramDescription(p), /America\/Chicago/, p);
  }
  assert.match(paramDescription('start_date'), /not UTC/);
  assert.match(paramDescription('start_date'), /end_date reaches it/);
});

test('the operation description states the overlap test and the running arm', () => {
  const d = listOp.join(' ').replace(/\s+/g, ' ');
  assert.match(d, /overlap test/);
  assert.match(d, /still on/);
  assert.match(d, /no end_date is a single-day event/);
});

test('llms.txt names the API with the same window semantics, renderer and checked-in file alike', () => {
  for (const [label, text] of [['scripts/lib/llmsTxt.ts', LLMS_RENDERER], ['public/llms.txt', LLMS_FILE]]) {
    const line = text.split('\n').find((l) => l.includes('/openapi.yaml)'));
    assert.ok(line, `${label} does not link openapi.yaml`);
    assert.match(line, /Central time days/, label);
    assert.match(line, /overlap window/, label);
    assert.match(line, /end_date/, label);
  }
});

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nopenapi-api-events: all checks passed.');
