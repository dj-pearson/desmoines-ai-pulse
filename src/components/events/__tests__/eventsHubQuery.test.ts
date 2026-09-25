import { describe, it, expect, vi } from "vitest";

// A supabase stand-in the near-me test fills in; everything else never calls it.
const mockSupabase = vi.hoisted(() => ({}) as Record<string, unknown>);
vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

import {
  applyHubFilters,
  applyHubSort,
  countLabel,
  dayHeading,
  fetchNearMe,
  flattenPages,
  groupByCentralDay,
  hubSearchQuery,
  inHubWindow,
  isNotOver,
  nearMeCountLabel,
  notOverFilter,
  relativeStartLabel,
  resolveHubDate,
  selectTonight,
  stripHeading,
  NEAR_ME_LIMIT,
  type HubEvent,
  type HubFilters,
  type HubPage,
} from "../eventsHubQuery";
import { findEventArea } from "@/lib/eventAreas";
import { FREE_PRICE_FILTER } from "@/lib/eventPrice";

/**
 * Events plan WP1: the hub's Central-time bounds, one-navigation filters,
 * append-and-dedupe paging, the Tonight strip's selection and day grouping.
 */

// Thu 2026-09-24 21:00 CDT.
const THU_9PM = new Date("2026-09-25T02:00:00Z");
// Sat 2026-09-26 20:30 CDT.
const SAT_830PM = new Date("2026-09-27T01:30:00Z");
// Fri 2026-09-25 20:00 CDT, the plan's acceptance clock.
const FRI25_8PM = new Date("2026-09-26T01:00:00Z");
// Fri 2026-09-25 18:50 CDT.
const FRI25_650PM = new Date("2026-09-25T23:50:00Z");
// Fri 2026-09-25 19:31:58 CDT: the no-time marker for that day.
const FRI25_MARKER = "2026-09-26T00:31:58.000Z";

type Call = [string, unknown[]];

function fakeQuery() {
  const calls: Call[] = [];
  const builder: Record<string, unknown> & { calls: Call[] } = { calls };
  for (const m of ["neq", "is", "ilike", "gte", "lte", "eq", "or", "textSearch", "order", "in"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return builder;
    };
  }
  return builder as typeof builder & { neq: unknown; is: unknown; ilike: unknown; gte: unknown; lte: unknown; order: unknown };
}

const BASE: HubFilters = {
  search: "",
  category: "all",
  window: null,
  area: undefined,
  freeOnly: false,
  sort: "date_asc",
};

function ev(id: string, start: string, extra: Partial<HubEvent> = {}): HubEvent {
  return {
    id,
    title: id,
    date: start,
    event_start_utc: start,
    location: "",
    category: "Music",
    ...extra,
  } as HubEvent;
}

describe("resolveHubDate", () => {
  it("today at 9pm Thursday is Thursday in Central, not Friday UTC", () => {
    const r = resolveHubDate("today", null, null, THU_9PM);
    expect(r?.window.startDay).toBe("2026-09-24");
    expect(r?.window.start).toBe("2026-09-24T05:00:00.000Z");
  });

  it("this weekend on a Saturday night is the current Fri-Sun", () => {
    const r = resolveHubDate("this-weekend", null, null, SAT_830PM);
    expect(r?.window.startDay).toBe("2026-09-25");
    expect(r?.window.endDay).toBe("2026-09-27");
  });

  it("accepts the old next_7_days spelling", () => {
    expect(resolveHubDate("next_7_days", null, null, THU_9PM)?.preset).toBe("next-7-days");
  });

  it("a picked day is exactly that Central day", () => {
    const r = resolveHubDate(null, "2026-10-03", null, THU_9PM);
    expect(r?.source).toBe("custom");
    expect(r?.window.start).toBe("2026-10-03T05:00:00.000Z");
    expect(r?.window.end).toBe("2026-10-04T04:59:59.999Z");
  });

  it("a range orders its ends and labels both", () => {
    const r = resolveHubDate(null, "2026-10-05", "2026-10-03", THU_9PM);
    expect(r?.window.startDay).toBe("2026-10-03");
    expect(r?.label).toBe("Oct 3 - Oct 5");
  });

  it("garbage is no date filter", () => {
    expect(resolveHubDate("someday", "not-a-date", null, THU_9PM)).toBeNull();
  });
});

