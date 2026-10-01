/**
 * DMI-010 — event fingerprinting and duplicate detection, declared once.
 *
 * WHY THIS MOVED, BEFORE A SECOND WRITER EXISTS RATHER THAN AFTER. The hub is
 * about to hand extracted rows to an `ingest-events` endpoint, which makes the
 * `events` table a two-producer table. A second dedup that disagrees with the
 * first is how duplicate events reach a live site, and the disagreement would
 * be invisible: both implementations return a boolean, both look right, and the
 * only symptom is the same show listed twice on a public page.
 *
 * This repo already carries the scar tissue for exactly that shape.
 * `htmlContentWindow.ts` exists, in its own header, "so the two paths can't
 * drift again" — and the extraction prompts were extracted for the same reason
 * one story earlier, at which point a SECOND copy of the sports prompt was
 * found already drifted in `ai-crawler`.
 *
 * NOTHING CHANGED IN TIERS 1-3. Their order, their thresholds and their reason
 * strings are the ones that were in `scrape-events/index.ts`, moved verbatim.
 * The reason strings in particular are load-bearing: they are written into the
 * scrape log and a reader greps for them. Tier 4 was added afterwards
 * (WEB-BE-052) and is the only addition; it runs last, so it can only catch
 * rows the three original tiers let through.
 *
 * ── THE FOUR TIERS, IN ORDER ────────────────────────────────────────────────
 *
 *   1. EXACT FINGERPRINT. Both sides must actually have one; a missing
 *      fingerprint is not a match, it is unknown.
 *   2. SAME SOURCE URL + SAME DATE + 80% TITLE SIMILARITY. Catches a listing
 *      whose title was reworded between runs.
 *   3. SAME TITLE + SAME VENUE + SAME CENTRAL CALENDAR DATE. Catches a
 *      recurring show re-listed with a slightly different start time.
 *   4. SAME NORMALIZED TITLE + SAME NORMALIZED VENUE + SAME CENTRAL CALENDAR
 *      DATE, with at most one of the two titles carrying a subtitle. Catches
 *      the same concert reported by SeatGeek, the venue and Catch Des Moines,
 *      each of which words it differently. Tiers 2 and 3 cannot: tier 2 needs
 *      one source_url on both sides, tier 3 needs the titles to be EQUAL.
 *
 * They are tried in that order and the FIRST match wins, so the reported reason
 * is the strongest one that applied rather than the last one checked.
 *
 * ── THE DATABASE AND THIS MODULE NOW AGREE (WEB-BE-036) ─────────────────────
 *
 * They did not used to. `public.events` carried a UNIQUE INDEX
 * `events_title_venue_unique` on (title, venue) with NO DATE IN IT — one row
 * per title per venue, forever — which existed in production and in no
 * migration. Measured 2026-08-29 on the first live hub ingest: of 88 extracted
 * events this module passed 60, and Postgres refused 16 of those on the
 * constraint. A batch insert is ONE statement, so the first collision lost
 * every row beside it.
 *
 * Migration 20260902000006 replaced it with `events_title_venue_date_unique`
 * on (title, venue, event_local_date), where `event_local_date` is a stored
 * generated column holding the Central-time calendar date of `date`. Tier 3
 * below keys on exactly that, so the module and the index now accept and
 * reject the same rows.
 *
 * WHAT CHANGED IN TIER 3, and why it is not a tidy-up: the old window was 24
 * HOURS, so the Symphony's Saturday-evening and Sunday-matinee performances —
 * 18 hours apart, and both required by eventSourceProfiles — collapsed into one
 * row. A calendar-date key keeps both. The reason string moved with the
 * behaviour, from `same_title_venue_within_24h` to
 * `same_title_venue_same_day`, because a log line that describes a rule the
 * code no longer applies is worse than one nobody greps for.
 *
 * `ingest-events` still inserts with ON CONFLICT DO NOTHING and still reports
 * `duplicates` (caught here) separately from `constraintDuplicates` (caught by
 * the index). The two counts should now agree; they are kept apart so that if
 * they ever diverge again, the divergence is visible rather than summed away.
 *
 * ── THE SIMILARITY FUNCTION IS POSITIONAL, AND THAT IS A KNOWN WEAKNESS ─────
 *
 * `calculateTitleSimilarity` compares character i to character i and divides by
 * the LONGER length. It is not an edit distance: "The Nutcracker" against
 * "Nutcracker" scores near zero, because every position is shifted by four. It
 * is kept exactly as it was because changing it changes which rows are written
 * to a production table, which is a behaviour change and belongs in a story that
 * measures the effect. Recorded here so the next reader knows it is a decision
 * and not an oversight.
 */

