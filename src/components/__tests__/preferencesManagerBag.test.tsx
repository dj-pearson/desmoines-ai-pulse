/**
 * WEB-LEGAL-012. profiles.communication_preferences is a SHARED JSONB bag and
 * this screen owns three of its keys. Two other writers keep their own -
 * useUserPreferences.ts writes taste_preferences, use-user-preferences.ts
 * writes ui_preferences - and the lifecycle classifier reads `marketing` and
 * `email` out of it to derive messagingAllowed, which gates every nurture,
 * re-engagement, churn, milestone and outreach agent.
 *
 * PreferencesManager sent a fresh three-key object, and a PostgREST update of a
 * JSONB column REPLACES it. So pressing "Save Preferences" deleted the other
 * keys - including a marketing opt-out, which silently opts the user back in.
 * Both other writers already read-then-merge; one carries a comment saying why.
 *
 * These tests assert the merge, and that a failed read does not fall back to an
 * empty bag - that fallback IS the data-losing write.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const single = vi.fn();
const updateProfile = vi.fn().mockResolvedValue({});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => single() }) }),
    }),
  },
}));

/** The bag as it stands on the server before this screen saves. */
const STORED = {
  email_notifications: true,
  taste_preferences: { cuisines: ["thai"] },
  ui_preferences: { theme: "dark" },
  marketing: false,
};

/**
 * ONE STABLE OBJECT, not a fresh literal per call. PreferencesManager seeds its
 * form in useEffect([profile]); a mock returning a new object each render
 * changes that dependency every render, so the effect re-fires forever. The
 * first version of this file did that and killed the vitest worker after 198s
 * with "Worker exited unexpectedly" rather than any test failure.
 */
const PROFILE = {
  profile: {
    interests: ["Music"],
    location: "Des Moines",
    communication_preferences: STORED,
  },
  updateProfile,
  isLoading: false,
};

vi.mock("@/hooks/useProfile", () => ({ useProfile: () => PROFILE }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isAuthenticated: true }),
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const PreferencesManager = (await import("../PreferencesManager")).default;

async function save() {
  render(<PreferencesManager />);
  await userEvent.click(await screen.findByRole("button", { name: /Save Preferences/i }));
}

describe("PreferencesManager and the shared preference bag", () => {
  beforeEach(() => {
    single.mockReset();
    updateProfile.mockClear();
    toast.mockClear();
  });

  it("keeps every key it does not own", async () => {
    single.mockResolvedValue({ data: { communication_preferences: STORED }, error: null });
    await save();

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    const bag = updateProfile.mock.calls[0][0].communication_preferences;

    // The three keys this screen owns are written.
    expect(bag.email_notifications).toBe(true);
    expect(bag.sms_notifications).toBe(false);
    expect(bag.event_recommendations).toBe(true);

    // The keys it does not own survive. marketing:false is the one that
    // matters - losing it opts a user back into every nurture agent.
    expect(bag.marketing).toBe(false);
    expect(bag.taste_preferences).toEqual({ cuisines: ["thai"] });
    expect(bag.ui_preferences).toEqual({ theme: "dark" });
  });

  it("does not write an empty bag when the read fails", async () => {
    single.mockResolvedValue({ data: null, error: { message: "boom" } });
    await save();

    await waitFor(() => expect(toast).toHaveBeenCalled());
    // No write at all beats a write that drops the other keys.
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
