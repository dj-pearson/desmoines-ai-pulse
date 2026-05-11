/**
 * Iowa Cubs (MiLB Triple-A) adapter.
 *
 * Uses the public MLB Stats API instead of scraping milb.com/iowa, which is a
 * JS-heavy schedule widget that often returns empty HTML to headless browsers.
 *
 * Docs: https://statsapi.mlb.com/docs/  (sportId 11 = MiLB Triple-A)
 */

import type { AdapterEvent, AdapterResult, DomainAdapter } from "./types.ts";

const IOWA_CUBS_TEAM_ID = 451;
const TRIPLE_A_SPORT_ID = 11;
const TICKETS_URL = "https://www.milb.com/iowa/tickets/single-game-tickets";

interface StatsApiTeam {
  id?: number;
  name?: string;
}
interface StatsApiGame {
  gameDate?: string;
  status?: { abstractGameState?: string; detailedState?: string };
  teams?: {
    home?: { team?: StatsApiTeam };
    away?: { team?: StatsApiTeam };
  };
  venue?: { name?: string };
}
interface StatsApiResponse {
  dates?: { date: string; games?: StatsApiGame[] }[];
}

export const milbAdapter: DomainAdapter = {
  name: "milb-iowa-cubs",

  matches(url: string): boolean {
    return url.toLowerCase().includes("milb.com/iowa");
  },

  supports(category: string): boolean {
    return category === "events";
  },

  async fetch(url: string, _category: string): Promise<AdapterResult> {
    const year = extractSeasonYear(url) ?? new Date().getFullYear();

    const apiUrl =
      `https://statsapi.mlb.com/api/v1/schedule` +
      `?sportId=${TRIPLE_A_SPORT_ID}` +
      `&teamId=${IOWA_CUBS_TEAM_ID}` +
      `&startDate=${year}-01-01` +
      `&endDate=${year}-12-31` +
      `&hydrate=team,venue`;

    console.log(`⚾ [milb-iowa-cubs] Fetching ${year} schedule from statsapi.mlb.com`);

    const response = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return {
        success: false,
        items: [],
        adapter: "milb-iowa-cubs",
        error: `statsapi.mlb.com returned ${response.status}`,
      };
    }

    const data = (await response.json()) as StatsApiResponse;
    const items: AdapterEvent[] = [];

    for (const dateEntry of data.dates ?? []) {
      for (const game of dateEntry.games ?? []) {
        if (game.teams?.home?.team?.id !== IOWA_CUBS_TEAM_ID) continue;

        const state = game.status?.abstractGameState ?? "";
        if (state === "Final") continue;

        const opponent = game.teams?.away?.team?.name ?? "Opponent TBD";
        const venueName = game.venue?.name ?? "Principal Park";
        const gameDateUtc = game.gameDate;
        if (!gameDateUtc) continue;

        items.push({
          title: `Iowa Cubs vs ${opponent}`,
          description: `Triple-A baseball at ${venueName}`,
          date: formatCentralTime(gameDateUtc),
          location: "Des Moines, IA",
          venue: venueName,
          category: "Sports",
          price: "See website",
          source_url: TICKETS_URL,
          image_url: null,
        });
      }
    }

    console.log(`✅ [milb-iowa-cubs] ${items.length} upcoming home games`);
    return { success: true, items, adapter: "milb-iowa-cubs" };
  },
};

function extractSeasonYear(url: string): number | null {
  const match = url.match(/\/(\d{4})(?:\/|$)/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  return year >= 2020 && year <= 2099 ? year : null;
}

function formatCentralTime(isoUtc: string): string {
  const d = new Date(isoUtc);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}
