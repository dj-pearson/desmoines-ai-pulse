/**
 * The keeper decision for duplicate event rows (WEB-SEO-017 AC2).
 *
 * Pure - no database, no network - so scripts/__tests__/merge-duplicate-events.test.mjs
 * can exercise it, and in particular can prove the AMBIGUOUS branch fires. A
 * rule that reported "10 decidable, 0 need a human" on its first real run is
 * exactly the shape this repo has been burned by twice (check-edge-types
 * measuring nothing, the ballot guard passing its own control), so the branch
 * that refuses to decide has a test rather than a hope.
 *
 * Kept in scripts/lib/ next to pseoShippable.ts and sitemapSlugs.ts for the same
 * reason they are there: the decision is the part worth testing, and the script
 * around it is I/O.
 */

import {
  centralCalendarDate,
  MIN_TITLE_KEY_LENGTH,
  normalizeEventTitle,
  normalizeVenueName,
} from '../../supabase/functions/_shared/eventDedup.ts';

export interface EventRow {
  id: string;
  title: string | null;
  date: string | null;
  venue: string | null;
  image_url: string | null;
  enhanced_description: string | null;
  original_description: string | null;
  source: string | null;
  source_url: string | null;
  price: string | null;
  category: string | null;
  is_featured: boolean | null;
  is_merged: boolean | null;
  created_at: string | null;
}

export interface Decision {
  key: string;
  title: string;
  date: string | null;
  venue: string | null;
  keeper: EventRow;
  losers: EventRow[];
  reason: string;
  ambiguous: boolean;
  /** Fields the keeper is missing that a loser can supply. */
  fill: Record<string, unknown>;
}

/**
 * Identical to check-duplicate-entities.ts's normalise, deliberately. If the two
 * disagree, this script merges rows the detector does not consider duplicates.
 */
export const normalise = (value: string | null): string =>
  (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

export const groupKey = (r: Pick<EventRow, 'title' | 'date' | 'venue'>): string =>
  `${normalise(r.title)}|${r.date ?? ''}|${normalise(r.venue)}`;

export const descLength = (r: EventRow): number =>
  Math.max((r.enhanced_description ?? '').length, (r.original_description ?? '').length);

/**
 * Pick the row whose URL survives.
 *
 *  1. has an image_url        an event without one renders a placeholder
 *  2. richer description      longer enhanced/original_description
 *  3. older created_at        the row discoverable longest is likeliest to hold
 *                             inbound links
 *
 * is_featured is NOT a criterion - it is an editorial flag, not evidence about
 * which row is better data - but it is carried to the keeper, so merging can
 * never un-feature an event.
 *
 * AMBIGUOUS when 1 and 2 disagree: one row has the image, another has clearly
 * better text. That is the editorial call duplicate-events-baseline.json means
 * by "a per-group decision", so it is reported and skipped rather than guessed.
 */
export function decide(key: string, rows: EventRow[]): Decision {
  const withImage = rows.filter((r) => r.image_url);
  const best = [...rows].sort(
    (a, b) => descLength(b) - descLength(a) || (a.created_at ?? '').localeCompare(b.created_at ?? ''),
  );

  let keeper: EventRow;
  let reason: string;
  let ambiguous = false;

  if (withImage.length === 1) {
    keeper = withImage[0];
    reason = 'only row with an image';
    if (descLength(best[0]) > descLength(keeper) && best[0].id !== keeper.id) {
      ambiguous = true;
      reason = `image on ${keeper.id.slice(0, 8)} but longer text on ${best[0].id.slice(0, 8)}`;
    }
  } else {
    keeper = best[0];
    reason =
      descLength(best[0]) > descLength(best[1] ?? best[0])
        ? 'longest description'
        : 'oldest row (descriptions tie)';
  }

  const losers = rows.filter((r) => r.id !== keeper.id);

  const fill: Record<string, unknown> = {};
  for (const field of [
    'image_url',
    'price',
    'category',
    'source_url',
    'enhanced_description',
    'original_description',
  ] as const) {
    if (!keeper[field]) {
      const donor = losers.find((l) => l[field]);
      if (donor) fill[field] = donor[field];
    }
  }
  if (!keeper.is_featured && losers.some((l) => l.is_featured)) fill.is_featured = true;

  return {
    key,
    title: keeper.title ?? '',
    date: keeper.date,
    venue: keeper.venue,
    keeper,
    losers,
    reason,
    ambiguous,
    fill,
  };
}

/**
 * ── THE NEAR-DUPLICATE KEY (WEB-BE-052) ──────────────────────────────────────
 *
 * `groupKey` above needs the titles to be character-identical after punctuation
 * is stripped, so the same concert from SeatGeek, the venue and Catch Des
 * Moines stays three rows: one of them adds a subtitle, another a promoter
 * prefix. `nearGroupKey` is the looser key, and it is deliberately the SAME
 * normalizer `isDuplicateEvent`'s tier 4 uses rather than a second copy of the
 * rule - a merger that disagrees with the ingest-time dedup would merge rows
 * ingest considers distinct, which is the drift this file's header already
 * warns about for the detector.
 *
 * It is opt-in (`--near`) on both the merge script and the detector, because
 * duplicate-events-baseline.json was measured with the exact key and a looser
 * key changes what CI calls a new group.
 */
export interface NearRow {
  title: string | null;
  date: string | null;
  venue: string | null;
  is_merged?: boolean | null;
}

export const nearGroupKey = (r: NearRow): string | null => {
  const title = normalizeEventTitle(r.title ?? '');
  if (title.key.length < MIN_TITLE_KEY_LENGTH || !r.date) return null;
  return `${title.key}|${centralCalendarDate(r.date)}|${normalizeVenueName(r.venue ?? '')}`;
};

export interface NearGroup<T extends NearRow = EventRow> {
  key: string;
  rows: T[];
  /** Every row already shares one exact `groupKey`, so the exact pass has it. */
  exactAlready: boolean;
  /** Set when the group must NOT be merged; the text says why. */
  refused?: string;
}

/**
 * Group rows by the loose key, refusing the one case that would delete a real
 * event.
 *
 * TWO DIFFERENT SUBTITLES UNDER ONE PREFIX ARE A SERIES, not one show reported
 * twice - "<long prefix>: Bob Smith" and "<long prefix>: Sue Jones" are two
 * nights. Tier 4 guards this per pair with `!(a.hadSubtitle && b.hadSubtitle)`;
 * the same guard across a whole group is: at most one distinct full title among
 * the members whose subtitle was cut.
 */
export function nearGroups<T extends NearRow>(rows: T[]): NearGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    if (row.is_merged) continue;
    const key = nearGroupKey(row);
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  }

  const out: NearGroup<T>[] = [];
  for (const [key, members] of buckets) {
    if (members.length < 2) continue;

    const subtitled = new Set(
      members
        .filter((r) => normalizeEventTitle(r.title ?? '').hadSubtitle)
        .map((r) => normalise(r.title)),
    );

    out.push({
      key,
      rows: members,
      exactAlready: new Set(members.map(groupKey)).size === 1,
      refused:
        subtitled.size > 1
          ? `${subtitled.size} different subtitles share this prefix - likely a series, not one show`
          : undefined,
    });
  }
  return out;
}
