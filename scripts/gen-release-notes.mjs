#!/usr/bin/env node
/**
 * AOS-DEV-007 — release-notes / changelog generator (draft only).
 *
 * Aggregates merged PRs / conventional commits since the last release tag into
 * categorized notes (feat / fix / perf / refactor / docs / test / chore) and
 * emits a CHANGELOG entry. Distinguishes web vs iOS vs Android surfaces by the
 * files each commit touched, and flags backward-compat-sensitive changes
 * (destructive migrations, edge-function contract edits) for the release
 * checklist per CLAUDE.md.
 *
 * DRAFT ONLY: this writes a markdown block to stdout (and, in CI, opens a DRAFT
 * PR). A human edits and publishes — nothing is auto-released.
 *
 * Usage:
 *   node scripts/gen-release-notes.mjs [--from <ref>] [--to <ref>] [--version <x.y.z>]
 * Defaults: --from = last `v*` tag (or the repo root), --to = HEAD.
 *
 * Pure Node + `git` CLI, no deps. Fails open: on any internal error it prints a
 * note and exits 0 so a changelog hiccup never blocks CI.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
  } catch {
    return '';
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') out.from = argv[++i];
    else if (a === '--to') out.to = argv[++i];
    else if (a === '--version') out.version = argv[++i];
  }
  return out;
}

// Conventional-commit type → changelog section (order preserved).
const SECTIONS = [
  { type: 'feat', title: '✨ Features' },
  { type: 'fix', title: '🐛 Fixes' },
  { type: 'perf', title: '⚡ Performance' },
  { type: 'refactor', title: '♻️ Refactors' },
  { type: 'docs', title: '📝 Docs' },
  { type: 'test', title: '✅ Tests' },
  { type: 'chore', title: '🔧 Chores' },
];
const KNOWN = new Set(SECTIONS.map((s) => s.type));

// Map a changed file path to the client surface it affects.
function surfacesForFiles(files) {
  const s = new Set();
  for (const f of files) {
    if (/^ios\//.test(f) || /\.(swift|xcodeproj|plist)$/.test(f)) s.add('iOS');
    else if (/^android\//.test(f) || /\.(kt|gradle)$/.test(f)) s.add('Android');
    else if (/^(src|supabase|public)\//.test(f) || /^(index\.html|vite\.config)/.test(f)) s.add('Web');
  }
  return s;
}

// Backward-compat-sensitive edits per CLAUDE.md — surfaced for the release
// checklist (does NOT block; a human decides). `status` maps path → A|M|D.
function compatFlags(files, status, showFile) {
  const flags = [];
  const migrations = files.filter((f) => /^supabase\/migrations\/.*\.sql$/.test(f));
  for (const m of migrations) {
    // A destructive statement in any new migration is exactly what to flag.
    const body = showFile(m);
    if (/\b(DROP\s+COLUMN|DROP\s+TABLE|DROP\s+TYPE|RENAME\s+COLUMN|RENAME\s+TABLE|SET\s+NOT\s+NULL|DROP\s+DEFAULT)\b/i.test(body)) {
      flags.push({ level: 'destructive-migration', file: m });
    }
  }
  const fnEdits = files.filter((f) => /^supabase\/functions\/(?!_shared\/).+\/index\.ts$/.test(f));
  for (const fn of fnEdits) {
    // Added (A) functions are additive-safe; only modified/deleted contracts matter.
    if (status[fn] === 'A') continue;
    const dir = fn.split('/')[2];
    flags.push({ level: 'edge-function-changed', file: `functions/${dir}` });
  }
  return flags;
}

function lastTag() {
  // Most recent semver-ish tag reachable from HEAD; empty if none.
  const t = git(['describe', '--tags', '--abbrev=0', '--match', 'v*']);
  return t || '';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const from = args.from || lastTag();
  const to = args.to || 'HEAD';
  const range = from ? `${from}..${to}` : to;

  // One record per commit: hash, subject, body, files.
  const sep = '\x1e'; // record separator
  const fmt = `%H%x1f%s%x1f%b`; // hash, subject, body (unit-sep delimited)
  const raw = git(['log', range, `--pretty=format:${fmt}${sep}`, '--no-merges']);
  const mergeLog = git(['log', range, '--pretty=format:%H%x1f%s', '--merges']);

  const commits = [];
  for (const rec of raw.split(sep)) {
    const line = rec.trim();
    if (!line) continue;
    const [hash, subject = '', body = ''] = line.split('\x1f');
    if (!hash) continue;
    const files = [];
    const status = {};
    for (const row of git(['show', '--pretty=format:', '--name-status', hash]).split('\n')) {
      const m = row.match(/^([AMDRT])\d*\t(.+)$/);
      if (!m) continue;
      // For renames git prints "old\tnew"; take the last path (the new one).
      const path = m[2].split('\t').pop().trim();
      files.push(path);
      status[path] = m[1];
    }
    commits.push({ hash: hash.slice(0, 7), subject, body, files, status });
  }

  // Extract merged-PR numbers (from merge commits and squash subjects "(#123)").
  const prNumbers = new Set();
  for (const rec of mergeLog.split('\n')) {
    const m = rec.match(/#(\d+)/);
    if (m) prNumbers.add(m[1]);
  }
  for (const c of commits) {
    const m = c.subject.match(/\(#(\d+)\)\s*$/);
    if (m) prNumbers.add(m[1]);
  }

  // Bucket by conventional-commit type.
  const buckets = new Map(SECTIONS.map((s) => [s.type, []]));
  const other = [];
  const allSurfaces = new Set();
  const allFlags = [];
  const showFile = (m) => git(['show', '--no-color', '--', m]);

  for (const c of commits) {
    const cm = c.subject.match(/^(\w+)(\([^)]*\))?(!)?:\s*(.+)$/);
    const type = cm ? cm[1].toLowerCase() : null;
    const scope = cm && cm[2] ? cm[2].slice(1, -1) : null;
    const desc = cm ? cm[4] : c.subject;
    const surfaces = surfacesForFiles(c.files);
    surfaces.forEach((s) => allSurfaces.add(s));
    for (const fl of compatFlags(c.files, c.status, showFile)) allFlags.push({ ...fl, hash: c.hash });

    const entry = { hash: c.hash, scope, desc, surfaces };
    if (type && KNOWN.has(type)) buckets.get(type).push(entry);
    else other.push(entry);
  }

  const version = args.version || 'Unreleased';
  const lines = [];
  lines.push(`## ${version}`);
  lines.push('');
  lines.push(`_Draft — generated from \`${range}\`. Human review required before publishing._`);
  lines.push('');

  const surfaceList = [...allSurfaces].sort().join(', ') || 'Web';
  lines.push(`**Surfaces touched:** ${surfaceList}`);
  lines.push('');

  const fmtEntry = (e) => {
    const surf = e.surfaces.size ? ` _(${[...e.surfaces].sort().join('/')})_` : '';
    const scope = e.scope ? `**${e.scope}:** ` : '';
    return `- ${scope}${e.desc} (\`${e.hash}\`)${surf}`;
  };

  let total = 0;
  for (const sec of SECTIONS) {
    const items = buckets.get(sec.type);
    if (!items.length) continue;
    total += items.length;
    lines.push(`### ${sec.title}`);
    for (const e of items) lines.push(fmtEntry(e));
    lines.push('');
  }
  if (other.length) {
    total += other.length;
    lines.push('### Other');
    for (const e of other) lines.push(fmtEntry(e));
    lines.push('');
  }

  // Deduped backward-compat checklist.
  const seen = new Set();
  const checklist = [];
  for (const f of allFlags) {
    const key = `${f.level}:${f.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    checklist.push(f);
  }
  if (checklist.length) {
    lines.push('### ⚠️ Backward-compatibility checklist (CLAUDE.md)');
    lines.push('');
    lines.push('_Review each before releasing — older iOS/Android binaries may still read these shapes._');
    lines.push('');
    for (const f of checklist) {
      const label =
        f.level === 'destructive-migration'
          ? `Destructive migration \`${f.file}\` — confirm the deprecation flow (add-new → migrate readers → retire) spans releases`
          : `Edge function \`${f.file}\` changed — confirm no request/response/status/rate-limit break for shipped binaries`;
      lines.push(`- [ ] ${label} (\`${f.hash}\`)`);
    }
    lines.push('');
  }

  if (!total && !other.length) {
    lines.push('_No conventional commits found in range._');
    lines.push('');
  }

  if (prNumbers.size) {
    lines.push(`**Merged PRs:** ${[...prNumbers].sort((a, b) => Number(a) - Number(b)).map((n) => `#${n}`).join(', ')}`);
    lines.push('');
  }

  const markdown = lines.join('\n');
  process.stdout.write(markdown + '\n');

  // Machine-readable summary for the CI recorder (audit run).
  const summary = {
    range,
    version,
    commits: commits.length,
    prs: prNumbers.size,
    entries: total + other.length,
    surfaces: [...allSurfaces].sort(),
    compatFlags: checklist.length,
  };
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `summary=${JSON.stringify(summary)}\n`);
  }
  if (process.env.RELEASE_NOTES_FILE) {
    writeFileSync(process.env.RELEASE_NOTES_FILE, markdown + '\n');
  }
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  // Fail open — a changelog hiccup must never block CI.
  process.stdout.write(`\n<!-- release-notes generator errored (failing open): ${err?.message ?? err} -->\n`);
  process.exit(0);
}