import { centralWallClockFromUtc } from "./centralTime.ts";

/**
 * How many alphanumeric characters a title must keep after its subtitle is cut
 * before that prefix is trusted to identify a show. Twelve is deliberate:
 * "comedynight" is eleven, so "Comedy Night: Bob Smith" and "Comedy Night: Sue
 * Jones" keep their subtitles and stay two events, which is correct.
 */
export const MIN_TITLE_KEY_LENGTH = 12;

export interface DedupEvent {
  title: string;
  date: Date;
  venue: string;
  source_url: string;
  fingerprint?: string;
}

export interface ExistingEvent {
  id: string;
  title: string;
  date: string;
  venue: string;
  source_url: string;
  fingerprint?: string;
}

export interface DuplicateVerdict {
  isDuplicate: boolean;
  reason?: string;
  existingEvent?: ExistingEvent;
}

/** The 80% floor tier 2 compares against. Named rather than inlined so the two
 *  writers cannot disagree about it by a decimal point. */
export const TITLE_SIMILARITY_THRESHOLD = 0.8;

/**
 * The Central-time calendar date of an instant, as YYYY-MM-DD.
 *
 * Every event in this system is a Des Moines event, so "the same day" means the
 * same day in Des Moines. Deriving it through `centralWallClockFromUtc` rather
 * than `toISOString()` matters for evening shows: 8pm CDT is already tomorrow
 * in UTC, and a UTC-keyed comparison would split a single evening's listings
 * across two days. This is the same value the `event_local_date` generated
 * column holds, so this module and the unique index agree by construction.
 */
export function centralCalendarDate(instant: Date | string): string {
  return centralWallClockFromUtc(instant).slice(0, 10);
}

/**
 * A stable identity for an event: normalized title, ISO date, normalized venue,
 * and the source DOMAIN rather than the full url — two links to the same show
 * on the same site are the same show.
 */
export function generateEventFingerprint(event: {
  title: string;
  date: Date;
  venue: string;
  source_url: string;
}): string {
  const normalizedTitle = event.title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .substring(0, 50);

  const normalizedVenue = event.venue
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .substring(0, 30);

  const dateString = event.date.toISOString().split("T")[0];
  const domain = event.source_url.replace(/^https?:\/\//, "").split("/")[0];

  return `${normalizedTitle}_${dateString}_${normalizedVenue}_${domain}`;
}

/**
 * Positional character overlap over the LONGER of the two strings.
 *
 * Not an edit distance — see the header. Kept byte-identical to what shipped.
 */
export function calculateTitleSimilarity(title1: string, title2: string): number {
  const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, "");
  const norm1 = normalize(title1);
  const norm2 = normalize(title2);

  if (norm1.length === 0 || norm2.length === 0) return 0;

  const minLength = Math.min(norm1.length, norm2.length);
  const maxLength = Math.max(norm1.length, norm2.length);

  let matches = 0;
  for (let i = 0; i < minLength; i++) {
    if (norm1[i] === norm2[i]) matches++;
  }

  return matches / maxLength;
}

