import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * A dateless (legacy) event slug stopped resolving on the second day of a
 * multi-day run (WEB-FEAT-052). The candidate read filtered
 * `date >= start of today (Central)` with no end_date arm, so
 * /events/iowa-state-fair 404'd from the fair's second morning while the hub,
 * site search and the .ics feeds still listed it. Reminder and digest emails
 * still build these slugs.
 */

interface Call {
  method: string;
  args: unknown[];
}

const calls: Call[] = [];
let rows: Record<string, unknown>[] = [];

function tableQuery() {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "neq", "is", "not", "eq", "gte", "lt", "ilike", "or", "order", "limit"]) {
    chain[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve, reject);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => tableQuery(),
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}));

const { fetchEventBySlug } = await import("../useEventBySlug");
const { upcomingOrRunningFilter } = await import("../useEvents");
const { upcomingFloorUtc } = await import("@/lib/timezone");

/** Evaluate a flat `col.gte.value` or= group against a row; NULL fails its term. */
function matchesOrGroup(group: string, row: Record<string, string | null>): boolean {
  return group.split(",").some((term) => {
    const [col, op, ...rest] = term.split(".");
    expect(op).toBe("gte");
    const cell = row[col];
    if (cell == null) return false;
    return Date.parse(cell) >= Date.parse(rest.join("."));
  });
}

// Third morning of the fair: 2026-08-15, 09:00 CDT.
const NOW = new Date("2026-08-15T14:00:00Z");

const STATE_FAIR = {
  id: "fair-1",
  title: "Iowa State Fair",
  date: "2026-08-13T14:00:00Z",
  event_start_utc: "2026-08-13T14:00:00Z",
  end_date: "2026-08-24T03:00:00Z",
};

describe("legacy dateless slug window", () => {
  beforeEach(() => {
    calls.length = 0;
    rows = [];
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends a start-or-end group instead of a bare date floor", async () => {
    await fetchEventBySlug("iowa-state-fair");

    const ors = calls.filter((c) => c.method === "or").map((c) => c.args[0]);
    expect(ors).toContain(upcomingOrRunningFilter(upcomingFloorUtc()));
    // The old filter, which no end_date could rescue a row from.
    expect(calls.some((c) => c.method === "gte" && c.args[0] === "date")).toBe(false);
    expect(calls).toContainEqual({ method: "ilike", args: ["title", expect.any(String)] });
  });

  it("the group keeps a run that started two days ago and drops one that ended", () => {
    const group = upcomingOrRunningFilter(upcomingFloorUtc());
    expect(matchesOrGroup(group, STATE_FAIR)).toBe(true);
    expect(matchesOrGroup(group, { date: "2026-08-10T14:00:00Z", end_date: "2026-08-14T23:00:00Z" })).toBe(false);
    expect(matchesOrGroup(group, { date: "2026-08-14T01:00:00Z", end_date: null })).toBe(false);
    expect(matchesOrGroup(group, { date: "2026-08-16T00:30:00Z", end_date: null })).toBe(true);
  });

  it("resolves the running fair once the database returns it", async () => {
    rows = [STATE_FAIR];
    const lookup = await fetchEventBySlug("iowa-state-fair");
    expect(lookup?.event.id).toBe("fair-1");
    expect(lookup?.archived).toBe(false);
  });

  it("leaves the dated-slug window alone", async () => {
    await fetchEventBySlug("iowa-state-fair-2026-08-13");
    expect(calls).toContainEqual({ method: "gte", args: ["date", "2026-08-12"] });
    expect(calls).toContainEqual({ method: "lt", args: ["date", "2026-08-15"] });
    // The only or= group left is findUnlisted's merged/archived second look.
    expect(calls.some((c) => c.method === "or" && String(c.args[0]).includes("end_date"))).toBe(false);
  });
});
