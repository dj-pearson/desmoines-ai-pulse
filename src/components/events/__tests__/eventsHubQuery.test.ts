import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  applyHubFilters,
  applyHubSort,
  countLabel,
  flattenPages,
  groupByCentralDay,
  relativeStartLabel,
  resolveHubDate,
  selectTonight,
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

type Call = [string, unknown[]];

function fakeQuery() {
  const calls: Call[] = [];
  const builder: Record<string, unknown> & { calls: Call[] } = { calls };
  for (const m of ["neq", "is", "ilike", "gte", "lte", "eq", "or", "textSearch", "order"]) {
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
  it("unfiltered: visibility plus the upcoming floor that keeps running events", () => {
    const q = fakeQuery();
    applyHubFilters(q, BASE, THU_9PM);
    expect(q.calls).toContainEqual(["neq", ["is_merged", true]]);
    expect(q.calls).toContainEqual(["is", ["archived_at", null]]);
    expect(q.calls).toContainEqual([
      "or",
      ["date.gte.2026-09-24T05:00:00.000Z,end_date.gte.2026-09-25T02:00:00.000Z"],
    ]);
  });

  it("a window bounds date with gte/lte and drops the floor", () => {
    const q = fakeQuery();
    const window = resolveHubDate("today", null, null, THU_9PM)!.window;
    applyHubFilters(q, { ...BASE, window }, THU_9PM);
    expect(q.calls).toContainEqual(["gte", ["date", window.start]]);
    expect(q.calls).toContainEqual(["lte", ["date", window.end]]);
    expect(q.calls.some(([m]) => m === "or")).toBe(false);
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
});
