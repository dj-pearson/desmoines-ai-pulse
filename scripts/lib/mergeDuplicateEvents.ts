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

export const groupKey = (r: EventRow): string =>
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
