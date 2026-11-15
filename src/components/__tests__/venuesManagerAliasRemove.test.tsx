import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * WEB-UX-073. In the admin venue dialog each alias Badge removed its alias
 * through onClick on the Badge (a div), so a keyboard user could not reach
 * it and a screen reader heard only "VMH x". Each alias now has its own
 * named remove button. This renders the real VenuesManager, opens the edit
 * dialog for a venue with two aliases, and removes one with the button.
 */

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({}) },
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const venue = {
  id: "v-1",
  name: "Vibrant Music Hall",
  aliases: ["VMH", "Vibrant"],
  address: "6111 Mills Civic Pkwy",
  city: "West Des Moines",
  state: "IA",
  zip: "50266",
  latitude: 41.57,
  longitude: -93.8,
  phone: null,
  email: null,
  website: null,
  venue_type: "music_hall",
  capacity: 3000,
  description: null,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

vi.mock("@/hooks/useKnownVenues", () => ({
  useKnownVenues: () => ({ data: [venue], isLoading: false }),
  useVenueStats: () => ({
    total: 1,
    active: 1,
    inactive: 0,
    withCoordinates: 1,
    byType: { music_hall: 1 },
  }),
  useCreateVenue: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateVenue: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteVenue: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVenueMatcher: () => ({ findVenue: vi.fn(), getAutoFillData: vi.fn() }),
}));

import VenuesManager from "../admin/VenuesManager";

function openEditDialog() {
  render(<VenuesManager />);
  fireEvent.click(screen.getByRole("button", { name: /edit vibrant music hall/i }));
  return screen.getByRole("dialog");
}

describe("VenuesManager alias badges (WEB-UX-073)", () => {
  it("gives every alias a named, focusable remove button", () => {
    const dialog = openEditDialog();
    const list = within(dialog).getByRole("list", { name: "Aliases" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);

    const removeVmh = within(dialog).getByRole("button", { name: "Remove alias VMH" });
    const removeVibrant = within(dialog).getByRole("button", { name: "Remove alias Vibrant" });
    for (const b of [removeVmh, removeVibrant]) {
      expect(b.tagName).toBe("BUTTON");
      expect(b.getAttribute("type")).toBe("button");
      b.focus();
      expect(document.activeElement).toBe(b);
    }
  });

  it("removes only that alias, and the badge is no longer the click target", () => {
    const dialog = openEditDialog();
    // Clicking the alias text must not remove it any more.
    fireEvent.click(within(dialog).getByText("Vibrant"));
    expect(within(dialog).getByRole("button", { name: "Remove alias Vibrant" })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove alias VMH" }));
    expect(within(dialog).queryByRole("button", { name: "Remove alias VMH" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Remove alias Vibrant" })).toBeTruthy();
  });

  it("drops the empty list once the last alias is removed", () => {
    const dialog = openEditDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove alias VMH" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove alias Vibrant" }));
    expect(within(dialog).queryByRole("list", { name: "Aliases" })).toBeNull();
  });
});
