#!/usr/bin/env node
/**
 * Offline checks for public/robots.txt (WEB-SEO-066).
 *
 *   node scripts/__tests__/robots-groups.test.mjs
 *
 * A crawler obeys ONE group: the most specific User-agent that matches it
 * (RFC 9309 section 2.2.1; Google and Bing both document it). It does not add
 * the `User-agent: *` rules on top. So every named group that is meant to
 * allow a crawler has to repeat the whole private-path list, and when /campaigns
 * was added to `*` it reached GPTBot and no other named group: Googlebot,
 * Bingbot, ClaudeBot, PerplexityBot and twelve more were still told the
 * advertiser dashboard was open. Nothing compared the groups, so the drift was
 * invisible until read line by line.
 *
 * These checks pin:
 *   - every allowing group carries exactly the `*` group's Disallow set
 *   - every blocking group is exactly `Disallow: /`
 *   - no crawler is named in two groups (a parser merges or picks one; either
 *     way the file no longer says what it reads as)
 *   - every <ProtectedRoute> path in src/App.tsx is disallowed for `*`
 *   - no URL in a checked-in sitemap is disallowed for `*`, which Search
 *     Console reports as "Submitted URL blocked by robots.txt"
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROBOTS_PATH = process.env.ROBOTS_TXT_PATH || join(ROOT, 'public', 'robots.txt');

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

/**
 * Groups as RFC 9309 defines them: one or more consecutive user-agent lines,
 * then the rules up to the next user-agent line. Comments and blank lines do
 * not end a group. Sitemap lines belong to no group.
 */
export function parseRobotsGroups(text) {
  const groups = [];
  let cur = null;
  let sawRule = true;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = /^(user-agent|allow|disallow)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || sawRule) {
        cur = { agents: [], allow: [], disallow: [] };
        groups.push(cur);
      }
      cur.agents.push(value);
      sawRule = false;
    } else {
      if (!cur) throw new Error(`rule before any user-agent: "${raw}"`);
      cur[key].push(value);
      sawRule = true;
    }
  }
  return groups;
}

export function isBlockingGroup(g) {
  return g.disallow.length === 1 && g.disallow[0] === '/' && g.allow.length === 0;
}

/** Plain prefix match, which is all this file uses (no * or $ patterns). */
export function disallowedBy(path, disallow) {
  return disallow.find((rule) => rule !== '' && path.startsWith(rule)) ?? null;
}

const sorted = (xs) => [...xs].sort();

const groups = parseRobotsGroups(readFileSync(ROBOTS_PATH, 'utf8'));
const star = groups.find((g) => g.agents.includes('*'));

test('the parser reads the groups this file is known to have', () => {
  // A parser that silently found nothing would pass every check below.
  assert.ok(groups.length >= 20, `only ${groups.length} groups parsed`);
  assert.ok(star, 'no User-agent: * group');
  assert.ok(star.disallow.length >= 5, `* group has only ${star.disallow.length} Disallow lines`);
  assert.ok(!star.disallow.includes('/'), 'the * group blocks the whole site');
});

test('no crawler is named in more than one group', () => {
  const seen = new Map();
  const dupes = [];
  for (const g of groups) {
    for (const a of g.agents) {
      const key = a.toLowerCase();
      if (seen.has(key)) dupes.push(a);
      seen.set(key, true);
    }
  }
  assert.deepEqual(dupes, []);
});

test('every allowing group carries exactly the * group Disallow set', () => {
  const want = sorted(star.disallow);
  const drift = [];
  for (const g of groups) {
    if (g === star || isBlockingGroup(g)) continue;
    const have = sorted(g.disallow);
    const missing = want.filter((p) => !have.includes(p));
    const extra = have.filter((p) => !want.includes(p));
    if (missing.length || extra.length) {
      drift.push(
        `${g.agents.join(', ')}:` +
          (missing.length ? ` missing ${missing.join(' ')}` : '') +
          (extra.length ? ` extra ${extra.join(' ')}` : ''),
      );
    }
  }
  assert.deepEqual(drift, []);
});

test('every allowing group says Allow: / and every blocking group says only Disallow: /', () => {
  const bad = [];
  for (const g of groups) {
    if (g === star || isBlockingGroup(g)) continue;
    if (!g.allow.includes('/')) bad.push(`${g.agents.join(', ')}: no Allow: /`);
    if (g.disallow.includes('/')) bad.push(`${g.agents.join(', ')}: mixes Disallow: / with other rules`);
  }
  assert.deepEqual(bad, []);
});

test('every <ProtectedRoute> path in App.tsx is disallowed for *', () => {
  const app = readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf8');
  const paths = [...app.matchAll(/path="([^"]+)"\s+element=\{<ProtectedRoute/g)].map((m) =>
    // Robots rules are prefixes, so test the path up to its first parameter.
    m[1].split('/:')[0],
  );
  assert.ok(paths.length >= 10, `only ${paths.length} protected routes found; has App.tsx changed shape?`);
  const open = [...new Set(paths)].filter((p) => !disallowedBy(p, star.disallow));
  assert.deepEqual(open, []);
});

test('no URL in a checked-in sitemap is disallowed for *', () => {
  const dir = join(ROOT, 'public');
  const files = readdirSync(dir).filter((f) => /^sitemap.*\.xml$/.test(f));
  assert.ok(files.length >= 5, `only ${files.length} sitemaps found`);
  const blocked = [];
  for (const f of files) {
    const xml = readFileSync(join(dir, f), 'utf8');
    for (const [, loc] of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      let path;
      try {
        path = new URL(loc).pathname;
      } catch {
        continue;
      }
      const rule = disallowedBy(path, star.disallow);
      if (rule) blocked.push(`${f}: ${path} (Disallow: ${rule})`);
    }
  }
  assert.deepEqual(blocked, []);
});

test('disallowedBy is a prefix match that ignores an empty rule', () => {
  assert.equal(disallowedBy('/campaigns/abc', ['/campaigns']), '/campaigns');
  assert.equal(disallowedBy('/events', ['/admin', '']), null);
});

test('parseRobotsGroups keeps consecutive user-agent lines in one group', () => {
  const g = parseRobotsGroups('User-agent: a\nUser-agent: b\n# note\nDisallow: /x\n\nUser-agent: c\nDisallow: /\n');
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].agents, ['a', 'b']);
  assert.deepEqual(g[0].disallow, ['/x']);
  assert.ok(isBlockingGroup(g[1]));
});

if (failures) {
  console.error(`\n${failures} robots.txt check(s) failed`);
  process.exit(1);
}
console.log('\nrobots.txt checks passed');
