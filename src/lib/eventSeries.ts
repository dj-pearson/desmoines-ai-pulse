/**
 * Annual event series (SEO-043).
 *
 * People search an annual event by name and year: "cloris awards 2026" sits at
 * position 4.4, "rainbow safari blank park zoo" earns 15.8% CTR. Each year's
 * edition is a dated row with a dated URL (/events/panda-fest-2026-2026-10-02),
 * and that URL is hidden by the stale sweep a few days after the event, so
 * whatever it earned in search starts from zero again next year. A series page,
 * /events/series/<slug>, is the URL that survives: it lists the current or next
 * dated edition and the past ones by year, read from the same `events` rows.
 *
 * WHY A MAPPING IN CODE AND NOT A TABLE. The 20 series are an editorial pick
 * (ranked from Search Console, checked by hand to be annual), and a pick
 * belongs in review, not in a row nobody sees change. Everything that decays
 * stays in the database: membership is derived at read time by matching
 * normalised titles, so next year's row joins its series the day the crawler
 * stores it, with no edit here. A table would add a migration, RLS, regenerated
 * types and an admin screen for 20 rows that change once a year. If the list
 * grows past hand-maintenance, the shape below is the table's shape.
 *
 * NO `@/` IMPORTS. scripts/generate-dynamic-sitemaps.ts loads this file under
 * tsx, which does not resolve the app's path alias (same rule as monthPages.ts).
 * Selection, which needs eventTiming, lives in eventSeriesView.ts.
 *
 * NO DATES IN THIS FILE, deliberately (compare src/lib/annualEvents.ts, which
 * holds dates and needs check-annual-dates.mjs to stop them going stale). A
 * date here would be a date the data did not give us.
 */

export interface EventSeriesDef {
  /** URL segment under /events/series/. Never rename: it is a public URL. */
  slug: string;
  /** Display name, without a year. */
  name: string;
  /**
   * Normalised titles (see normaliseEventTitle) that belong to this series. A
   * row matches when its normalised title equals an alias or starts with
   * alias + " ", so "Jazz in July 2026: Night 3" matches "jazz in july".
   */
  aliases: readonly string[];
  /**
   * Lowercase fragments, one of which must appear in the row's venue or
   * location. Only for names other events also use ("Pumpkin Fest", "Family
   * Halloween").
   */
  venueIncludes?: readonly string[];
  /**
   * The organiser's host. The official link shown on the page is a stored
   * source_url on this host, never a URL typed here, so a series whose rows
   * only point at ticket resellers shows none.
   */
  officialHost?: string;
  /** One evergreen sentence, from the rows' own descriptions. No dates. */
  about: string;
}

/**
 * Ranked by Search Console impressions on the dated URLs plus the name
 * queries (2026-09-30 export), keeping only series the data shows to be annual:
 * a year or edition in the title ("11th Annual", "2026"), "annual" or "each
 * October" in the description, or an organiser that runs it every year.
 * Prairie Trail Labor Day Fest (79 impressions) is left out: its own listing
 * calls 2026 the inaugural year. The Iowa State Fair is left out because
 * /iowa-state-fair already is its series page.
 */
