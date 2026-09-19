import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * fetchBySlug decides between a one-row lookup and a table scan based on ONE
 * error condition, so the tests are about which branch runs and when - not
 * about PostgREST. The client is stubbed as a builder that records the calls it
 * received.
 */
const calls: Array<{ table: string; columns: string; filter: string; value: string }> = [];
let slugResponse: { data: unknown; error: unknown } = { data: null, error: null };
let indexResponse: { data: unknown; error: unknown } = { data: [], error: null };
let rowResponse: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => ({
    select: (columns: string) => {
      const builder = {
        eq: (filter: string, value: string) => {
          calls.push({ table, columns, filter, value });
          return {
            maybeSingle: async () => (filter === "slug" ? slugResponse : rowResponse),
          };
        },
        // The index scan is awaited directly, with no .eq().
        then: (resolve: (r: unknown) => unknown) => {
          calls.push({ table, columns, filter: "", value: "" });
          return Promise.resolve(indexResponse).then(resolve);
        },
      };
      return builder;
    },
  });
  return { supabase: { from } };
});

const { fetchBySlug } = await import("@/lib/resolveBySlug");

const UNKNOWN_COLUMN = { code: "42703", message: 'column "slug" does not exist' };

beforeEach(() => {
  calls.length = 0;
  slugResponse = { data: null, error: null };
  indexResponse = { data: [], error: null };
  rowResponse = { data: null, error: null };
});

describe("fetchBySlug", () => {
  it("asks for one row by slug and stops there", async () => {
    slugResponse = { data: { id: "p1", name: "Gray's Lake Park" }, error: null };

    const row = await fetchBySlug("playgrounds", "gray-s-lake-park");

    expect(row).toEqual({ id: "p1", name: "Gray's Lake Park" });
    expect(calls).toEqual([
      { table: "playgrounds", columns: "*", filter: "slug", value: "gray-s-lake-park" },
    ]);
  });

  it("returns null for a slug nothing matches, without scanning", async () => {
    slugResponse = { data: null, error: null };

    expect(await fetchBySlug("playgrounds", "no-such-park")).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("falls back to the name scan when the column is not there yet", async () => {
    // The deploy window this whole fallback exists for: the page is live and
    // the migration is not.
    slugResponse = { data: null, error: UNKNOWN_COLUMN };
    indexResponse = { data: [{ id: "a1", name: "Pappajohn Sculpture Park" }], error: null };
    rowResponse = { data: { id: "a1", name: "Pappajohn Sculpture Park", rating: 5 }, error: null };

    const row = await fetchBySlug("attractions", "pappajohn-sculpture-park");

    expect(row).toEqual({ id: "a1", name: "Pappajohn Sculpture Park", rating: 5 });
    expect(calls.map((c) => `${c.columns}|${c.filter}`)).toEqual([
      "*|slug",
      "id, name|",
      "*|id",
    ]);
  });

  it("scans names rather than whole rows on the fallback path", async () => {
    slugResponse = { data: null, error: UNKNOWN_COLUMN };
    indexResponse = { data: [{ id: "a1", name: "Blank Park Zoo" }], error: null };

    await fetchBySlug("attractions", "nothing-matches-this");

    // No second fetch, because nothing matched - and the scan asked for two
    // columns, not the table.
    expect(calls).toHaveLength(2);
    expect(calls[1].columns).toBe("id, name");
  });

  it("rethrows any other failure instead of scanning the table", async () => {
    // A permission error or an outage answering the fallback's question would
    // turn a broken table into a slow empty page. That is the WEB-QA-017
    // failure class this must not reproduce.
    slugResponse = { data: null, error: { code: "42501", message: "permission denied" } };

    await expect(fetchBySlug("attractions", "anything")).rejects.toMatchObject({
      code: "42501",
    });
    expect(calls).toHaveLength(1);
  });

  it("rethrows when the fallback scan itself fails", async () => {
    slugResponse = { data: null, error: UNKNOWN_COLUMN };
    indexResponse = { data: null, error: { code: "42P01", message: "relation does not exist" } };

    await expect(fetchBySlug("attractions", "anything")).rejects.toMatchObject({
      code: "42P01",
    });
  });
});
