#!/usr/bin/env node
/**
 * Joins a Google Keyword Planner export back onto the seed classification and ranks
 * the result.
 *
 * Input:  docs/seo/keyword-research/Saved Keywords Stats *.csv  (Planner export, TSV, UTF-16LE)
 *         docs/seo/keyword-research/keyword-seed-master.csv     (from generate-keyword-seeds.mjs)
 * Output: docs/seo/keyword-research/keyword-opportunities.csv
 *
 * Planner volumes bucket to 50 / 500 / 5,000 / 50,000 without an active spending ad
 * account, so nothing here computes a traffic forecast. The bucket is used only to
 * separate "has measurable demand" from "does not".
 *
 * Run: node scripts/analyze-keyword-volumes.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'docs', 'seo', 'keyword-research');

// ---------------------------------------------------------------- read the Planner export

const exportName = readdirSync(DIR).find((f) => /^Saved Keywords Stats.*\.csv$/i.test(f));
if (!exportName) throw new Error('No "Saved Keywords Stats*.csv" found in ' + DIR);

const raw = readFileSync(join(DIR, exportName));
// Planner exports UTF-16LE with a BOM; fall back to UTF-8 if that is not what arrived.
const text = (raw[0] === 0xff && raw[1] === 0xfe)
  ? raw.toString('utf16le').slice(1)
  : raw.toString('utf8').replace(/^﻿/, '');

const lines = text.split(/\r?\n/);
const headerIdx = lines.findIndex((l) => l.startsWith('Keyword\t'));
if (headerIdx === -1) throw new Error('Could not find the header row in ' + exportName);

const header = lines[headerIdx].split('\t');
const col = (name) => {
  const i = header.indexOf(name);
  if (i === -1) throw new Error('Missing column: ' + name);
  return i;
};
const C_KW = col('Keyword');
const C_VOL = col('Avg. monthly searches');
const C_COMP = col('Competition');
const C_COMPI = col('Competition (indexed value)');
const C_BID_LO = col('Top of page bid (low range)');
const C_BID_HI = col('Top of page bid (high range)');
const C_YOY = col('YoY change');
const C_3MO = col('Three month change');

const planner = new Map();
for (const line of lines.slice(headerIdx + 1)) {
  if (!line.trim()) continue;
  const f = line.split('\t');
  const kw = (f[C_KW] || '').trim().toLowerCase();
  if (!kw) continue;
  const volRaw = (f[C_VOL] || '').trim();
  planner.set(kw, {
    volume: volRaw === '' ? null : Number(volRaw),
    competition: (f[C_COMP] || '').trim() || 'No data',
    compIndex: (f[C_COMPI] || '').trim() === '' ? null : Number(f[C_COMPI]),
    bidLow: (f[C_BID_LO] || '').trim(),
    bidHigh: (f[C_BID_HI] || '').trim(),
    yoy: (f[C_YOY] || '').trim(),
    threeMonth: (f[C_3MO] || '').trim(),
  });
}

// ---------------------------------------------------------------- read the seed master

function parseCsv(str) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quoted) {
      if (ch === '"') {
        if (str[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const seedRows = parseCsv(readFileSync(join(DIR, 'keyword-seed-master.csv'), 'utf8'));
const seedHeader = seedRows[0];
const seeds = seedRows.slice(1)
  .filter((r) => r.length === seedHeader.length && r[0])
  .map((r) => Object.fromEntries(seedHeader.map((h, i) => [h, r[i]])));

// ---------------------------------------------------------------- score

// Buildability: a term whose route already resolves needs content, not engineering.
const BUILD_COST = { live: 1.0, 'pseo-slug': 0.9, 'route-exists-no-content': 0.7, 'needs-build': 0.5 };
// Competition here is paid competition, which is a rough proxy for commercial contest,
// not for organic difficulty. Weighted gently for that reason.
const COMP_WEIGHT = { Low: 1.0, Medium: 0.75, High: 0.5, 'No data': 0.6 };

const joined = seeds.map((s) => {
  const p = planner.get(s.keyword) || {};
  const volume = p.volume ?? null;
  const priorityWeight = { '1': 1.0, '2': 0.8, '3': 0.5 }[s.priority] ?? 0.5;
  const score = volume === null || volume === 0
    ? 0
    : Math.round(
        Math.log10(volume) *
        (COMP_WEIGHT[p.competition] ?? 0.6) *
        (BUILD_COST[s.route_status] ?? 0.5) *
        priorityWeight * 100
      );
  return {
    ...s,
    volume: volume === null ? '' : String(volume),
    competition: p.competition || 'not-returned',
    competition_index: p.compIndex === null || p.compIndex === undefined ? '' : String(p.compIndex),
    bid_low: p.bidLow || '',
    bid_high: p.bidHigh || '',
    yoy_change: p.yoy || '',
    three_month_change: p.threeMonth || '',
    score: String(score),
    _v: volume,
    _score: score,
  };
});

// ---------------------------------------------------------------- write

const OUT_COLUMNS = ['score', 'keyword', 'volume', 'competition', 'competition_index',
  'cluster', 'subcluster', 'intent', 'seasonality', 'target_route', 'route_status',
  'catchdm_gap', 'priority', 'bid_low', 'bid_high', 'yoy_change', 'three_month_change', 'notes'];

const csvCell = (v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
const sorted = [...joined].sort((a, b) => b._score - a._score || (b._v || 0) - (a._v || 0));
writeFileSync(
  join(DIR, 'keyword-opportunities.csv'),
  [OUT_COLUMNS.join(','), ...sorted.map((r) => OUT_COLUMNS.map((c) => csvCell(r[c] ?? '')).join(','))].join('\n') + '\n',
  'utf8'
);

// ---------------------------------------------------------------- report

const withVol = joined.filter((r) => r._v);
const noVol = joined.filter((r) => !r._v);
const notReturned = joined.filter((r) => r.competition === 'not-returned');

console.log('Export: ' + exportName);
console.log(seeds.length + ' seeds, ' + planner.size + ' rows in export, '
  + withVol.length + ' with measurable volume, ' + noVol.length + ' at zero or blank'
  + (notReturned.length ? ' (' + notReturned.length + ' absent from the export entirely)' : ''));

const buckets = {};
for (const r of withVol) buckets[r._v] = (buckets[r._v] || 0) + 1;
console.log('\nVolume buckets:');
for (const [v, n] of Object.entries(buckets).sort((a, b) => Number(b[0]) - Number(a[0]))) {
  console.log('  ' + String(v).padStart(7) + '  ' + String(n).padStart(3) + ' keywords');
}

const comp = {};
for (const r of withVol) comp[r.competition] = (comp[r.competition] || 0) + 1;
console.log('\nCompetition, terms with volume:');
for (const [k, n] of Object.entries(comp).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + String(n).padStart(4) + '  ' + k);
}

console.log('\nBy cluster (terms with volume / total seeds / summed volume):');
const cl = {};
for (const r of joined) {
  cl[r.cluster] = cl[r.cluster] || { hit: 0, total: 0, vol: 0 };
  cl[r.cluster].total++;
  if (r._v) { cl[r.cluster].hit++; cl[r.cluster].vol += r._v; }
}
for (const [k, v] of Object.entries(cl).sort((a, b) => b[1].vol - a[1].vol)) {
  console.log('  ' + String(v.vol).padStart(7) + '  ' + String(v.hit).padStart(3) + '/'
    + String(v.total).padEnd(4) + '  ' + k);
}

console.log('\nTop 40 by score:');
console.log('  score   vol  comp    route_status              keyword');
for (const r of sorted.slice(0, 40)) {
  console.log('  ' + r.score.padStart(5) + '  ' + String(r._v).padStart(5) + '  '
    + r.competition.padEnd(6) + '  ' + r.route_status.padEnd(24) + '  ' + r.keyword);
}

console.log('\nZero or blank volume (candidates to drop or re-check in a real tool): '
  + noVol.length);
console.log('  ' + noVol.map((r) => r.keyword).slice(0, 60).join('\n  '));
if (noVol.length > 60) console.log('  ... and ' + (noVol.length - 60) + ' more');