export const EVENT_SERIES: readonly EventSeriesDef[] = [
  {
    slug: "panda-fest",
    name: "Panda Fest",
    aliases: ["panda fest", "pandafest"],
    officialHost: "pandafests.com",
    about: "A national Asian street food festival that stops in Des Moines, with more than 70 food vendors.",
  },
  {
    slug: "cloris-awards",
    name: "Cloris Awards",
    aliases: ["cloris awards"],
    officialHost: "clorisawards.com",
    about: "The annual Cloris Awards ceremony, held at Drake University.",
  },
  {
    slug: "farmstasia",
    name: "Farmstasia",
    aliases: ["farmstasia"],
    officialHost: "lhf.org",
    about: "Living History Farms' annual fundraiser, with food, drinks, live music and a silent auction.",
  },
  {
    slug: "jazz-in-july",
    name: "Jazz in July",
    aliases: ["jazz in july"],
    venueIncludes: ["hoyt sherman"],
    officialHost: "hoytsherman.org",
    about: "A run of jazz nights at Hoyt Sherman Place, one each week in July.",
  },
  {
    slug: "cityview-martini-fest",
    name: "CITYVIEW Martini Fest",
    aliases: ["cityview martini fest"],
    about: "CITYVIEW's evening martini festival at West Glen Town Center.",
  },
  {
    slug: "rainbow-safari",
    name: "Rainbow Safari",
    aliases: ["rainbow safari"],
    venueIncludes: ["blank park zoo"],
    officialHost: "capitalcitypride.org",
    about: "Capital City Pride's annual evening of family activities at Blank Park Zoo.",
  },
  {
    slug: "femcity-beyond-business-conference",
    name: "FemCity Des Moines Beyond Business Conference",
    aliases: ["femcity des moines beyond business conference"],
    about: "FemCity Des Moines' yearly Beyond Business Conference.",
  },
  {
    slug: "hinterland-music-festival",
    name: "Hinterland Music Festival",
    aliases: ["hinterland music festival"],
    officialHost: "hinterlandiowa.com",
    about: "A multi-day outdoor music festival at the Avenue of the Saints Amphitheater in St. Charles, Iowa.",
  },
  {
    slug: "living-history-farms-race",
    name: "Living History Farms Race",
    aliases: ["living history farms race"],
    officialHost: "lhf.org",
    about: "A five-mile run across the grounds of Living History Farms.",
  },
  {
    slug: "living-history-farms-family-halloween",
    name: "Family Halloween at Living History Farms",
    aliases: ["family halloween"],
    venueIncludes: ["living history farms"],
    officialHost: "lhf.org",
    about: "One weekend of trick-or-treating through the historic town at Living History Farms.",
  },
  {
    slug: "head-of-the-des-moines-regatta",
    name: "Head of the Des Moines Regatta",
    aliases: ["head of the des moines regatta"],
    officialHost: "desmoinesrowing.org",
    about: "A rowing regatta run by Des Moines Rowing, sponsored by Above & Beyond Cancer.",
  },
  {
    slug: "forever-in-love-bridal-show",
    name: "Forever in Love Bridal Show",
    aliases: ["forever in love bridal show"],
    about: "A free-admission bridal show with wedding vendors and giveaways.",
  },
  {
    slug: "center-grove-orchard-pumpkin-fest",
    name: "Pumpkin Fest at Center Grove Orchard",
    aliases: ["pumpkin fest"],
    venueIncludes: ["center grove"],
    officialHost: "centergroveorchard.com",
    about: "Center Grove Orchard's autumn season of pumpkins and farm activities, its biggest event of the year.",
  },
  {
    slug: "beaverdale-fall-festival",
    name: "Beaverdale Fall Festival",
    aliases: ["beaverdale fall festival"],
    officialHost: "fallfestival.org",
    about: "The annual fall festival in Downtown Beaverdale.",
  },
  {
    slug: "national-balloon-classic",
    name: "National Balloon Classic",
    aliases: ["national balloon classic"],
    officialHost: "nationalballoonclassic.com",
    about: "A nine-day hot air balloon event held each summer in Indianola.",
  },
  {
    slug: "eerie-evenings",
    name: "Eerie Evenings at the Botanical Garden",
    aliases: ["eerie evenings"],
    venueIncludes: ["botanical garden"],
    officialHost: "dmbotanicalgarden.com",
    about: "Each October the Greater Des Moines Botanical Garden turns its dome into a Halloween walk-through.",
  },
  {
    slug: "des-moines-holiday-boutique",
    name: "Des Moines Holiday Boutique",
    aliases: ["des moines holiday boutique"],
    officialHost: "desmoinesholidayboutique.com",
    about: "A holiday shopping show of jewelry, gourmet food and decor vendors.",
  },
  {
    slug: "des-moines-original-oktoberfest",
    name: "Des Moines' Original Oktoberfest",
    aliases: ["des moines original oktoberfest"],
    officialHost: "oktoberfestdsm.com",
    about: "An annual Oktoberfest celebration at The District at Prairie Trail in Ankeny.",
  },
  {
    slug: "taste-of-the-junction",
    name: "Taste of the Junction",
    aliases: ["taste of the junction"],
    officialHost: "tasteofthejunction.org",
    about: "A multicultural street festival in Valley Junction, West Des Moines.",
  },
  {
    slug: "des-moines-concours",
    name: "Des Moines Concours",
    aliases: ["des moines concours"],
    officialHost: "desmoinesconcours.com",
    about: "A classic car show at Pappajohn Sculpture Park, with a gala at the Krause Gateway Center.",
  },
];

export const SERIES_PATH_PREFIX = "/events/series/";

export function seriesPath(def: Pick<EventSeriesDef, "slug">): string {
  return `${SERIES_PATH_PREFIX}${def.slug}`;
}

export function getEventSeries(slug: string | null | undefined): EventSeriesDef | null {
  if (!slug) return null;
  return EVENT_SERIES.find((s) => s.slug === slug) ?? null;
}

const MONTH_WORD = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";

