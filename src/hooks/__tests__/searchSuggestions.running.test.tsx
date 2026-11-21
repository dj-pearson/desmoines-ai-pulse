import { useRef, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * Both search typeaheads dropped a multi-day run on its second day
 * (WEB-FEAT-061). The homepage hero (useEntitySuggestions) and the /events
 * search box (SearchAutocomplete, titles and venues) filtered
 * `date >= start of today (Central)` with no end_date arm, so on the third
 * morning of the State Fair typing "state fair" offered nothing, while the
 * results page it submits to (useKeywordResults -> useEvents) listed the fair
 * (WEB-FEAT-045).
 *
 * The mock evaluates the filters each read sends against fixture rows, so the
 * assertions are on what the dropdown offers, not on a filter string.
 */

type Row = Record<string, string | boolean | null>;
type Pred = (row: Row) => boolean;

let rows: Row[] = [];

function cmp(cell: Row[string], op: string, raw: string): boolean {
  if (op === "eq") return String(cell) === raw;
  if (op === "neq") return String(cell) !== raw;
  if (op === "is") return raw === "null" ? cell == null : String(cell) === raw;
  if (cell == null) return false;
  const a = Date.parse(String(cell));
  const b = Date.parse(raw);
  if (op === "gte") return a >= b;
  if (op === "lte") return a <= b;
  if (op === "lt") return a < b;
  throw new Error(`unsupported op ${op}`);
}

/** A flat PostgREST or= body: `col.op.value,col.op.value`. */
function orGroup(body: string): Pred {
  const terms = body.split(",").map((t) => {
    const [col, op, ...rest] = t.split(".");
    return (r: Row) => cmp(r[col], op, rest.join("."));
  });
  return (r) => terms.some((p) => p(r));
}

function ilike(cell: Row[string], pattern: string): boolean {
  const needle = pattern.replace(/^%|%$/g, "").toLowerCase();
  return typeof cell === "string" && cell.toLowerCase().includes(needle);
}

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const preds: Pred[] = [];
    let limit = Infinity;
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.order = () => c;
    c.limit = (n: number) => {
      limit = n;
      return c;
    };
    for (const op of ["eq", "neq", "is", "gte", "lte", "lt"]) {
      c[op] = (col: string, v: unknown) => {
        preds.push((r) => cmp(r[col], op, String(v)));
        return c;
      };
    }
    c.ilike = (col: string, pattern: string) => {
      preds.push((r) => ilike(r[col], pattern));
      return c;
    };
    c.or = (body: string) => {
      preds.push(orGroup(body));
      return c;
    };
    c.then = (resolve: (v: unknown) => unknown) => {
      const data = table === "events" ? rows.filter((r) => preds.every((p) => p(r))).slice(0, limit) : [];
      return Promise.resolve({ data, error: null }).then(resolve);
    };
    return c;
  };
  return { supabase: { from: (table: string) => chain(table) } };
});
vi.mock("@/hooks/useRestaurants", () => ({
  restaurantFilterOptionsQuery: {
    queryKey: ["restaurant-filter-options"],
    queryFn: async () => ({ cuisines: [] }),
  },
}));

const { fetchEntitySuggestions } = await import("../useEntitySuggestions");
const { SearchAutocomplete } = await import("@/components/SearchAutocomplete");

// Third morning of the fair: 2026-08-15, 09:00 CDT.
const NOW = new Date("2026-08-15T14:00:00Z");

const visible = { is_merged: false, is_hidden: false, archived_at: null };

const STATE_FAIR: Row = {
  id: "fair-1",
  title: "Iowa State Fair",
  venue: "Iowa State Fairgrounds",
  date: "2026-08-13T14:00:00Z",
  event_start_utc: "2026-08-13T14:00:00Z",
  event_start_local: null,
  end_date: "2026-08-24T03:00:00Z",
  ...visible,
};
const FAIR_CONCERT: Row = {
  id: "concert-1",
  title: "Grandstand at the State Fair",
  venue: "Iowa State Fairgrounds",
  date: "2026-08-17T01:30:00Z",
  event_start_utc: "2026-08-17T01:30:00Z",
  event_start_local: null,
  end_date: null,
  ...visible,
};
const LAST_YEAR: Row = {
  id: "fair-2025",
  title: "Iowa State Fair 2025",
  venue: "Iowa State Fairgrounds",
  date: "2025-08-07T14:00:00Z",
  event_start_utc: "2025-08-07T14:00:00Z",
  event_start_local: null,
  end_date: "2025-08-18T03:00:00Z",
  ...visible,
};
const ENDED_YESTERDAY: Row = {
  id: "ended",
  title: "State Fair Preview Night",
  venue: "Hoyt Sherman Place",
  date: "2026-08-12T23:00:00Z",
  event_start_utc: "2026-08-12T23:00:00Z",
  event_start_local: null,
  end_date: "2026-08-15T03:00:00Z",
  ...visible,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  rows = [STATE_FAIR, FAIR_CONCERT, LAST_YEAR, ENDED_YESTERDAY];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("hero typeahead (fetchEntitySuggestions)", () => {
  it("offers a run that started two days ago", async () => {
    const out = await fetchEntitySuggestions("state fair");
    expect(out.events.map((e) => e.id)).toEqual(expect.arrayContaining(["fair-1", "concert-1"]));
  });

  it("still leaves out runs that are over", async () => {
    const out = await fetchEntitySuggestions("state fair");
    const ids = out.events.map((e) => e.id);
    expect(ids).not.toContain("fair-2025");
    expect(ids).not.toContain("ended");
  });

  it("keeps the visibility predicate", async () => {
    rows = [{ ...STATE_FAIR, is_hidden: true }];
    expect((await fetchEntitySuggestions("state fair")).events).toEqual([]);
  });
});

function Harness({ value }: { value: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} aria-label="Search events" defaultValue={value} />
      <SearchAutocomplete contentType="events" value={value} onSelect={() => {}} inputRef={ref} />
    </>
  );
}

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe("/events typeahead (SearchAutocomplete)", () => {
  it("offers the running fair by title, and not last year's", async () => {
    render(wrap(<Harness value="state fair" />));
    fireEvent.focus(screen.getByLabelText("Search events"));
    const group = await waitFor(() => screen.getByRole("group", { name: "Suggestions" }), { timeout: 2000 });
    const titles = within(group)
      .getAllByRole("option")
      .map((o) => o.textContent ?? "");
    expect(titles.some((t) => t.startsWith("Iowa State Fair") && !t.includes("2025"))).toBe(true);
    expect(titles.some((t) => t.includes("2025"))).toBe(false);
    expect(titles.some((t) => t.startsWith("State Fair Preview Night"))).toBe(false);
  });

  it("offers a venue whose only listing is a running event", async () => {
    rows = [STATE_FAIR, LAST_YEAR];
    render(wrap(<Harness value="fairgrounds" />));
    fireEvent.focus(screen.getByLabelText("Search events"));
    await waitFor(() => screen.getByRole("option", { name: /Iowa State Fairgrounds/ }), { timeout: 2000 });
  });
});
