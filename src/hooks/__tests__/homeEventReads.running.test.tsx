import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Four event reads used a bare `date >= now` floor with no end_date arm
 * (WEB-FEAT-062): the home "Trending" fallback (useTrending), the anonymous
 * For You rail (fetchTrendingRows), a team page's games (useTeamGames) and
 * the "nearby" rails (useNearbyListings).
 * On the third morning of the State Fair none of them listed the fair, a
 * game lost its row the moment it started, and an untimed event (stored at
 * the 19:31:58 sentinel) vanished at 7:31 PM on its own day.
 *
 * The mock evaluates the filters each read sends, including nested
 * `and(...)`/`or(...)` groups, against fixture rows, so the assertions are on
 * which rows come back, not on a filter string.
 */

type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;
type Pred = (row: Row) => boolean;

let rows: Row[] = [];

function like(cell: Cell, pattern: string): boolean {
  const needle = pattern.replace(/^%|%$/g, "").toLowerCase();
  return typeof cell === "string" && cell.toLowerCase().includes(needle);
}

function cmp(cell: Cell, op: string, raw: string): boolean {
  if (op === "eq") return String(cell) === raw;
  if (op === "neq") return String(cell) !== raw;
  if (op === "is") return raw === "null" ? cell == null : String(cell) === raw;
  if (op === "ilike") return like(cell, raw);
  if (cell == null) return false;
  // Coordinates compare as numbers, timestamps as instants.
  const a = typeof cell === "number" ? cell : Date.parse(String(cell));
  const b = typeof cell === "number" ? Number(raw) : Date.parse(raw);
  if (op === "gte") return a >= b;
  if (op === "lte") return a <= b;
  if (op === "lt") return a < b;
  if (op === "gt") return a > b;
  throw new Error(`unsupported op ${op}`);
}

/** Split on commas that are not inside parentheses. */
function splitTop(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** One PostgREST logic-tree term: `and(...)`, `or(...)` or `col.op.value`. */
function term(t: string): Pred {
  const group = /^(and|or)\((.*)\)$/.exec(t);
  if (group) {
    const parts = splitTop(group[2]).map(term);
    return group[1] === "and" ? (r) => parts.every((p) => p(r)) : (r) => parts.some((p) => p(r));
  }
  const [col, op, ...rest] = t.split(".");
  return (r) => cmp(r[col], op, rest.join("."));
}

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const preds: Pred[] = [];
    let limit = Infinity;
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.order = () => c;
    c.in = () => c;
    c.limit = (n: number) => {
      limit = n;
      return c;
    };
    for (const op of ["eq", "neq", "is", "gte", "lte", "lt", "gt", "ilike"]) {
      c[op] = (col: string, v: unknown) => {
        preds.push((r) => cmp(r[col], op, String(v)));
        return c;
      };
    }
    c.or = (body: string) => {
      const parts = splitTop(body).map(term);
      preds.push((r) => parts.some((p) => p(r)));
      return c;
    };
    c.then = (resolve: (v: unknown) => unknown) => {
      const data = table === "events" ? rows.filter((r) => preds.every((p) => p(r))).slice(0, limit) : [];
      return Promise.resolve({ data, error: null }).then(resolve);
    };
    return c;
  };
  return { supabase: { from: (table: string) => chain(table), rpc: vi.fn() } };
});

const { useTrending } = await import("../useTrending");
const { fetchTrendingRows } = await import("../useForYouRail");
const { useTeamGames } = await import("../useTeams");
const { useNearbyListings } = await import("../useNearbyListings");

// Third day of the fair, 2026-08-15 at 8:00 PM CDT (01:00Z on the 16th):
// after the untimed event's 7:31 PM sentinel and after the game's first pitch.
const NOW = new Date("2026-08-16T01:00:00Z");

// The fairgrounds; every fixture sits on it so the nearby rail can see it.
const AT = { latitude: 41.5949, longitude: -93.5419 };
const visible = { is_merged: false, is_hidden: false, archived_at: null, ...AT };

