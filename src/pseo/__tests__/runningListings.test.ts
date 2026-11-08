import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pseoEventFilters } from '../listingFilters';
import { areaEventsWindow, splitAreaEvents, type AreaEventRow } from '../areaGuide';
import { NEIGHBORHOOD_BOUNDARIES } from '../../lib/neighborhoodBoundaries';

/**
 * WEB-SEO-063. pSEO event listings sent `date >= now()` and the East Village
 * area guide sent `date >= now() AND date < now() + 30d`, so a festival dropped
 * off both on its second day and an untimed event (stored at the 19:31:58
 * Central sentinel) dropped off at 7:31 PM on its own day, while /events and
 * site search kept both.
 *
 * The filters the reads send are evaluated here against fixture rows, nested
 * and()/or() included, so the assertions are on which rows survive, not on a
 * filter string.
 */

type Cell = string | number | null;
type Row = Record<string, Cell>;
type Pred = (row: Row) => boolean;

function cmp(cell: Cell, op: string, raw: string): boolean {
  if (op === 'ilike') {
    const needle = raw.replace(/^%|%$/g, '').toLowerCase();
    return typeof cell === 'string' && cell.toLowerCase().includes(needle);
  }
  if (cell == null) return false;
  const a = Date.parse(String(cell));
  const b = Date.parse(raw);
  if (op === 'gte') return a >= b;
  if (op === 'lte') return a <= b;
  if (op === 'lt') return a < b;
  throw new Error(`unsupported op ${op}`);
}

