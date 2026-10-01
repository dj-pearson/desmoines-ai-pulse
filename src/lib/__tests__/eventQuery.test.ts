import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Events plan WP0 item 4. One definition of a visible event, and a helper
 * that filters untrusted RPC ids through it.
 */

type Call = [string, unknown[]];

interface FakeBuilder {
  calls: Call[];
  [method: string]: unknown;
}

function makeQuery(result: { data: Array<{ id: string }> | null; error: unknown }): FakeBuilder {
  const builder: FakeBuilder = {
    calls: [],
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of ["select", "neq", "is", "in"]) {
    builder[method] = (...args: unknown[]) => {
      builder.calls.push([method, args]);
      return builder;
    };
  }
  return builder;
}

const queries: FakeBuilder[] = [];
let respond: (ids: string[]) => { data: Array<{ id: string }> | null; error: unknown } = (ids) => ({
  data: ids.map((id) => ({ id })),
  error: null,
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "events") throw new Error(`unexpected table ${table}`);
      // The response is decided when `.in()` is called, so it can depend on the ids.
      let result: { data: Array<{ id: string }> | null; error: unknown } = { data: [], error: null };
      const q = makeQuery({ data: null, error: null });
      const origIn = q.in as (...a: unknown[]) => FakeBuilder;
      q.in = (...args: unknown[]) => {
        result = respond(args[1] as string[]);
        return origIn(...args);
      };
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
      queries.push(q);
      return q;
    },
  },
}));

import { applyEventVisibility, filterVisibleIds } from "@/lib/eventQuery";

const VISIBILITY: Call[] = [
  ["neq", ["is_merged", true]],
  ["neq", ["is_hidden", true]],
  ["is", ["archived_at", null]],
];

beforeEach(() => {
  queries.length = 0;
  respond = (ids) => ({ data: ids.map((id) => ({ id })), error: null });
});

describe("applyEventVisibility", () => {
  it("adds the three unpublish predicates and returns the same builder", () => {
    const q = makeQuery({ data: [], error: null }) as FakeBuilder & { neq: unknown; is: unknown };
    expect(applyEventVisibility(q)).toBe(q);
    expect(q.calls).toEqual(VISIBILITY);
  });
});

describe("filterVisibleIds", () => {
  it("returns only the ids the visibility query sends back", async () => {
    respond = (ids) => ({ data: ids.filter((id) => id !== "b").map((id) => ({ id })), error: null });
    const visible = await filterVisibleIds(["a", "b", "c", "a", ""]);
    expect([...visible].sort()).toEqual(["a", "c"]);
    expect(queries).toHaveLength(1);
    expect(queries[0].calls).toEqual([["select", ["id"]], ...VISIBILITY, ["in", ["id", ["a", "b", "c"]]]]);
  });

  it("makes no request for no ids", async () => {
    expect((await filterVisibleIds([])).size).toBe(0);
    expect(queries).toHaveLength(0);
  });

  it("chunks long id lists", async () => {
    const ids = Array.from({ length: 320 }, (_, i) => `id-${i}`);
    const visible = await filterVisibleIds(ids);
    expect(visible.size).toBe(320);
    expect(queries.map((q) => (q.calls.find((c) => c[0] === "in")![1][1] as string[]).length)).toEqual([150, 150, 20]);
  });

  it("throws on a backend error instead of hiding every result", async () => {
    respond = () => ({ data: null, error: { code: "500", message: "down" } });
    await expect(filterVisibleIds(["a"])).rejects.toMatchObject({ message: "down" });
  });
});
