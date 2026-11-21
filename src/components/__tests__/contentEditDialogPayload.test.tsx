import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * WEB-BE-067 at the component: the dialog opened on a restaurant list row
 * (with sponsorship, hours and closure columns) sends only the field the
 * admin changed. The pure builder is covered in contentEditPayload.test.ts;
 * this proves the dialog actually uses it.
 */

const calls = vi.hoisted(() => ({ update: [] as unknown[], insert: [] as unknown[] }));

vi.mock("@/integrations/supabase/client", () => {
  const row = { id: "r1" };
  return {
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }),
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

describe("ContentEditDialog save payload", () => {
  beforeEach(() => {
    calls.update.length = 0;
    calls.insert.length = 0;
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