function splitTop(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function term(t: string): Pred {
  const group = /^(and|or)\((.*)\)$/.exec(t);
  if (group) {
    const parts = splitTop(group[2]).map(term);
    return group[1] === 'and' ? (r) => parts.every((p) => p(r)) : (r) => parts.some((p) => p(r));
  }
  const [col, op, ...rest] = t.split('.');
  return (r) => cmp(r[col], op, rest.join('.'));
}

/** A top-level .or(body): any of its terms. */
const orFilter = (body: string): Pred => {
  const parts = splitTop(body).map(term);
  return (r) => parts.some((p) => p(r));
};

const titles = (rows: Row[], preds: Pred[]) =>
  rows.filter((r) => preds.every((p) => p(r))).map((r) => r.title);

const row = (title: string, date: string, end_date: string | null = null, venue = 'Hoyt Sherman Place'): Row => ({
  title,
  date,
  end_date,
  venue,
  city: null,
  location: 'Des Moines, IA',
});

// Friday 2026-10-02, 8:00 PM CDT: after the 7:31 PM untimed sentinel.
const EVENING = new Date('2026-10-03T01:00:00Z');

const UNTIMED_TONIGHT = row('Untimed tonight', '2026-10-03T00:31:58Z');
const FESTIVAL = row('Festival day two', '2026-10-01T15:00:00Z', '2026-10-04T03:00:00Z', 'East Village');
const ENDED = row('Ended Wednesday', '2026-09-28T23:00:00Z', '2026-10-01T03:00:00Z');
const LAST_NIGHT = row('Last night', '2026-10-02T00:00:00Z');
const NEXT_WEEK = row('Next week', '2026-10-11T00:00:00Z');
const NEXT_YEAR = row('Next year', '2027-10-10T00:00:00Z');
const ROWS = [UNTIMED_TONIGHT, FESTIVAL, ENDED, LAST_NIGHT, NEXT_WEEK, NEXT_YEAR];

describe('pseoEventFilters - no temporal dimension', () => {
  it('keeps an untimed event after 7:31 PM and a run on its second day', () => {
    const f = pseoEventFilters({}, EVENING);
    expect(f.lte).toBeNull();
    expect(titles(ROWS, [orFilter(f.or)])).toEqual([
      'Untimed tonight',
      'Festival day two',
      'Next week',
      'Next year',
    ]);
  });

  it('the old `date >= now()` filter dropped both (the reproduction)', () => {
    const old = (r: Row) => cmp(r.date, 'gte', EVENING.toISOString());
    expect(titles(ROWS, [old])).toEqual(['Next week', 'Next year']);
  });

  it('ANDs the location with the window inside one or=', () => {
    const f = pseoEventFilters({ locationName: 'East Village' }, EVENING);
    expect(titles(ROWS, [orFilter(f.or)])).toEqual(['Festival day two']);
    const elsewhere = pseoEventFilters({ locationName: 'Ankeny, IA' }, EVENING);
    // The comma is stripped so the or() clause stays one clause.
    expect(elsewhere.or).not.toMatch(/Ankeny,/);
    expect(titles(ROWS, [orFilter(elsewhere.or)])).toEqual([]);
  });
});

describe('pseoEventFilters - temporal dimension is an overlap', () => {
  // Friday 2026-10-02, 3:00 PM CDT. Same calendar date in UTC and Central, so
  // temporalRange's local-date keys agree whatever TZ the test runs in.
  const AFTERNOON = new Date('2026-10-02T20:00:00Z');

  it('today keeps the running festival and tonight, not last night or next week', () => {
    const f = pseoEventFilters({ temporalSlug: 'today' }, AFTERNOON);
    expect(f.lte).not.toBeNull();
    const preds = [orFilter(f.or), (r: Row) => cmp(r.date, 'lte', f.lte as string)];
    expect(titles(ROWS, preds)).toEqual(['Untimed tonight', 'Festival day two']);
  });

  it('today ends at Central midnight, not UTC midnight', () => {
    // 11 PM CDT Friday is 04:00Z Saturday; 1 AM CDT Saturday is not today.
    const late = row('Late Friday', '2026-10-03T04:00:00Z');
    const saturday = row('Early Saturday', '2026-10-03T06:00:00Z');
    const f = pseoEventFilters({ temporalSlug: 'today' }, AFTERNOON);
    const preds = [orFilter(f.or), (r: Row) => cmp(r.date, 'lte', f.lte as string)];
    expect(titles([late, saturday], preds)).toEqual(['Late Friday']);
  });

  it('a month keeps a run that started before the window opened', () => {
    const f = pseoEventFilters({ temporalSlug: 'october' }, AFTERNOON);
    const preds = [orFilter(f.or), (r: Row) => cmp(r.date, 'lte', f.lte as string)];
    expect(titles(ROWS, preds)).toEqual(['Untimed tonight', 'Festival day two', 'Next week']);
  });

  it('an unknown temporal slug adds no window, as before', () => {
    expect(pseoEventFilters({ temporalSlug: 'someday' }, AFTERNOON)).toEqual(pseoEventFilters({}, AFTERNOON));
  });
});

describe('areaEventsWindow + splitAreaEvents (East Village guide)', () => {
  const EV = NEIGHBORHOOD_BOUNDARIES.find((b) => b.slug === 'east-village');
  if (!EV) throw new Error('east-village boundary missing');
  const inside = { latitude: 41.59, longitude: -93.612 };

  const area = (r: Row): AreaEventRow => ({
    id: String(r.title),
    title: String(r.title),
    date: r.date as string,
    end_date: r.end_date as string | null,
    event_start_utc: null,
    time_tbd: null,
    venue: null,
    location: null,
    ...inside,
  });

  it('the server filter keeps tonight and the running festival within the lookahead', () => {
    const w = areaEventsWindow(EVENING);
    const preds = [orFilter(w.or), (r: Row) => cmp(r.date, 'lt', w.before)];
    expect(titles(ROWS, preds)).toEqual(['Untimed tonight', 'Festival day two', 'Next week']);
  });

  it('the client split keeps them too, running first', () => {
    const w = areaEventsWindow(EVENING);
    const sent = ROWS.filter((r) => orFilter(w.or)(r) && cmp(r.date, 'lt', w.before)).map(area);
    const out = splitAreaEvents(sent, EV.polygon, EVENING);
    expect(out.thisWeek.map((e) => e.title)).toEqual(['Festival day two', 'Untimed tonight']);
    expect(out.later.map((e) => e.title)).toEqual(['Next week']);
  });

  it('the client split still drops what is over', () => {
    const out = splitAreaEvents([ENDED, LAST_NIGHT].map(area), EV.polygon, EVENING);
    expect(out.thisWeek).toEqual([]);
    expect(out.later).toEqual([]);
  });
});

describe('the reads send these filters', () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, '..', p), 'utf8');

  it('PseoLiveListings sends pseoEventFilters and no bare date floor', () => {
    const src = read('components/sections/PseoLiveListings.tsx');
    expect(src).toMatch(/pseoEventFilters\(/);
    expect(src).not.toMatch(/\.gte\(\s*['"]date['"]/);
  });

  it('useAreaEvents sends areaEventsWindow and selects end_date', () => {
    const src = read('hooks/useAreaGuide.ts');
    expect(src).toMatch(/areaEventsWindow\(/);
    expect(src).toMatch(/end_date/);
    expect(src).not.toMatch(/\.gte\(\s*['"]date['"]/);
  });

  it('the inventory gate builds the same filters as the component', () => {
    const src = readFileSync(path.resolve(__dirname, '../../../scripts/lib/pseoShippable.ts'), 'utf8');
    expect(src).toMatch(/pseoEventFilters\(/);
    expect(src).not.toMatch(/append\('date', `gte\.\$\{nowIso\}`\)/);
  });
});
