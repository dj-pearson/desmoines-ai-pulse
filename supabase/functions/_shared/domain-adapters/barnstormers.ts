/**
 * Iowa Barnstormers (IFL) adapter.
 *
 * The Barnstormers' site is built on PrestoSports — schedule pages render
 * the games as HTML cards server-side, but the date format shown to humans
 * ("Fri. 22") doesn't include the month. The reliable source of truth is the
 * "Live stats" link on each card: its `href` contains a YYYYMMDD slug and
 * its `aria-label` contains the full date + time in a stable format.
 *
 * Matches any URL on theiowabarnstormers.com; returns 0 items for non-
 * schedule pages so the dispatcher falls through to the generic scraper.
 */

import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";
import type { AdapterEvent, AdapterResult, DomainAdapter } from "./types.ts";

const TICKETS_URL = "https://theiowabarnstormers.com/tickets";

export const barnstormersAdapter: DomainAdapter = {
  name: "iowa-barnstormers",

  matches(url: string): boolean {
    return url.toLowerCase().includes("theiowabarnstormers.com");
  },

  supports(category: string): boolean {
    return category === "events";
  },

  async fetch(url: string, _category: string): Promise<AdapterResult> {
    console.log(`🏈 [iowa-barnstormers] Fetching ${url}`);

    const response = await globalThis.fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    if (!response.ok) {
      return {
        success: false,
        items: [],
        adapter: "iowa-barnstormers",
        error: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc) {
      return {
        success: false,
        items: [],
        adapter: "iowa-barnstormers",
        error: "Failed to parse HTML",
      };
    }

    const cards = doc.querySelectorAll(".event-row.home.upcoming");
    const items: AdapterEvent[] = [];
    let skippedNoDate = 0;

    for (const card of cards) {
      const opponent =
        (card as Element).querySelector(".team-name")?.textContent?.trim() ??
          "Opponent TBD";

      const venueText =
        (card as Element).querySelector(".venue")?.textContent?.trim()
          .replace(/\s+/g, " ") ?? "";
      const venue = venueText || "Casey's Center";

      const link = (card as Element).querySelector(
        'a[aria-label^="Football event"]',
      );
      if (!link) {
        skippedNoDate++;
        continue;
      }

      const href = link.getAttribute("href") ?? "";
      const aria = link.getAttribute("aria-label") ?? "";

      const dateMatch = href.match(/\/boxscores\/(\d{4})(\d{2})(\d{2})_/);
      if (!dateMatch) {
        skippedNoDate++;
        continue;
      }
      const [, year, month, day] = dateMatch;

      let hour = 19;
      let minute = 0;
      const timeMatch = aria.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (timeMatch) {
        hour = parseInt(timeMatch[1], 10);
        minute = parseInt(timeMatch[2], 10);
        const period = timeMatch[3].toUpperCase();
        if (period === "PM" && hour < 12) hour += 12;
        if (period === "AM" && hour === 12) hour = 0;
      }

      const date = `${year}-${month}-${day} ${pad(hour)}:${pad(minute)}:00`;

      items.push({
        title: `Iowa Barnstormers vs ${opponent}`,
        description: `Indoor Football League game at ${venue}`,
        date,
        location: "Des Moines, IA",
        venue,
        category: "Sports",
        price: "See website",
        source_url: TICKETS_URL,
        image_url: null,
      });
    }

    if (skippedNoDate > 0) {
      console.log(
        `⚠️ [iowa-barnstormers] Skipped ${skippedNoDate} card(s) with no parseable date`,
      );
    }
    console.log(
      `✅ [iowa-barnstormers] ${items.length} upcoming home games`,
    );
    return { success: true, items, adapter: "iowa-barnstormers" };
  },
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// deno-dom returns `Element | null` typed as `unknown` from the wasm import.
// Re-declare the minimal interface we use so the type checker is happy.
interface Element {
  querySelector(selector: string): Element | null;
  querySelectorAll(selector: string): NodeListOf<Element>;
  getAttribute(name: string): string | null;
  textContent: string | null;
}
interface NodeListOf<T> extends ArrayLike<T> {
  [Symbol.iterator](): IterableIterator<T>;
}