/**
 * A title reduced to the part that identifies the SHOW (WEB-BE-052).
 *
 * The same concert arrives from three sources with three titles: SeatGeek
 * lists "George Thorogood & The Destroyers", the venue lists
 * "George Thorogood & The Destroyers: The Baddest Show on Earth", and Catch
 * Des Moines lists it with a promoter prefix. Tier 3 below compares titles for
 * EQUALITY, so all three stay separate rows.
 *
 * Returns { key, hadSubtitle }. The flag matters as much as the key - see
 * isDuplicateEvent's tier 4 for why merging two differently-subtitled titles
 * is the over-merge this must not do.
 */
export function normalizeEventTitle(title: string): { key: string; hadSubtitle: boolean } {
  let work = (title || "").toLowerCase().trim();

  // "Live Nation presents: X" / "AEG Presents X" - the promoter is not the show.
  work = work.replace(/^.{1,30}?\spresents:?\s+/, "");

  // The subtitle after the first colon or spaced dash. Cut only when what comes
  // BEFORE it is long enough to identify something on its own: "DMSO: Remix" must
  // not collapse to "dmso".
  const cut = work.search(/\s*[:\u2013\u2014]\s|\s+-\s+/);
  let hadSubtitle = false;
  if (cut > 0) {
    const head = work.slice(0, cut);
    if (head.replace(/[^a-z0-9]/g, "").length >= MIN_TITLE_KEY_LENGTH) {
      work = head;
      hadSubtitle = true;
    }
  }

  // Filler that one source adds and another does not. Whole words only, so
  // "Live Nation" and "Tourist Trap" are untouched.
  work = work.replace(/\b(live in concert|in concert|live|official|the tour|tour)\b/g, " ");

  // "&" and "and" are the same word, and stripping punctuation alone does not
  // make them agree: "George Thorogood & The Destroyers" reduces to
  // "georgethorogoodthedestroyers" while the venue's "...and the Destroyers"
  // reduces to "georgethorogoodandthedestroyers". Dropping the standalone word
  // makes both sides the ampersand form. Word-bounded, so "Sandra" survives.
  work = work.replace(/\band\b/g, " ");

  return { key: work.replace(/[^a-z0-9]/g, ""), hadSubtitle };
}

/**
 * A venue reduced for comparison. String-only on purpose: isDuplicateEvent is
 * synchronous and the known-venue alias table (knownVenues.ts) needs a database
 * round trip, so "Wells Fargo Arena" and "Wells Fargo Arena - Des Moines" match
 * here while a genuine alias pair like "Hoyt Sherman" and "Hoyt Sherman Place"
 * does not. Aliasing belongs in the weekly dedupe-content merge (AC3), which
 * has a client.
 */