describe("applyHubFilters", () => {
  it("unfiltered: visibility plus 'not over yet' (started in the last 2h, still running, or today's untimed marker)", () => {
    const q = fakeQuery();
    applyHubFilters(q, BASE, FRI25_8PM);
    expect(q.calls).toContainEqual(["neq", ["is_merged", true]]);
    expect(q.calls).toContainEqual(["is", ["archived_at", null]]);
    expect(q.calls).toContainEqual([
      "or",
      [
        `date.gte.2026-09-25T23:00:00.000Z,end_date.gte.2026-09-26T01:00:00.000Z,date.eq.${FRI25_MARKER}`,
      ],
    ]);
    expect(notOverFilter(FRI25_8PM)).toContain(`date.eq.${FRI25_MARKER}`);
  });

  it("a future window keeps festivals already running at its start, and has no 'not over' arm", () => {
    const q = fakeQuery();
    const window = resolveHubDate("tomorrow", null, null, FRI25_8PM)!.window;
    applyHubFilters(q, { ...BASE, window }, FRI25_8PM);
    expect(q.calls).toContainEqual(["lte", ["date", window.end]]);
    expect(q.calls.some(([m, a]) => m === "gte" && a[0] === "date")).toBe(false);
    const at = `"${window.start}"`;
    expect(q.calls).toContainEqual(["or", [`date.gte.${at},and(date.lt.${at},end_date.gte.${at})`]]);
  });

  it("a window holding now also drops what's over", () => {
    const q = fakeQuery();
    const window = resolveHubDate("today", null, null, FRI25_8PM)!.window;
    applyHubFilters(q, { ...BASE, window }, FRI25_8PM);
    const ors = q.calls.filter(([m]) => m === "or");
    expect(ors).toHaveLength(1);
    const arg = String(ors[0][1][0]);
    expect(arg).toContain("end_date.gte.");
    expect(arg).toContain(`or(${notOverFilter(FRI25_8PM)})`);
  });

  it("search is a prefix tsquery on the last word", () => {
    const q = fakeQuery();
    applyHubFilters(q, { ...BASE, search: "jaz" }, FRI25_8PM);
    expect(q.calls).toContainEqual(["textSearch", ["search_vector", "jaz:*", { config: "english" }]]);
  });

  it("free plus the floor nests both OR groups in one filter", () => {
    const q = fakeQuery();
    applyHubFilters(q, { ...BASE, freeOnly: true }, THU_9PM);
    const ors = q.calls.filter(([m]) => m === "or");
    expect(ors).toHaveLength(1);
    const arg = String(ors[0][1][0]);
    expect(arg.startsWith("and(or(date.gte.")).toBe(true);
    expect(arg).toContain(`or(${FREE_PRICE_FILTER})`);
    expect(arg).not.toContain("price.is.null");
  });

  it("Des Moines is a city match, not a substring that catches West Des Moines", () => {
    const q = fakeQuery();
    applyHubFilters(q, { ...BASE, area: findEventArea("des-moines") }, THU_9PM);
    expect(q.calls).toContainEqual(["ilike", ["city", "Des Moines"]]);
  });

  it("a suburb joins the one or= param instead of sending a second", () => {
    const q = fakeQuery();
    applyHubFilters(q, { ...BASE, area: findEventArea("ankeny"), freeOnly: true }, THU_9PM);
    const ors = q.calls.filter(([m]) => m === "or");
    expect(ors).toHaveLength(1);
    expect(String(ors[0][1][0])).toContain("or(city.ilike.Ankeny,and(city.is.null,");
  });

  it("a bbox area bounds latitude and longitude", () => {
    const q = fakeQuery();
    applyHubFilters(q, { ...BASE, area: findEventArea("east-village") }, THU_9PM);
    expect(q.calls.filter(([m, a]) => (m === "gte" || m === "lte") && (a[0] === "latitude" || a[0] === "longitude"))).toHaveLength(4);
  });

  it("sort always ends on id so pages are stable", () => {
    const q = fakeQuery();
    applyHubSort(q, "date_asc");
    expect(q.calls).toEqual([
      ["order", ["date", { ascending: true }]],
      ["order", ["id", { ascending: true }]],
    ]);
  });
});

