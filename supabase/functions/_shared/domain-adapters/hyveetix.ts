/**
 * Hy-Vee Tix (Paciolan / evenue) adapter.
 *
 * The site is a Next.js SPA behind aggressive bot detection. With the right
 * Chrome headers, the initial HTML server-renders a `__NEXT_DATA__` blob.
 * Each "list" page is one of two components:
 *
 *   - event-list: events are in `pageProps.component.props.ssrData.discovery_eventlist`
 *   - group-list: child groups are in `pageProps.component.props.groupList.CHILDGROUPLIST`
 *
 * Top-level groups (CONC, FAM, MA) are typically group-lists pointing at
 * sub-groups (Luke Bryan, Thomas Rhett, etc.) which then contain the events.
 * Team groups (AF2, WILD, NBDL) tend to be flat event-lists.
 *
 * The adapter handles three URL shapes:
 *   - `https://hyveetix.evenue.net/`            → enumerate all top-level groups
 *   - `https://hyveetix.evenue.net/list/<CODE>` → start from that group
 *   - anything containing `/event/`             → don't match (fall through to
 *     the generic scraper, which handles single event pages well via ld+json)
 */

import type { AdapterEvent, AdapterResult, DomainAdapter } from "./types.ts";

const BASE = "https://hyveetix.evenue.net";
const MAX_PAGES = 25; // safety budget — 8 top groups + ~16 sub-groups

// Top-level groups to enumerate when no specific group is in the URL.
// Skip SEATGEEK — those events already come in via the SeatGeek adapter.
const TOP_GROUPS: { code: string; category: string }[] = [
  { code: "AF2", category: "Sports" },
  { code: "WILD", category: "Sports" },
  { code: "NBDL", category: "Sports" },
  { code: "SPT", category: "Sports" },
  { code: "IGC", category: "Sports" },
  { code: "CONC", category: "Music" },
  { code: "FAM", category: "Family" },
  { code: "MA", category: "Entertainment" },
];

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Ch-Ua":
    '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

interface PaciolanEvent {
  SSEVENTNAME?: string;
  ITEMNAME?: string;
  SEASONCD?: string;
  ITEMCD?: string;
  EVENTDT?: string; // true UTC
  EVENTDTFAC?: string; // facility-local clock, ISO-8601 with bogus "Z"
  FAC_TITLE?: string;
  PRICE?: number;
  LOGO?: string;
  SOLD_OUT?: boolean;
  EVENT_MESSAGE?: string | null;
}
interface PaciolanChildGroup {
  SUBGROUPCD?: string;
  TITLE?: string;
}
interface NextData {
  props?: {
    pageProps?: {
      component?: {
        url?: string;
        props?: {
          ssrData?: { discovery_eventlist?: PaciolanEvent[] };
          groupList?: { CHILDGROUPLIST?: PaciolanChildGroup[] };
        };
      };
    };
  };
}