const STATE_FAIR: Row = {
  id: "fair",
  title: "Iowa State Fair",
  venue: "Iowa State Fairgrounds",
  category: "Festival",
  date: "2026-08-13T14:00:00Z",
  end_date: "2026-08-24T03:00:00Z",
  trending_score: 90,
  ...visible,
};
// Untimed: stored at the 19:31:58 Central sentinel, today.
const UNTIMED_TODAY: Row = {
  id: "untimed",
  title: "Art walk",
  venue: "East Village",
  category: "Arts",
  date: "2026-08-16T00:31:58Z",
  end_date: null,
  trending_score: 50,
  ...visible,
};
// First pitch 7:05 PM CDT today, so in progress at NOW.
const GAME_UNDER_WAY: Row = {
  id: "game-now",
  title: "Iowa Cubs vs. Omaha",
  venue: "Principal Park",
  category: "Sports",
  date: "2026-08-16T00:05:00Z",
  end_date: null,
  trending_score: 40,
  ...visible,
};
const GAME_TOMORROW: Row = {
  id: "game-next",
  title: "Iowa Cubs vs. Omaha",
  venue: "Principal Park",
  category: "Sports",
  date: "2026-08-17T00:05:00Z",
  end_date: null,
  trending_score: 30,
  ...visible,
};
const GAME_YESTERDAY: Row = {
  id: "game-past",
  title: "Iowa Cubs vs. Omaha",
  venue: "Principal Park",
  category: "Sports",
  date: "2026-08-15T00:05:00Z",
  end_date: null,
  trending_score: 99,
  ...visible,
};
const LAST_YEAR_FAIR: Row = {
  id: "fair-2025",
  title: "Iowa State Fair 2025",
  venue: "Iowa State Fairgrounds",
  category: "Festival",
  date: "2025-08-07T14:00:00Z",
  end_date: "2025-08-18T03:00:00Z",
  trending_score: 95,
  ...visible,
};
const HIDDEN_RUN: Row = { ...STATE_FAIR, id: "hidden", is_hidden: true };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  rows = [STATE_FAIR, UNTIMED_TODAY, GAME_UNDER_WAY, GAME_TOMORROW, GAME_YESTERDAY, LAST_YEAR_FAIR, HIDDEN_RUN];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTrending fallback events", () => {
  it("keeps a running fair, tonight's untimed event and a game in progress; drops what is over or hidden", async () => {
    const { result } = renderHook(() => useTrending({ types: ["event"] }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    const ids = result.current.trending.events.map((e) => e.contentId);
    expect(ids).toEqual(expect.arrayContaining(["fair", "untimed", "game-now", "game-next"]));
    expect(ids).not.toContain("game-past");
    expect(ids).not.toContain("fair-2025");
    expect(ids).not.toContain("hidden");
  });
});

describe("For You rail, anonymous trending read", () => {
  it("keeps a running fair, tonight's untimed event and a game in progress; drops what is over or hidden", async () => {
    const ids = (await fetchTrendingRows(12)).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(["fair", "untimed", "game-now", "game-next"]));
    expect(ids).not.toContain("game-past");
    expect(ids).not.toContain("fair-2025");
    expect(ids).not.toContain("hidden");
  });
});

describe("useTeamGames", () => {
  it("lists the game in progress and the next one, not yesterday's", async () => {
    const { result } = renderHook(() => useTeamGames({ name: "Iowa Cubs", slug: "iowa-cubs" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const ids = (result.current.data as Row[]).map((r) => r.id);
    expect(ids).toEqual(["game-now", "game-next"]);
  });

  it("keeps the name and sports-category guard alongside the window", async () => {
    rows = [
      { ...GAME_TOMORROW, id: "scouts", title: "Iowa Cubs Scout night", category: "Community" },
      { ...STATE_FAIR, id: "fair-cubs", title: "Iowa Cubs at the State Fair", category: "Festival" },
      GAME_TOMORROW,
    ];
    const { result } = renderHook(() => useTeamGames("Iowa Cubs"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((result.current.data as Row[]).map((r) => r.id)).toEqual(["game-next"]);
  });
});

describe("useNearbyListings events", () => {
  it("links a run still going nearby, and not one-night shows that already started", async () => {
    const { result } = renderHook(() => useNearbyListings("events", AT.latitude, AT.longitude, { limit: 12 }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const ids = (result.current.data ?? []).map((r) => r.id);
    expect(ids).toContain("fair");
    expect(ids).toContain("game-next");
    // Started earlier tonight with no end_date: the rail cannot tell it is still on.
    expect(ids).not.toContain("game-now");
    expect(ids).not.toContain("untimed");
    expect(ids).not.toContain("game-past");
    expect(ids).not.toContain("fair-2025");
    expect(ids).not.toContain("hidden");
  });
});
