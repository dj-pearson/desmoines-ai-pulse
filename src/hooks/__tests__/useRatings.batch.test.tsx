import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";

/**
 * useRatings ran three sequential uncached requests in an effect keyed on the
 * user object (replaced on every token refresh), and each review card then
 * fetched its own user_reputation row. The read is now one cached query that
 * batches reviewer names and reputations with `.in("user_id", ids)`.
 */
type Result = { data: unknown; error: unknown };
const calls: Array<{ table: string; select: string; ops: Array<[string, unknown[]]> }> = [];
const responses: Record<string, Result> = {};

function builder(table: string) {
  const call = { table, select: "", ops: [] as Array<[string, unknown[]]> };
  calls.push(call);
  const b: Record<string, unknown> = {};
  const chain = (name: string) =>
    (...args: unknown[]) => {
      call.ops.push([name, args]);
      return b;
    };
  b.select = (cols: string) => {
    call.select = cols;
    return b;
  };
  for (const op of ["eq", "or", "order", "limit", "in"]) b[op] = chain(op);
  b.maybeSingle = () => Promise.resolve(responses[`${table}:single`] ?? { data: null, error: null });
  b.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(responses[table] ?? { data: [], error: null }).then(resolve, reject);
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => builder(table) },
}));
const authState = { user: { id: "me" } as { id: string } | null };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: authState.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));

const { renderHook, waitFor } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { useRatings, RATINGS_LIMIT } = await import("../useRatings");

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const row = (id: string, user_id: string, moderation_status = "approved") => ({
  id,
  user_id,
  content_type: "restaurant",
  content_id: "r1",
  rating: "4",
  review_text: "ok",
  photo_urls: [],
  is_verified: false,
  moderation_status,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
});

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(responses)) delete responses[k];
  authState.user = { id: "me" };
});

describe("useRatings", () => {
  it("batches reviewer reputations into one request and selects no '*'", async () => {
    responses.user_ratings = {
      data: [row("a", "u1"), row("b", "u2"), row("c", "u1"), row("d", "u3", "pending")],
      error: null,
    };
    responses.user_reputation = { data: [{ user_id: "u1", level: "expert", points: 120 }], error: null };
    responses["content_rating_aggregates:single"] = {
      data: { total_ratings: 3, weighted_average: 4 },
      error: null,
    };

    const { result } = renderHook(() => useRatings({ contentType: "restaurant", contentId: "r1" }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // A pending review is hidden even when the backend ignores the filter.
    expect(result.current.ratings.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(result.current.reputations).toEqual({ u1: { level: "expert", points: 120 } });
    expect(result.current.aggregate).toMatchObject({ total_ratings: 3 });
    expect(result.current.error).toBeNull();

    const reputationCalls = calls.filter((c) => c.table === "user_reputation");
    expect(reputationCalls).toHaveLength(1);
    expect(reputationCalls[0].ops).toContainEqual(["in", ["user_id", ["u1", "u2"]]]);

    const list = calls.find((c) => c.table === "user_ratings" && c.ops.some(([op]) => op === "limit"));
    expect(list?.ops).toContainEqual(["limit", [RATINGS_LIMIT]]);
    for (const c of calls) expect(c.select).not.toContain("*");
  });

  it("reports a failed load as an error rather than an empty list", async () => {
    authState.user = null;
    responses.user_ratings = { data: null, error: new Error("boom") };

    const { result } = renderHook(() => useRatings({ contentType: "restaurant", contentId: "r1" }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.ratings).toEqual([]);
    expect(calls.some((c) => c.table === "user_reputation")).toBe(false);
  });

  it("does not refetch when the auth user object changes but the id does not", async () => {
    const { result, rerender } = renderHook(() => useRatings({ contentType: "restaurant", contentId: "r1" }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const before = calls.length;

    authState.user = { id: "me" }; // what TOKEN_REFRESHED does
    rerender();
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.length).toBe(before);
  });
});
