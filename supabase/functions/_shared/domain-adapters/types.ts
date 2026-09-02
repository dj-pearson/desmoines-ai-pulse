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
}

export interface AdapterResult {
  success: boolean;
  items: AdapterEvent[];
  adapter: string;
  error?: string;
}

export interface DomainAdapter {
  name: string;
  matches(url: string): boolean;
  supports(category: string): boolean;
  fetch(url: string, category: string): Promise<AdapterResult>;
}