describe("hubSearchQuery", () => {
  it("ANDs words, prefixes the last, strips tsquery operators", () => {
    expect(hubSearchQuery("jaz")).toEqual({ query: "jaz:*" });
    expect(hubSearchQuery("  live jaz ")).toEqual({ query: "live & jaz:*" });
    expect(hubSearchQuery("rock & roll!")).toEqual({ query: "rock & roll:*" });
    expect(hubSearchQuery("o'brien (live)")).toEqual({ query: "o & brien & live:*" });
  });

  it("quotes or OR go to websearch", () => {
    expect(hubSearchQuery('"state fair"')).toEqual({ query: '"state fair"', type: "websearch" });
    expect(hubSearchQuery("jazz OR blues")).toEqual({ query: "jazz OR blues", type: "websearch" });
  });

  it("nothing typed is no search", () => {
    expect(hubSearchQuery("   ")).toBeNull();
  });
});

describe("not over yet, at Fri 20:00 CDT", () => {
  it("an 08:00 row is out; a 19:00 row, an untimed row and a running festival are in", () => {
    const morning = ev("yoga", "2026-09-25T13:00:00Z"); // 08:00 CDT
    const evening = ev("show", "2026-09-26T00:00:00Z"); // 19:00 CDT
    const untimed = ev("untimed", FRI25_MARKER, { event_start_local: "2026-09-25T19:31:58" });
    const fair = ev("fair", "2026-09-20T15:00:00Z", { end_date: "2026-09-27T03:00:00Z" });
    expect(isNotOver(morning, FRI25_8PM)).toBe(false);
    expect(isNotOver(evening, FRI25_8PM)).toBe(true);
    expect(isNotOver(fair, FRI25_8PM)).toBe(true);
    // At 22:00 the marker is more than 2h back and still counts, all day.
    expect(isNotOver(untimed, new Date("2026-09-26T03:00:00Z"))).toBe(true);
  });

  it("inHubWindow keeps a Thu-Sun festival in this weekend", () => {
    const window = resolveHubDate("this-weekend", null, null, FRI25_8PM)!.window;
    const fest = ev("fest", "2026-09-25T15:00:00Z", { end_date: "2026-09-28T03:00:00Z" });
    expect(inHubWindow(fest, window, FRI25_8PM)).toBe(true);
    const nextWeek = ev("later", "2026-10-02T23:00:00Z");
    expect(inHubWindow(nextWeek, window, FRI25_8PM)).toBe(false);
  });
});

