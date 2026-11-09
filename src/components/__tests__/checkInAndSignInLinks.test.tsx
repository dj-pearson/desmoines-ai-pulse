import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Loop 13 UX + a11y:
 * - BottomNav's Sign In linked to bare /auth, so a visitor signing in from the
 *   tab bar landed on / instead of the page they were on.
 * - EventCheckIn and EventReminderSettings said "Sign in to..." with no link.
 * - The check-in buttons showed the chosen answer by colour only.
 * - The check-in toast read "Marked as not_going!".
 */

const authState = { isAuthenticated: false };
const userState: { user: { id: string } | null } = { user: null };

vi.mock("@/contexts/AuthContext", () => ({
  useAuthFlags: () => ({ isAuthenticated: authState.isAuthenticated, isAdmin: false }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => userState }));
vi.mock("@/hooks/useCommunityFeatures", () => ({
  useCommunityFeatures: () => ({
    updateEventCheckIn: vi.fn().mockResolvedValue(true),
    getUserEventCheckIn: vi.fn().mockResolvedValue("not_going"),
    getEventCheckIns: vi.fn().mockResolvedValue({
      going: 0, interested: 0, maybe: 0, not_going: 1, total: 1,
    }),
  }),
}));
vi.mock("@/hooks/useEventReminders", () => ({
  useEventReminders: () => ({
    isAuthenticated: false,
    isLoading: false,
    isReminderEnabled: () => false,
    toggleReminder: vi.fn(),
    isTogglingReminder: false,
  }),
}));

import BottomNav from "@/components/BottomNav";
import { EventCheckIn } from "@/components/EventCheckIn";
import { EventReminderSettings } from "@/components/EventReminderSettings";
import { CHECK_IN_LABELS, CHECK_IN_STATUSES, checkInToastMessage } from "@/lib/checkInStatus";

function renderAt(path: string, ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  authState.isAuthenticated = false;
  userState.user = null;
});

describe("check-in labels", () => {
  it("has a human label for every stored status", () => {
    expect(CHECK_IN_STATUSES.map((s) => CHECK_IN_LABELS[s])).toEqual([
      "Going",
      "Interested",
      "Maybe",
      "Not going",
    ]);
  });

  it("never puts the raw status value in the toast", () => {
    expect(checkInToastMessage("not_going")).toBe("Marked as not going");
    for (const status of CHECK_IN_STATUSES) {
      expect(checkInToastMessage(status)).not.toMatch(/_/);
    }
  });
});

describe("BottomNav sign-in", () => {
  it("returns to the current page after sign-in", () => {
    renderAt("/events/some-event?tab=photos", <BottomNav />);
    const link = screen.getByRole("link", { name: "Sign In" });
    expect(link.getAttribute("href")).toBe(
      `/auth?redirect=${encodeURIComponent("/events/some-event?tab=photos")}`
    );
  });

  it("is bare /auth on the home page", () => {
    renderAt("/", <BottomNav />);
    expect(screen.getByRole("link", { name: "Sign In" }).getAttribute("href")).toBe("/auth");
  });

  it("links signed-in visitors to the dashboard", () => {
    authState.isAuthenticated = true;
    renderAt("/events", <BottomNav />);
    expect(screen.getByRole("link", { name: "Account" }).getAttribute("href")).toBe("/dashboard");
  });
});

describe("EventCheckIn", () => {
  it("links signed-out visitors to sign in and back", () => {
    renderAt("/events/abc", <EventCheckIn eventId="abc" eventTitle="Jazz Night" />);
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link.getAttribute("href")).toBe(`/auth?redirect=${encodeURIComponent("/events/abc")}`);
  });

  it("exposes the chosen answer with aria-pressed", async () => {
    userState.user = { id: "u1" };
    renderAt("/events/abc", <EventCheckIn eventId="abc" eventTitle="Jazz Night" />);
    const group = screen.getByRole("group", { name: "Your status for this event" });
    const notGoing = await within(group).findByRole("button", { name: "Not going", pressed: true });
    expect(notGoing).toBeTruthy();
    for (const label of ["Going", "Interested", "Maybe"]) {
      expect(within(group).getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe(
        "false"
      );
    }
    for (const button of within(group).getAllByRole("button")) {
      expect(button.className).toContain("min-h-[44px]");
    }
  });
});

describe("EventReminderSettings", () => {
  it("links signed-out visitors to sign in and back", () => {
    renderAt("/events/abc", <EventReminderSettings eventId="abc" />);
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link.getAttribute("href")).toBe(`/auth?redirect=${encodeURIComponent("/events/abc")}`);
  });
});
