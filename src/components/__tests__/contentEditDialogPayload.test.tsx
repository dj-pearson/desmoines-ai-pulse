import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

/**
 * WEB-BE-067 at the component: the dialog opened on a restaurant list row
 * (with sponsorship, hours and closure columns) sends only the field the
 * admin changed. The pure builder is covered in contentEditPayload.test.ts;
 * this proves the dialog actually uses it.
 */

const calls = vi.hoisted(() => ({
  update: [] as unknown[],
  insert: [] as unknown[],
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  lockedFields: null as Record<string, unknown> | null,
}));

vi.mock("@/integrations/supabase/client", () => {
  const row = { id: "r1" };
  return {
    supabase: {
      // WEB-BE-069: set_restaurant_field_locks answers with the resulting map.
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.rpc.push({ fn, args });
        const next = { ...(calls.lockedFields ?? {}) };
        for (const k of (args.p_lock as string[]) ?? []) next[k] = { by: "admin", at: "2026-11-21T00:00:00Z" };
        for (const k of (args.p_unlock as string[]) ?? []) delete next[k];
        calls.lockedFields = next;
        return Promise.resolve({ data: next, error: null });
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { ...row, locked_fields: calls.lockedFields }, error: null }),
          }),
        }),
        update: (payload: unknown) => {
          calls.update.push(payload);
          return { eq: () => ({ select: () => Promise.resolve({ data: [row], error: null }) }) };
        },
        insert: (payload: unknown) => {
          calls.insert.push(payload);
          return { select: () => Promise.resolve({ data: [row], error: null }) };
        },
      }),
    },
  };
});

vi.mock("@/hooks/useKnownVenues", () => ({
  useVenueMatcher: () => ({ findVenue: () => null, getAutoFillData: () => ({}), isReady: false }),
}));

const listRow = {
  id: "r1",
  name: "Fong's Pizza",
  location: "223 4th St",
  phone: "515-555-0100",
  website: null,
  rating: 4.5,
  opening_date: "2024-05-10",
  status: "open",
  is_featured: false,
  is_sponsored: true,
  sponsored_until: "2026-12-31",
  hours_json: { mon: "11-22" },
  business_status: "OPERATIONAL",
  hours_checked_at: "2026-10-01T00:00:00Z",
  popularity_score: 87,
  is_merged: false,
  merged_into: null,
  enhanced: true,
  slug: "fongs-pizza",
};

function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("ContentEditDialog save payload", () => {
  beforeEach(() => {
    calls.update.length = 0;
    calls.insert.length = 0;
    calls.rpc.length = 0;
    calls.lockedFields = null;
  });

  it("updates a restaurant with only the changed phone", async () => {
    const { default: ContentEditDialog } = await import("@/components/ContentEditDialog");
    const onSave = vi.fn();
    render(
      <ContentEditDialog open onOpenChange={() => {}} contentType="restaurant" item={listRow} onSave={onSave} />,
    );
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "515-555-0199" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(calls.update).toEqual([{ phone: "515-555-0199" }]);
    // WEB-BE-069: the changed field is locked against Google enrichment.
    expect(calls.rpc).toEqual([
      { fn: "set_restaurant_field_locks", args: { p_restaurant_id: "r1", p_lock: ["phone"], p_unlock: [] } },
    ]);
  });

  it("shows a locked field and lets the admin clear the lock", async () => {
    calls.lockedFields = { phone: { by: "owner", at: "2026-11-20T12:00:00Z" } };
    const { default: ContentEditDialog } = await import("@/components/ContentEditDialog");
    render(<ContentEditDialog open onOpenChange={() => {}} contentType="restaurant" item={listRow} onSave={vi.fn()} />);
    const unlock = await screen.findByRole("button", { name: "Unlock Phone so Google can update it" });
    expect(screen.getByText(/Set by the owner on Nov 20, 2026/)).toBeInTheDocument();
    // Counter-check: an unlocked field has no control.
    expect(screen.queryByRole("button", { name: /Unlock Website/ })).toBeNull();
    fireEvent.click(unlock);
    await waitFor(() =>
      expect(calls.rpc).toEqual([
        { fn: "set_restaurant_field_locks", args: { p_restaurant_id: "r1", p_lock: [], p_unlock: ["phone"] } },
      ]),
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: /Unlock Phone/ })).toBeNull());
  });

  it("does not touch locks for content outside the restaurants table", async () => {
    const { default: ContentEditDialog } = await import("@/components/ContentEditDialog");
    const onSave = vi.fn();
    render(
      <ContentEditDialog
        open
        onOpenChange={() => {}}
        contentType="attraction"
        item={{ id: "a1", name: "Science Center", website: null }}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByLabelText("Website"), { target: { value: "https://example.org" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(calls.rpc).toEqual([]);
  });

  it("does not call update when nothing changed", async () => {
    const { default: ContentEditDialog } = await import("@/components/ContentEditDialog");
    const onSave = vi.fn();
    render(
      <ContentEditDialog open onOpenChange={() => {}} contentType="restaurant" item={listRow} onSave={onSave} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Save Changes/ })).not.toBeDisabled());
    expect(calls.update).toEqual([]);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("still inserts a new attraction with the whole form", async () => {
    const { default: ContentEditDialog } = await import("@/components/ContentEditDialog");
    const onSave = vi.fn();
    render(
      <ContentEditDialog
        open
        onOpenChange={() => {}}
        contentType="attraction"
        item={{ isNew: true, name: "", type: "Museum", is_featured: false }}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Science Center" } });
    fireEvent.click(screen.getByRole("button", { name: /^Create/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(calls.insert).toHaveLength(1);
    expect(calls.insert[0]).toMatchObject({ name: "Science Center", type: "Museum", is_featured: false });
    expect(calls.insert[0]).not.toHaveProperty("isNew");
  });
});