export const hyveetixAdapter: DomainAdapter = {
  name: "hyveetix",

  matches(url: string): boolean {
    const lower = url.toLowerCase();
    if (!lower.includes("hyveetix.evenue.net")) return false;
    if (/\/event\//i.test(url)) return false; // single-event pages fall through
    return true;
  },

  supports(category: string): boolean {
    return category === "events";
  },

  async fetch(url: string, _category: string): Promise<AdapterResult> {
    const groupMatch = url.match(/\/list\/([A-Za-z0-9_-]+)/);
    const seeds = groupMatch
      ? [{ code: groupMatch[1].toUpperCase(), category: "Entertainment" }]
      : TOP_GROUPS;

    console.log(
      `🎫 [hyveetix] Starting with ${seeds.length} seed group(s): ${
        seeds.map((s) => s.code).join(", ")
      }`,
    );

    const visited = new Set<string>();
    const queue: { code: string; category: string }[] = [...seeds];
    const items: AdapterEvent[] = [];
    const seenEvents = new Set<string>();
    let pagesFetched = 0;
    const now = Date.now();

    while (queue.length > 0 && pagesFetched < MAX_PAGES) {
      const { code, category } = queue.shift()!;
      if (visited.has(code)) continue;
      visited.add(code);
      pagesFetched++;

      const result = await fetchGroupPage(code);
      if (!result) {
        console.log(`⚠️ [hyveetix] No data for group ${code}`);
        continue;
      }

      if (result.events.length > 0) {
        let kept = 0;
        for (const evt of result.events) {
          const adapterEvent = toAdapterEvent(evt, category, now);
          if (!adapterEvent) continue;
          const key = `${evt.SEASONCD}/${evt.ITEMCD}`;
          if (seenEvents.has(key)) continue;
          seenEvents.add(key);
          items.push(adapterEvent);
          kept++;
        }
        console.log(`✅ [hyveetix] ${code}: ${kept} events`);
      } else if (result.childCodes.length > 0) {
        console.log(
          `📁 [hyveetix] ${code}: ${result.childCodes.length} child group(s)`,
        );
        for (const child of result.childCodes) {
          if (!visited.has(child)) {
            queue.push({ code: child, category });
          }
        }
      }
    }

    if (pagesFetched >= MAX_PAGES) {
      console.log(
        `⚠️ [hyveetix] Hit MAX_PAGES=${MAX_PAGES}; ${queue.length} group(s) unvisited`,
      );
    }
    console.log(
      `✅ [hyveetix] ${items.length} events from ${pagesFetched} page fetches`,
    );
    return { success: true, items, adapter: "hyveetix" };
  },
};

async function fetchGroupPage(code: string): Promise<
  { events: PaciolanEvent[]; childCodes: string[] } | null
> {
  const response = await globalThis.fetch(`${BASE}/list/${code}`, {
    headers: BROWSER_HEADERS,
  });
  if (!response.ok) return null;

  const html = await response.text();
  const match = html.match(
    /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/,
  );
  if (!match) return null;

  let data: NextData;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return null;
  }

  const componentUrl = data.props?.pageProps?.component?.url ?? "";
  const componentProps = data.props?.pageProps?.component?.props ?? {};

  if (componentUrl.includes("event-list")) {
    const events = componentProps.ssrData?.discovery_eventlist ?? [];
    return { events, childCodes: [] };
  }
  if (componentUrl.includes("group-list")) {
    const children = componentProps.groupList?.CHILDGROUPLIST ?? [];
    const codes = children
      .map((c) => c.SUBGROUPCD)
      .filter((c): c is string => typeof c === "string" && c.length > 0);
    return { events: [], childCodes: codes };
  }
  return { events: [], childCodes: [] };
}

function toAdapterEvent(
  evt: PaciolanEvent,
  category: string,
  nowMs: number,
): AdapterEvent | null {
  if (!evt.SEASONCD || !evt.ITEMCD) return null;

  const trueUtc = evt.EVENTDT ? Date.parse(evt.EVENTDT) : NaN;
  if (Number.isFinite(trueUtc) && trueUtc < nowMs) return null; // past

  // EVENTDTFAC is the facility's wall-clock time, encoded with a misleading
  // "Z" suffix. Treat the YYYY-MM-DDTHH:MM:SS portion as Central, ignoring
  // the timezone marker.
  const dateSource = evt.EVENTDTFAC ?? evt.EVENTDT ?? "";
  const localMatch = dateSource.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/,
  );
  if (!localMatch) return null;
  const date = `${localMatch[1]} ${localMatch[2]}`;

  const title = evt.SSEVENTNAME ?? evt.ITEMNAME ?? "Untitled Event";
  const description = stripHtml(evt.EVENT_MESSAGE ?? "") || `${title} at ${
    evt.FAC_TITLE ?? "Casey's Center"
  }`;

  const price = typeof evt.PRICE === "number" && evt.PRICE > 0
    ? `From $${evt.PRICE}`
    : evt.SOLD_OUT
    ? "Sold out"
    : "See website";

  return {
    title,
    description,
    date,
    location: "Des Moines, IA",
    venue: evt.FAC_TITLE ?? "Casey's Center",
    category,
    price,
    source_url: `${BASE}/event/${evt.SEASONCD}/${evt.ITEMCD}`,
    image_url: evt.LOGO ?? null,
  };
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(
    0,
    500,
  );
}