describe("paging", () => {
  const page = (ids: string[], offset: number, total: number | null): HubPage => ({
    events: ids.map((id) => ev(id, "2026-10-01T00:00:00Z")),
    total,
    offset,
    limit: 30,
    complete: false,
  });

  it("appends pages and never repeats an id", () => {
    const flat = flattenPages([page(["a", "b"], 0, 4), page(["b", "c", "d"], 30, null)]);
    expect(flat.map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("leaves out ids pinned above the list", () => {
    const flat = flattenPages([page(["a", "b", "c"], 0, 3)], new Set(["b"]));
    expect(flat.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("near me counts by distance and says when capped", () => {
    expect(nearMeCountLabel(42, false)).toBe("Nearest 42 within 30 mi");
    expect(nearMeCountLabel(100, true)).toBe("Nearest 100 within 30 mi; more exist, narrow the filters");
  });

  it("counts honestly", () => {
    expect(countLabel(30, 412)).toBe("30 of 412 events");
    expect(countLabel(12, 12)).toBe("12 events");
    expect(countLabel(1, 1)).toBe("1 event");
  });
});

describe("selectTonight", () => {
  it("starting within 3h first, then running by end_date; nothing else", () => {
    const rows = [
      ev("later", "2026-09-25T06:00:00Z"), // 1am, 4h away
      ev("soon2", "2026-09-25T04:00:00Z"), // 11pm
      ev("soon1", "2026-09-25T02:30:00Z"), // 9:30pm
      ev("fair", "2026-09-20T15:00:00Z", { end_date: "2026-09-27T03:00:00Z" }),
      ev("over", "2026-09-24T23:00:00Z"), // started 6pm, no end_date
    ];
    const picked = selectTonight(rows, THU_9PM);
    expect(picked.map((i) => i.event.id)).toEqual(["soon1", "soon2", "fair"]);
    expect(relativeStartLabel(picked[0], THU_9PM)).toBe("Starts in 30 min");
    expect(relativeStartLabel(picked[1], THU_9PM)).toBe("Starts in 2 hr");
    expect(relativeStartLabel(picked[2], THU_9PM)).toBe("Happening now");
  });

  it("never counts down to the 19:31:58 no-time marker", () => {
    const untimed = ev("untimed", FRI25_MARKER, { event_start_local: "2026-09-25T19:31:58" });
    const timed = ev("timed", "2026-09-26T00:30:00Z", { event_start_local: "2026-09-25T19:30:00" });
    const picked = selectTonight([untimed, timed], FRI25_650PM);
    expect(picked.map((i) => [i.event.id, i.status])).toEqual([
      ["timed", "soon"],
      ["untimed", "untimed"],
    ]);
    expect(relativeStartLabel(picked[1], FRI25_650PM)).toBe("Today, time not listed");
    expect(relativeStartLabel(picked[0], FRI25_650PM)).toBe("Starts in 40 min");
  });

  it("titles itself by the Central clock", () => {
    expect(stripHeading(new Date("2026-09-25T14:00:00Z"))).toBe("Starting soon"); // 9 AM
    expect(stripHeading(FRI25_8PM)).toBe("Tonight, Fri Sep 25");
  });
});

describe("groupByCentralDay", () => {
  it("groups by the Central day, labels tonight and tomorrow, and files running events under today", () => {
    const rows = [
      ev("fair", "2026-09-20T15:00:00Z", { end_date: "2026-09-27T03:00:00Z" }),
      ev("late", "2026-09-25T04:30:00Z"), // 11:30pm Thu CDT, Fri in UTC
      ev("fri", "2026-09-25T23:00:00Z"),
      ev("sat", "2026-09-26T23:00:00Z"),
    ];
    const groups = groupByCentralDay(rows, THU_9PM);
    expect(groups.map((g) => [g.label, g.events.map((e) => e.id)])).toEqual([
      ["Tonight", ["fair", "late"]],
      ["Tomorrow", ["fri"]],
      ["Saturday, Sep 26", ["sat"]],
    ]);
  });

  it("the prerender gets dates, never 'Tonight' or 'Tomorrow'", () => {
    expect(dayHeading("2026-09-24", THU_9PM, false)).toBe("Thursday, Sep 24");
    expect(dayHeading("2026-09-25", THU_9PM, false)).toBe("Friday, Sep 25");
  });
});

describe("fetchNearMe", () => {
  function reader(rows: unknown[]) {
    const calls: Call[] = [];
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "neq", "is"]) {
      builder[m] = (...args: unknown[]) => {
        calls.push([m, args]);
        return builder;
      };
    }
    builder.in = (...args: unknown[]) => {
      calls.push(["in", args]);
      return Promise.resolve({ data: rows, error: null });
    };
    return { builder, calls };
  }

  it("rounds the origin, reads the list projection, sorts by distance and flags a capped answer", async () => {
    const rpcRows = Array.from({ length: NEAR_ME_LIMIT }, (_, i) => ({
      id: `e${i}`,
      distance_meters: i === 0 ? 5000 : 100 + i,
    }));
    const full = [
      ev("e0", "2026-09-26T00:00:00Z", { is_sponsored: true, sponsored_until: null }),
      ev("e1", "2026-09-26T00:00:00Z"),
      ev("e2", "2026-09-25T13:00:00Z"), // 08:00, over by 20:00
    ];
    const rpc = vi.fn(() => Promise.resolve({ data: rpcRows, error: null }));
    const { builder, calls } = reader(full);
    mockSupabase.rpc = rpc;
    mockSupabase.from = vi.fn(() => builder);

    const page = await fetchNearMe(BASE, { latitude: 41.587654, longitude: -93.624321 }, FRI25_8PM);

    expect(rpc).toHaveBeenCalledWith("search_events_near_location", expect.objectContaining({
      user_lat: 41.59,
      user_lon: -93.62,
    }));
    expect(calls).toContainEqual(["neq", ["is_merged", true]]);
    expect(page.events.map((e) => e.id)).toEqual(["e1", "e0"]);
    expect(page.events[1].is_sponsored).toBe(true);
    expect(page.capped).toBe(true);
    expect(page.complete).toBe(false);
  });
});