export function normalizeVenueName(venue: string): string {
  return (venue || "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\s+-\s+.*$/, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Is `newEvent` already in `existingEvents`?
 *
 * Returns the REASON as well as the verdict, because "this was a duplicate" and
 * "this was a duplicate because something 24 hours away shared its title and
 * venue" call for different amounts of trust from whoever reads the log.
 */
export function isDuplicateEvent(
  newEvent: DedupEvent,
  existingEvents: ExistingEvent[],
): DuplicateVerdict {
  for (const existing of existingEvents) {
    // 1. Exact fingerprint match (most reliable). BOTH sides must have one —
    //    two missing fingerprints are not equal, they are unknown.
    if (
      newEvent.fingerprint &&
      existing.fingerprint &&
      newEvent.fingerprint === existing.fingerprint
    ) {
      return {
        isDuplicate: true,
        reason: "exact_fingerprint_match",
        existingEvent: existing,
      };
    }

    // 2. Same source URL, same date, similar title.
    if (existing.source_url === newEvent.source_url) {
      const existingDate = new Date(existing.date);
      const sameDate = existingDate.toDateString() === newEvent.date.toDateString();

      if (sameDate) {
        const titleSimilarity = calculateTitleSimilarity(newEvent.title, existing.title);

        if (titleSimilarity > TITLE_SIMILARITY_THRESHOLD) {
          return {
            isDuplicate: true,
            reason: "same_source_date_similar_title",
            existingEvent: existing,
          };
        }
      }
    }

    // 3. Same title, same venue, same Central calendar date — the key the
    //    database enforces (events_title_venue_date_unique) and the one
    //    crawlers/catchdesmoines_crawler.py has always used.
    const titleMatch = newEvent.title.toLowerCase().trim() === existing.title.toLowerCase().trim();
    const venueMatch = newEvent.venue.toLowerCase().trim() === existing.venue.toLowerCase().trim();

    if (titleMatch && venueMatch) {
      if (centralCalendarDate(newEvent.date) === centralCalendarDate(existing.date)) {
        return {
          isDuplicate: true,
          reason: "same_title_venue_same_day",
          existingEvent: existing,
        };
      }
    }

    // 4. Same show, different source's wording (WEB-BE-052). Tier 3 requires
    //    the titles to be EQUAL, so a subtitle or a promoter prefix one source
    //    adds keeps the same concert as two rows.
    //
    //    AT MOST ONE SUBTITLE. This is the whole safety of the tier: a plain
    //    title matching a subtitled one is the same show described twice
    //    ("George Thorogood & The Destroyers" / "...: The Baddest Show on
    //    Earth"), while TWO different subtitles under one prefix are usually
    //    two events in a series ("Comedy Night: Bob" / "Comedy Night: Sue").
    //    Merging those would delete a real event from the site, which is worse
    //    than listing one twice.
    const newTitle = normalizeEventTitle(newEvent.title);
    const oldTitle = normalizeEventTitle(existing.title);

    if (
      newTitle.key.length >= MIN_TITLE_KEY_LENGTH &&
      newTitle.key === oldTitle.key &&
      !(newTitle.hadSubtitle && oldTitle.hadSubtitle) &&
      normalizeVenueName(newEvent.venue) === normalizeVenueName(existing.venue) &&
      centralCalendarDate(newEvent.date) === centralCalendarDate(existing.date)
    ) {
      return {
        isDuplicate: true,
        reason: "normalized_title_venue_same_day",
        existingEvent: existing,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * isDuplicateEvent over a set bucketed by Central calendar day, for writers
 * that check hundreds of items against thousands of rows.
 *
 * Every tier either compares Central days directly (3, 4) or compares UTC days
 * (1 via the fingerprint, 2 via toDateString), and a UTC day never straddles
 * more than two Central days - so only the item's own day and its neighbours
 * can hold a match, and the verdict is identical to a scan of the whole list.
 *
 * `add` exists for the rows a run inserts: the same event reaching one run
 * twice (JSON-LD and the model both reading one page) must collapse against
 * the first copy, which is not in the database yet.
 */
export interface DedupIndex<T extends ExistingEvent = ExistingEvent> {
  find(newEvent: DedupEvent): DuplicateVerdict & { existingEvent?: T };
  add(event: T): void;
  readonly size: number;
}

export function createDedupIndex<T extends ExistingEvent>(existing: T[]): DedupIndex<T> {
  const buckets = new Map<string, T[]>();
  let size = 0;

  const add = (event: T) => {
    const day = centralCalendarDate(event.date);
    const bucket = buckets.get(day);
    if (bucket) bucket.push(event);
    else buckets.set(day, [event]);
    size++;
  };

  const neighbours = (instant: Date): string[] => {
    const day = centralCalendarDate(instant);
    const [y, m, d] = day.split("-").map(Number);
    const shift = (n: number) => new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
    return [shift(-1), day, shift(1)];
  };

  for (const e of existing) add(e);

  return {
    find(newEvent) {
      const candidates = neighbours(newEvent.date).flatMap((d) => buckets.get(d) ?? []);
      return isDuplicateEvent(newEvent, candidates) as DuplicateVerdict & { existingEvent?: T };
    },
    add,
    get size() {
      return size;
    },
  };
}
