import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Growth roadmap #9: a saved search as a personal calendar feed.
 *
 * The dialog never writes the token itself; every change goes through the
 * setCalendarFeed mutation (set_saved_search_calendar). These pin which call
 * each button makes, and that the link shown is the production URL with the
 * row's token, never the page origin (capacitor://localhost in the apps).
 */

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { SavedSearchCalendarDialog } from "@/components/dashboard/SavedSearchCalendarDialog";
import type { SavedSearchListItem } from "@/hooks/useSavedSearchAlerts";
import { normalizeSavedSearch } from "@/lib/savedSearchFilters";

const TOKEN = "3f2b9c1e-8a4d-4f6e-9b2a-1c3d5e7f9a0b";

function row(calendar_token: string | null): SavedSearchListItem {
  const base = {
    id: "s1",
    user_id: "u1",
    name: "Jazz in WDM",
    filters: { q: "jazz" },
    search_type: "event_list",
    alerts_enabled: true,
    calendar_token,
    created_at: "",
    updated_at: "",
    last_alerted_at: null,
    last_used: null,
    use_count: 1,
  };
  return { ...base, normalized: normalizeSavedSearch(base) };
}

function setup(token: string | null) {
  const mutate = vi.fn();
  const setCalendarFeed = { mutate, isPending: false } as never;
  render(<SavedSearchCalendarDialog search={row(token)} onClose={vi.fn()} setCalendarFeed={setCalendarFeed} />);
  return { mutate };
}

describe("SavedSearchCalendarDialog", () => {
  it("offers to make a link when the feed is off", async () => {
    const { mutate } = setup(null);
    expect(screen.queryByText("Add to Google Calendar")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Make a calendar link" }));
    expect(mutate.mock.calls[0][0]).toEqual({ id: "s1", enabled: true, rotate: false });
  });

  it("shows the production feed URL when the feed is on", () => {
    setup(TOKEN);
    const url = `https://desmoinesinsider.com/calendar/my/${TOKEN}.ics`;
    expect(screen.getByLabelText("Or copy the link into any calendar app")).toHaveValue(url);
    expect(screen.getByRole("link", { name: "Add to Apple Calendar" })).toHaveAttribute(
      "href",
      `webcal://desmoinesinsider.com/calendar/my/${TOKEN}.ics`,
    );
    expect(screen.getByText(/Anyone with this link/)).toBeInTheDocument();
  });

  it("rotates and turns off through the RPC, not a direct write", async () => {
    const { mutate } = setup(TOKEN);
    await userEvent.click(screen.getByRole("button", { name: "Get a new link" }));
    await userEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(mutate.mock.calls.map((c) => c[0])).toEqual([
      { id: "s1", enabled: true, rotate: true },
      { id: "s1", enabled: false, rotate: false },
    ]);
  });
});
