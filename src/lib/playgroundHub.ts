/**
 * The /playgrounds hub's lead sections, from the rows and nothing else
 * (SEO-042).
 *
 * WHAT THE TABLE CAN BACK, measured against production 2026-10-01 (69 rows,
 * 48 inside the metro):
 *   age_range        27 rows; 24 say "All ages", three name a preschool age
 *   amenities        27 rows carry a list (1 to 10 entries)
 *   has_shade        0 rows known
 *   has_restrooms    0 rows known
 *   surface_type     0 rows
 *   accessibility_notes 0 rows
 *   indoor/outdoor   no column at all
 *
 * So "best by age" can only split toddler-and-preschool picks from all-ages
 * picks, splash pads come from amenity and description text, and there is no
 * indoor section: nothing in a row says a place is indoors, and naming one
 * from its business name would be a guess the page then publishes.
 */

export interface PlaygroundHubRow {
  id: string;
  name: string;
  location?: string | null;
  description?: string | null;
  age_range?: string | null;
  amenities?: string[] | null;
}

/** One entry in a ranked list, with the reason it is there. */
export interface PlaygroundPick<T extends PlaygroundHubRow = PlaygroundHubRow> {
  row: T;
  /** Number of amenities the listing records; the ranking key. */
  featureCount: number;
  /** What in the row put it in this list, quoted from the row. */
  reason: string;
}

/**
 * The selection rule, shown on the page under every ranked list. It has to
 * say exactly what rankPlaygrounds does, because a "best" list whose rule a
 * reader cannot check is an opinion nobody holds.
 */
export const PLAYGROUND_SELECTION_RULE =
  "Ranked by how many amenities each listing records, most first, then by name. A listing with no amenities recorded is not ranked.";

/**
 * Section ids on /playgrounds that other pages link to. /events/kids and the
 * playground detail pages write the hrefs as literals so check-internal-links
 * can read them; keep these in step.
 */
export const PLAYGROUND_GUIDE_ANCHORS = {
  byAge: "best-by-age",
  splashPads: "splash-pads",
} as const;

/** How many picks each age list shows. */
export const PICKS_PER_LIST = 3;

const SPLASH_RE = /\b(splash\s*pads?|splash\s*pools?|spray\s*grounds?|spraygrounds?)\b/i;
const TODDLER_AMENITY_RE = /\btoddler\b/i;
const YOUNG_AGE_RE = /\b(toddler|preschool|under\s*5|ages?\s*[0-4]\b|[0-4]\s*-\s*[0-9]+)\b/i;
const ALL_AGES_RE = /^\s*all\s+ages\s*$/i;

function amenitiesOf(row: PlaygroundHubRow): string[] {
  return (row.amenities ?? []).map((a) => a.trim()).filter((a) => a.length > 0);
}

export function featureCount(row: PlaygroundHubRow): number {
  return amenitiesOf(row).length;
}

/**
 * Most amenities first, ties by name; rows with none are dropped. This is the
 * rule PLAYGROUND_SELECTION_RULE states.
 */
export function rankPlaygrounds<T extends PlaygroundHubRow>(
  picks: PlaygroundPick<T>[],
  limit?: number,
): PlaygroundPick<T>[] {
  const ranked = picks
    .filter((p) => p.featureCount > 0)
    .sort((a, b) => b.featureCount - a.featureCount || a.row.name.localeCompare(b.row.name));
  return limit === undefined ? ranked : ranked.slice(0, limit);
}

/**
 * Why a row suits toddlers and preschoolers, or null. Two signals only: an
 * amenity naming toddler equipment ("2 Toddler bucket swings"), or an age
 * range that names a preschool age ("Preschool and older", "Under 5 and up").
 */
export function toddlerReason(row: PlaygroundHubRow): string | null {
  const toddler = amenitiesOf(row).find((a) => TODDLER_AMENITY_RE.test(a));
  if (toddler) return toddler;
  const age = row.age_range?.trim();
  if (age && !ALL_AGES_RE.test(age) && YOUNG_AGE_RE.test(age)) return `Listed for ages: ${age}`;
  return null;
}

/** "All ages" as the row's own age range, and nothing looser. */
export function isListedAllAges(row: PlaygroundHubRow): boolean {
  return ALL_AGES_RE.test(row.age_range ?? "");
}

