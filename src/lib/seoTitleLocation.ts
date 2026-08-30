/**
 * SEO-005: make a chain restaurant's title say WHICH branch it is.
 *
 * THE CASE THIS EXISTS FOR. /restaurants/texas-roadhouse and
 * /restaurants/texas-roadhouse-2 are two REAL restaurants - one in Johnston, one
 * on Mills Civic Pkwy in West Des Moines. Their descriptions say so. Both served
 * the <title> "Texas Roadhouse", because both rows carry a hand-set `seo_title`
 * of exactly that, which overrides a generated fallback that would have included
 * the city. So two different restaurants competed for one query under one title,
 * and neither said which branch a searcher had found.
 *
 * WHY THIS IS WORTH A HELPER RATHER THAN A DATA EDIT. The suburb-qualified
 * branded lookup is one of the most common query shapes this site actually
 * receives: "dave's hot chicken west des moines" (1,184 impressions),
 * "bonchon west des moines" (1,391), "atlas cafe west des moines" (282),
 * "marvs norwalk", "bubbies bbq pleasant hill", "tous les jours bakery cafe -
 * jordan creek west des moines". A title with no suburb in it cannot match any
 * of them well, and every multi-location chain in the database has the problem,
 * not just the two that happen to collide on a slug.
 *
 * WHAT IT WILL NOT DO. It never rewrites a title that already names a place, so
 * an editor who wrote "Texas Roadhouse West Des Moines" keeps exactly that; and
 * it adds nothing when the row has no city, rather than inventing one. Those two
 * rules are what keep it from overriding editorial intent - it fills a gap, it
 * does not take an opinion.
 */

/**
 * True if `title` already names `city`, ignoring case, punctuation and the
 * common abbreviations. "WDM" and "West Des Moines" are the same place to a
 * reader and to Google, and appending the long form to a title that already says
 * WDM would read as a mistake.
 */
export function titleNamesCity(title: string, city: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const t = ` ${norm(title)} `;
  const c = norm(city);
  if (!c) return false;
  if (t.includes(` ${c} `)) return true;

  // Abbreviations that appear in real titles in this dataset.
  const ALIASES: Record<string, string[]> = {
    'west des moines': ['wdm'],
    'des moines': ['dsm'],
  };
  return (ALIASES[c] || []).some((a) => t.includes(` ${a} `));
}

/**
 * The title to render for an entity, qualified with its city when the title
 * does not already name one.
 *
 * Returns `title` unchanged when there is no city, when the title already names
 * it, or when the title is empty. The separator is a plain hyphen because this
 * string ends up in a <title>, an og:title and a JSON-LD `name`, and the house
 * rule is ASCII in anything a machine parses.
 */
export function qualifyTitleWithCity(
  title: string | null | undefined,
  city: string | null | undefined,
): string {
  const t = (title ?? '').trim();
  const c = (city ?? '').trim();
  if (!t || !c) return t;
  if (titleNamesCity(t, c)) return t;

  // Only qualify the entity NAME, which is the part before the first separator.
  // A generated title like "Texas Roadhouse - Steakhouse in Johnston, Iowa |
  // Menu, Hours & Reviews" already carries the city in its body; appending
  // another copy at the end would read as a stutter. titleNamesCity catches that
  // case first, so reaching here means no location is present anywhere.
  const sep = t.search(/\s[-|]\s/);
  if (sep === -1) return `${t} - ${c}`;
  return `${t.slice(0, sep)} - ${c}${t.slice(sep)}`;
}
