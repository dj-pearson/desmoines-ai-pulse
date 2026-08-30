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
 * NOTHING HERE CHANGED. The three tiers, their order, their thresholds and their
 * reason strings are the ones that were in `scrape-events/index.ts`, moved
 * verbatim. The reason strings in particular are load-bearing: they are written
 * into the scrape log and a reader greps for them.
 *
 * ── THE THREE TIERS, IN ORDER ───────────────────────────────────────────────
 *
 *   1. EXACT FINGERPRINT. Both sides must actually have one; a missing
 *      fingerprint is not a match, it is unknown.
 *   2. SAME SOURCE URL + SAME DATE + 80% TITLE SIMILARITY. Catches a listing
 *      whose title was reworded between runs.
 *   3. SAME TITLE + SAME VENUE, WITHIN 24 HOURS. Catches a recurring show
 *      re-listed with a slightly different start time.
 *
 * They are tried in that order and the FIRST match wins, so the reported reason
 * is the strongest one that applied rather than the last one checked.
 *
 * ── THE DATABASE IS STRICTER THAN THIS MODULE, AND IT WINS ──────────────────
 *
 * `public.events` carries a UNIQUE INDEX `events_title_venue_unique` on
 * (title, venue) with NO DATE IN IT: one row per title per venue, forever.
 * Tier 3 above is looser — it treats the same title and venue more than 24
 * hours apart as a different event, which is right for a weekly residency and
 * is not what this schema permits.
 *
 * Measured 2026-08-29 on the first live hub ingest: of 88 extracted events this
 * module passed 60, and Postgres refused 16 of those on the constraint. A batch
 * insert is ONE statement, so the first collision lost every row beside it.
 *
 * `ingest-events` therefore inserts with ON CONFLICT DO NOTHING and reports the
 * two counts SEPARATELY — `duplicates` from here, `constraintDuplicates` from
 * the index. The disagreement is REPORTED, not resolved: loosening the
 * constraint changes what the live site shows, and tightening this module to
 * match would merge a real weekly series into one row. Which is correct is an
 * operator decision, and neither is made silently.
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

/** How close two same-title, same-venue events must be to be one event. */
export const RECURRING_WINDOW_HOURS = 24;

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

    // 3. Same title, same venue, date within 24 hours (for recurring events).
    const titleMatch = newEvent.title.toLowerCase().trim() === existing.title.toLowerCase().trim();
    const venueMatch = newEvent.venue.toLowerCase().trim() === existing.venue.toLowerCase().trim();

    if (titleMatch && venueMatch) {
      const existingDate = new Date(existing.date);
      const timeDiff = Math.abs(newEvent.date.getTime() - existingDate.getTime());
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      if (hoursDiff < RECURRING_WINDOW_HOURS) {
        return {
          isDuplicate: true,
          reason: "same_title_venue_within_24h",
          existingEvent: existing,
        };
      }
    }
  }

  return { isDuplicate: false };
}