/**
 * The splash pad or sprayground a row lists, quoted, or null. Amenities first;
 * then the description, which is where the Places rows say it ("a splash pad
 * & picnic shelters"). A wading pool is not a splash pad and is not matched.
 */
export function splashPadReason(row: PlaygroundHubRow): string | null {
  const amenity = amenitiesOf(row).find((a) => SPLASH_RE.test(a));
  if (amenity) return amenity;
  const m = row.description?.match(SPLASH_RE);
  if (m) return `Description mentions a ${m[1].toLowerCase()}`;
  return null;
}

export interface PlaygroundHubSections<T extends PlaygroundHubRow> {
  toddlers: PlaygroundPick<T>[];
  allAges: PlaygroundPick<T>[];
  /** Every splash pad row, by name; not ranked, so no rule applies. */
  splashPads: PlaygroundPick<T>[];
  toddlerTotal: number;
  splashTotal: number;
}

export function buildPlaygroundHubSections<T extends PlaygroundHubRow>(
  rows: T[],
  limit: number = PICKS_PER_LIST,
): PlaygroundHubSections<T> {
  const toddlerAll: PlaygroundPick<T>[] = [];
  const allAgesAll: PlaygroundPick<T>[] = [];
  const splashPads: PlaygroundPick<T>[] = [];

  for (const row of rows) {
    const count = featureCount(row);
    const toddler = toddlerReason(row);
    if (toddler) toddlerAll.push({ row, featureCount: count, reason: toddler });
    if (isListedAllAges(row)) {
      allAgesAll.push({ row, featureCount: count, reason: `${count} amenities listed` });
    }
    const splash = splashPadReason(row);
    if (splash) splashPads.push({ row, featureCount: count, reason: splash });
  }

  const toddlers = rankPlaygrounds(toddlerAll, limit);
  // A playground already picked for toddlers is not repeated under all ages:
  // two lists of three that share a row are five picks pretending to be six.
  const picked = new Set(toddlers.map((p) => p.row.id));
  const allAges = rankPlaygrounds(
    allAgesAll.filter((p) => !picked.has(p.row.id)),
    limit,
  );

  splashPads.sort((a, b) => a.row.name.localeCompare(b.row.name));

  return {
    toddlers,
    allAges,
    splashPads,
    toddlerTotal: toddlerAll.length,
    splashTotal: splashPads.length,
  };
}

/**
 * The hub's first paragraph: a count-led answer, or null while the rows are
 * not in. Every number is a count of rows the page is about to list.
 */
export function playgroundHubLead(
  metroCount: number,
  sections: Pick<PlaygroundHubSections<PlaygroundHubRow>, "toddlerTotal" | "splashTotal">,
): string | null {
  if (metroCount <= 0) return null;
  const parts: string[] = [];
  if (sections.splashTotal > 0) {
    parts.push(
      `${sections.splashTotal} list a splash pad or sprayground`,
    );
  }
  if (sections.toddlerTotal > 0) {
    parts.push(`${sections.toddlerTotal} list toddler equipment or a preschool age range`);
  }
  const head = `${metroCount} playgrounds across the Des Moines metro`;
  if (parts.length === 0) return `${head}.`;
  return `${head}: ${parts.join(", and ")}.`;
}

/**
 * The hub's meta description: the same counts as the lead, said in the words
 * a searcher used ("splash pads", "by age"). Null while the rows are not in;
 * the page then keeps its count-free fallback.
 */
export function playgroundHubDescription(
  metroCount: number,
  sections: Pick<PlaygroundHubSections<PlaygroundHubRow>, "toddlers" | "allAges" | "splashTotal">,
): string | null {
  if (metroCount <= 0) return null;
  const parts: string[] = [];
  if (sections.toddlers.length > 0 || sections.allAges.length > 0) parts.push("the best picks by age");
  if (sections.splashTotal > 0) {
    parts.push(
      sections.splashTotal === 1
        ? "1 splash pad or sprayground"
        : `${sections.splashTotal} splash pads and spraygrounds`,
    );
  }
  parts.push("directions to each");
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `${metroCount} playgrounds across the Des Moines metro, with ${list}.`;
}
