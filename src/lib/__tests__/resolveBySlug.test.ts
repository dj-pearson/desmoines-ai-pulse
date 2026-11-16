import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * fetchBySlug is one request by the slug column (WEB-PERF-031). The name-scan
 * fallback it carried for the pre-migration window is gone, so these tests pin
 * that no error - not even "no such column" - turns into a table scan. The
 * client is stubbed as a builder that records the calls it received.
 */
const calls: Array<{ table: string; columns: string; filter: string; value: string }> = [];
let slugResponse: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => ({
    select: (columns: string) => ({
      eq: (filter: string, value: string) => {
        calls.push({ table, columns, filter, value });
        return { maybeSingle: async () => slugResponse };
      },
      // A bare awaited select is the old (id, name) scan. Record it so a test
      // fails if it ever comes back.
      then: (resolve: (r: unknown) => unknown) => {
        calls.push({ table, columns, filter: "", value: "" });
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    }),
  });
  return { supabase: { from } };
});

const { fetchBySlug } = await import("@/lib/resolveBySlug");

beforeEach(() => {
  calls.length = 0;
  slugResponse = { data: null, error: null };
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

  it("passes a projection through", async () => {
    await fetchBySlug("attractions", "blank-park-zoo", "id, name");
    expect(calls).toEqual([
      { table: "attractions", columns: "id, name", filter: "slug", value: "blank-park-zoo" },
    ]);
  });

  it("returns null for a slug nothing matches, without scanning", async () => {
    expect(await fetchBySlug("playgrounds", "no-such-park")).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("rethrows an unknown-column error instead of scanning names", async () => {
    // The column is live. If it ever reads as missing, that is a schema fault
    // to surface, not a reason to download the table.
    slugResponse = { data: null, error: { code: "42703", message: 'column "slug" does not exist' } };

    await expect(fetchBySlug("attractions", "anything")).rejects.toMatchObject({ code: "42703" });
    expect(calls).toHaveLength(1);
  });

  it("rethrows any other failure", async () => {
    slugResponse = { data: null, error: { code: "42501", message: "permission denied" } };

    await expect(fetchBySlug("attractions", "anything")).rejects.toMatchObject({ code: "42501" });
    expect(calls).toHaveLength(1);
  });
});
