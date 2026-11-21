/**
 * Shared types for domain-specific scraping adapters.
 *
 * Adapters bypass the generic scrape + Claude pipeline for known sites that
 * expose structured data via public APIs (e.g. statsapi.mlb.com for the Iowa
 * Cubs). They return items in the same shape the Claude extractor produces,
 * so the downstream filter/dedupe/insert pipeline is unchanged.
 */

export interface AdapterEvent {
  title: string;
  description: string;
  date: string; // "YYYY-MM-DD HH:MM:SS" in Central Time
  /**
   * True when the source gave a DATE but no start time (WEB-BE-038).
   *
   * `date` still carries a time because the column it lands in is a timestamp,
   * but that time is a placeholder and must not be shown or published. SeatGeek
   * fills its placeholder with 03:30:00, which is not a plausible showtime --
   * so a visitor reading "3:30 AM" does not think "not announced yet", they
   * think the listing is broken.
   */
  time_tbd?: boolean;
  location: string;
  venue: string;
  category: string;
  price?: string;
  source_url?: string;
  image_url?: string | null;
  /**
   * Coordinates the SOURCE published (Catch Des Moines ld+json geo). Used at
   * ingest only when no known venue matched: a known venue's pair is curated,
   * this one is whatever the listing's editor pinned. Both or neither.
   */
  latitude?: number;
  longitude?: number;
}

export interface AdapterResult {
  success: boolean;
  items: AdapterEvent[];
  adapter: string;
  error?: string;
  /**
   * Listings the adapter found but did not fetch because the caller said they
   * are already stored (AdapterFetchOptions.knownSourceIds). A run that skips
   * everything it found returns zero items and is still a success: the
   * dispatcher must not read that as "this adapter does not apply" and hand
   * the URL to the Browserless + Claude path.
   */
  skippedKnown?: number;
  /**
   * How far a paginated adapter read this run (WEB-BE-051). Callers copy it
   * into the run ledger's metadata as `listing`; adapters without a list walk
   * leave it out.
   */
  listing?: AdapterListingReport;
}

/** Why a list walk ended. Same words the Python crawler's listingStop uses. */
export type ListingStop = "end_of_listing" | "list_budget" | "max_pages";

export interface AdapterListingReport {
  pagesRead: number;
  pagesFailed: number;
  listingStop: ListingStop;
  /** Unique detail listings found on the list pages. */
  listed: number;
  skippedKnown: number;
  detailFetched: number;
  /** Listings found but left unread by the detail-page budget. */
  detailBudgetLeft: number;
  /** Latest Central start day among the fetched detail pages ("YYYY-MM-DD"). */
  latestFetchedDay: string | null;
  /** Today (Central) + 90 days, the day the walk is meant to reach. */
  horizonDay: string;
  reachedHorizon: boolean;
}

export interface AdapterFetchOptions {
  /**
   * Source-side ids the caller already has rows for (WEB-BE-060). An adapter
   * that understands ids skips those listings; one that does not ignores this.
   * The id's meaning is per adapter: for catchdesmoines it is the Simpleview
   * listing id from `/event/<slug>/<id>/`.
   */
  knownSourceIds?: ReadonlySet<string>;
}

export interface DomainAdapter {
  name: string;
  matches(url: string): boolean;
  supports(category: string): boolean;
  fetch(
    url: string,
    category: string,
    options?: AdapterFetchOptions,
  ): Promise<AdapterResult>;
}
