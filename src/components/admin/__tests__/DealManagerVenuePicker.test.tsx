import { describe, it, expect, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * WEB-FEAT-075: editing a deal still stored against a merged restaurant shows
 * that it was merged, names the kept row, and moves the form's entity_id to
 * the kept row so saving stores it.
 */
type Row = Record<string, unknown>;
const restaurants: Record<string, Row> = {};

vi.mock("@/integrations/supabase/client", () => {
  function builder(table: string) {
    let id = "";
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (_c: string, v: string) => {
      id = v;
      return b;
    };
    b.maybeSingle = () => Promise.resolve({ data: table === "restaurants" ? (restaurants[id] ?? null) : null, error: null });
    return b;
  }
  return { supabase: { from: (table: string) => builder(table) } };
});

vi.mock("@/lib/errorHandler", () => ({ handleError: vi.fn() }));

import { VenuePicker } from "@/components/admin/DealManager";

function Harness({ initialId, onSaveId }: { initialId: string; onSaveId: (id: string | null) => void }) {
  const [entityId, setEntityId] = useState<string | null>(initialId);
  return (
    <>
      <VenuePicker
        entityType="restaurant"
        entityId={entityId}
        onPick={(v) => setEntityId(v?.id ?? null)}
        onResolveMerged={(kept) => setEntityId(kept)}
      />
      <button type="button" onClick={() => onSaveId(entityId)}>
        Save
      </button>
    </>
  );
}

beforeEach(() => {
  for (const k of Object.keys(restaurants)) delete restaurants[k];
});

describe("VenuePicker with a merged restaurant link", () => {
  it("names the kept row, says the link was merged, and saves the kept id", async () => {
    restaurants.dup = { id: "dup", name: "Noce Jazz", location: "1326 Walnut", is_merged: true, merged_into: "kept" };
    restaurants.kept = { id: "kept", name: "Noce", location: "1326 Walnut St", is_merged: false, merged_into: null };
    const onSaveId = vi.fn();
    render(<Harness initialId="dup" onSaveId={onSaveId} />);

    expect(
      await screen.findByText("Was linked to Noce Jazz (merged into Noce). Saving links Noce."),
    ).toBeInTheDocument();
    expect(screen.getByText("Noce")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSaveId).toHaveBeenLastCalledWith("kept");
  });

  it("shows no merge note for a live restaurant and keeps its id", async () => {
    restaurants.live = { id: "live", name: "Zombie Burger", location: "300 E Grand", is_merged: false, merged_into: null };
    const onSaveId = vi.fn();
    render(<Harness initialId="live" onSaveId={onSaveId} />);

    expect(await screen.findByText("Zombie Burger")).toBeInTheDocument();
    expect(screen.queryByText(/merged/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSaveId).toHaveBeenLastCalledWith("live");
  });

  it("clears the note when the link is removed", async () => {
    restaurants.dup = { id: "dup", name: "Noce Jazz", location: null, is_merged: true, merged_into: "kept" };
    restaurants.kept = { id: "kept", name: "Noce", location: null, is_merged: false, merged_into: null };
    render(<Harness initialId="dup" onSaveId={vi.fn()} />);

    await screen.findByText(/merged into Noce/);
    fireEvent.click(screen.getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(screen.queryByText(/merged into/)).not.toBeInTheDocument());
  });
});