/**
 * A title with the parts that change every year taken out, so editions of the
 * same event compare equal.
 *
 *   "11th Annual Cloris Awards"         -> "cloris awards"
 *   "Hinterland 2026 Music Festival"    -> "hinterland music festival"
 *   "Jazz in July 2026: Night 3"        -> "jazz in july night 3"
 *   "22nd Annual Des Moines' Original Oktoberfest"
 *                                       -> "des moines original oktoberfest"
 *   "2026 Taylor Fest - (6/19)"         -> "taylor fest"
 *   "Forever in Love: Bridal Show, Sept 13" -> "forever in love bridal show"
 *
 * Stripped: four-digit years and season ranges (2025-26), numeric dates
 * (6/19), a month name followed by a day number, an ordinal before "annual" or
 * "edition" or at the start, and the words "annual" and "edition". A month
 * name on its own stays, because "Jazz in July" is a name, not a date.
 * Ordinals elsewhere stay too: "25th Anniversary Tour" names that tour.
 */
export function normaliseEventTitle(title: string | null | undefined): string {
  let t = (title ?? "").toLowerCase();
  t = t.replace(/&amp;/g, "&").replace(/&#\d+;/g, " ");
  // Apostrophes join rather than split: "Moines'" is "moines", not "moines s".
  t = t.replace(/['\u2018\u2019`]/g, "");
  t = t.replace(/\b(?:19|20)\d{2}(?:\s*[-/]\s*(?:(?:19|20)\d{2}|\d{2}))?\b/g, " ");
  t = t.replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ");
  t = t.replace(new RegExp(`\\b${MONTH_WORD}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "g"), " ");
  t = t.replace(/\b\d+(?:st|nd|rd|th)\s+(?=(?:annual|edition)\b)/g, " ");
  t = t.replace(/^\s*\d+(?:st|nd|rd|th)\s+/, " ");
  t = t.replace(/\b(?:annual|edition)\b/g, " ");
  return t.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export interface SeriesMatchInput {
  title?: string | null;
  venue?: string | null;
  location?: string | null;
}

function aliasMatches(normalised: string, alias: string): boolean {
  return normalised === alias || normalised.startsWith(`${alias} `);
}

/**
 * The series a row belongs to, or null. A venue-qualified series needs a venue
 * fragment; with no venue known at all (a bare slug, see seriesForSlug) those
 * series never match, because "Pumpkin Fest" alone could be any farm's.
 */
export function seriesForEvent(row: SeriesMatchInput): EventSeriesDef | null {
  const normalised = normaliseEventTitle(row.title);
  if (!normalised) return null;
  const place = `${row.venue ?? ""} ${row.location ?? ""}`.toLowerCase();
  for (const def of EVENT_SERIES) {
    if (!def.aliases.some((alias) => aliasMatches(normalised, alias))) continue;
    if (def.venueIncludes && !def.venueIncludes.some((v) => place.includes(v))) continue;
    return def;
  }
  return null;
}

/** The series with at least one row among `events`, in EVENT_SERIES order. */
export function seriesAmong(events: readonly SeriesMatchInput[]): EventSeriesDef[] {
  const found = new Set<string>();
  for (const event of events) {
    const def = seriesForEvent(event);
    if (def) found.add(def.slug);
  }
  return EVENT_SERIES.filter((s) => found.has(s.slug));
}

/**
 * The series an event URL's slug belongs to, for the not-found page a hidden
 * past edition now serves. The date suffix is dropped and hyphens read as
 * spaces; venue-qualified series cannot match (no venue in a slug).
 */
export function seriesForSlug(slug: string | null | undefined): EventSeriesDef | null {
  if (!slug) return null;
  const title = slug.replace(/-\d{4}-\d{2}-\d{2}$/, "").replace(/-/g, " ");
  return seriesForEvent({ title });
}

/**
 * ilike patterns for one series, for a PostgREST or() filter: each alias with
 * its words joined by `*`, so "des moines original oktoberfest" also finds
 * "Des Moines' Original Oktoberfest" and "panda fest" finds "PandaFest". The
 * database narrows; seriesForEvent decides. Aliases are [a-z0-9 ] only, so
 * nothing here can break out of the filter.
 */
export function seriesTitlePatterns(def: EventSeriesDef): string[] {
  return def.aliases.map((alias) => `title.ilike.*${alias.split(" ").join("*")}*`);
}

/** The same patterns for every series, for one query that covers them all. */
export function allSeriesTitlePatterns(): string[] {
  return EVENT_SERIES.flatMap(seriesTitlePatterns);
}

/** Host of a URL without "www.", or null. */
function hostOf(url: string | null | undefined): string | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * The organiser's link for a series: the first stored source_url (callers pass
 * rows newest first) on the series' officialHost, skipping any the link
 * checker flagged. Null when the data has none.
 */
export function officialSeriesUrl(
  def: EventSeriesDef,
  rows: ReadonlyArray<{ source_url?: string | null; source_url_broken?: boolean | null }>,
): string | null {
  if (!def.officialHost) return null;
  const host = def.officialHost.toLowerCase();
  for (const row of rows) {
    if (row.source_url_broken) continue;
    const h = hostOf(row.source_url);
    if (h && (h === host || h.endsWith(`.${host}`))) return row.source_url as string;
  }
  return null;
}
