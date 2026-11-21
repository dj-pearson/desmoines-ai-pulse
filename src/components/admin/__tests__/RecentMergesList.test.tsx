import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * WEB-BE-074: the admin's recent-merges list shows what each merge copied and
 * moved, and Undo calls unmerge_content with that merge's id.
 */
type Row = Record<string, unknown>;
const merges: Row[] = [];
const names: Record<string, Row[]> = { restaurants: [], events: [] };
const rpc = vi.fn((_fn: string, _args: Record<string, unknown>) => Promise.resolve({ data: true, error: null }));

vi.mock("@/integrations/supabase/client", () => {
  function builder(table: string) {
    const b: Record<string, unknown> = {};
    const result = () => ({ data: table === "content_merges" ? merges : names[table] ?? [], error: null });
    for (const m of ["select", "gte", "order", "eq", "ilike"]) b[m] = () => b;
    b.in = () => Promise.resolve(result());
    b.limit = () => Promise.resolve(result());
    return b;
  }
  return {
    supabase: {
      from: (table: string) => builder(table),
      rpc: (fn: string, args: Record<string, unknown>) => rpc(fn, args),
    },
  };
});

vi.mock("@/lib/errorHandler", () => ({ handleError: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { RecentMergesList } from "@/components/admin/RecentMergesList";

function renderList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RecentMergesList />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  merges.length = 0;
  names.restaurants = [
    { id: "kept", name: "Noce" },
    { id: "dup", name: "Noce Jazz" },
    { id: "old", name: "Old Dup" },
  ];
  rpc.mockClear();
});

describe("RecentMergesList", () => {
  it("lists what a merge copied and Undo calls unmerge_content with its id", async () => {
    merges.push({
      id: "m1", content_type: "restaurant", survivor_id: "kept", loser_id: "dup", decided_by: "admin",
      created_at: new Date().toISOString(), reversed: false, repointed: { "business_claims.listing_id": 1 },
      filled_columns: { google_place_id: {}, hours_json: {} }, moved_claims: ["c1"],
    });
    renderList();

    await waitFor(() => expect(screen.getByText("Noce Jazz")).toBeTruthy());
    expect(screen.getByText(/copied google_place_id, hours_json; moved 1 owner claim/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Undo merge of Noce Jazz into Noce" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("unmerge_content", { p_merge_id: "m1" }));
  });

  it("an undone merge has no Undo button", async () => {
    merges.push({
      id: "m2", content_type: "restaurant", survivor_id: "kept", loser_id: "old", decided_by: "system",
      created_at: new Date().toISOString(), reversed: true, repointed: {}, filled_columns: {}, moved_claims: [],
    });
    renderList();
    await waitFor(() => expect(screen.getByText("Undone")).toBeTruthy());
    // Counter-assertion: the row rendered, so the missing button is not a missing row.
    expect(screen.getByText("Old Dup")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Undo merge/ })).toBeNull();
  });
});
