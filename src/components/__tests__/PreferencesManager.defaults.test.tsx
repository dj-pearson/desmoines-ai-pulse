/**
 * Account plan WP5 item 5: consent defaults match sign-up.
 *
 * Sign-up leaves marketing email and personalization unticked. PreferencesManager
 * read a missing key as `true`, which is every Google and Apple account (they
 * never see the sign-up form), and pressing Save for an unrelated interest then
 * wrote that opt-in to the row. useEmailPreferences did the same for the weekly
 * digest: no row read as "on", while the sender only mails users WITH a row.
 *
 * So: a null bag and no digest row render all three switches off, and a save
 * writes only the key the user changed, keeps every other key in the shared
 * bag, and records the flip in consent_records.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/** What each table answers. Reset per test. */
const answers: Record<string, { data: unknown; error: unknown }> = {};

function builder(table: string) {
  const result = () => Promise.resolve(answers[table] ?? { data: null, error: null });
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) {
    chain[method] = () => chain;
  }
  chain.single = result;
  chain.maybeSingle = result;
  chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    result().then(resolve, reject);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => builder(table) },
}));

const updateProfile = vi.fn().mockResolvedValue({});

/** ONE STABLE OBJECT: a fresh literal per render re-fires useEffect([profile]) forever. */
const PROFILE_STATE = {
  profile: {
    interests: ["music"],
    location: null,
    communication_preferences: null as Record<string, unknown> | null,
  },
  updateProfile,
  isLoading: false,
};
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => PROFILE_STATE }));

const AUTH = { user: { id: "user-1", email: "local@example.com" }, isAuthenticated: true };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => AUTH }));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const logConsent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/consentLog", () => ({ logConsent: (...args: unknown[]) => logConsent(...args) }));

vi.mock("@/lib/errorHandler", () => ({ handleError: vi.fn() }));

const { default: PreferencesManager, ConsentSwitch, readOptIn } = await import("../PreferencesManager");
const { EmailPreferencesCard } = await import("../EmailPreferencesCard");

function withQueryClient(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

describe("consent defaults (account plan WP5 item 5)", () => {
  beforeEach(() => {
    for (const key of Object.keys(answers)) delete answers[key];
    PROFILE_STATE.profile.communication_preferences = null;
    updateProfile.mockClear();
    logConsent.mockClear();
    toast.mockClear();
  });

  it("reads only an explicit true as an opt-in", () => {
    expect(readOptIn(null, "email_notifications")).toBe(false);
    expect(readOptIn({}, "email_notifications")).toBe(false);
    expect(readOptIn({ email_notifications: "yes" }, "email_notifications")).toBe(false);
    expect(readOptIn({ email_notifications: true }, "email_notifications")).toBe(true);
  });

  it("renders all three opt-ins unticked for a null bag and no digest row", async () => {
    answers.user_email_preferences = { data: null, error: null };
    answers.weekly_digest_log = { data: null, error: null };

    render(
      withQueryClient(
        <>
          <PreferencesManager />
          <ConsentSwitch
            consentKey="email_notifications"
            id="account-emails"
            label="Account and activity emails"
            description="test"
          />
          <EmailPreferencesCard />
        </>,
      ),
    );

    const state = (el: HTMLElement) => el.getAttribute("aria-checked");
    expect(state(screen.getByRole("switch", { name: /personalized suggestions/i }))).toBe("false");
    expect(state(screen.getByRole("switch", { name: /account and activity emails/i }))).toBe("false");
    expect(state(await screen.findByRole("switch", { name: /weekly event digest/i }))).toBe("false");
    expect(screen.getByText(/not sent to you yet/i)).toBeTruthy();
    expect(screen.queryByRole("switch", { name: /sms/i })).toBeNull();
  });

  it("saving an interest writes no consent key", async () => {
    render(withQueryClient(<PreferencesManager />));

    await userEvent.click(screen.getByRole("checkbox", { name: /food & dining/i }));
    await userEvent.click(screen.getByRole("button", { name: /save preferences/i }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    const written = updateProfile.mock.calls[0][0];
    expect(written.interests).toEqual(["music", "food"]);
    expect(written.communication_preferences).toBeUndefined();
    expect(logConsent).not.toHaveBeenCalled();
  });

  it("a flip writes only that key, keeps the rest of the bag, and records consent", async () => {
    const stored = { marketing: false, taste_preferences: { cuisines: ["thai"] } };
    PROFILE_STATE.profile.communication_preferences = stored;
    answers.profiles = { data: { communication_preferences: stored }, error: null };

    render(withQueryClient(<PreferencesManager />));

    await userEvent.click(screen.getByRole("switch", { name: /personalized suggestions/i }));
    await userEvent.click(screen.getByRole("button", { name: /save preferences/i }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    const bag = updateProfile.mock.calls[0][0].communication_preferences;
    expect(bag).toEqual({ ...stored, event_recommendations: true });
    expect(bag).not.toHaveProperty("email_notifications");
    expect(bag).not.toHaveProperty("sms_notifications");

    expect(logConsent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "personalization_ai", granted: true, source: "profile_settings" }),
    );
  });

  it("a failed read of the bag writes nothing (WEB-LEGAL-012)", async () => {
    answers.profiles = { data: null, error: { message: "boom" } };

    render(withQueryClient(<PreferencesManager />));

    await userEvent.click(screen.getByRole("switch", { name: /personalized suggestions/i }));
    await userEvent.click(screen.getByRole("button", { name: /save preferences/i }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
    expect(updateProfile).not.toHaveBeenCalled();
    expect(logConsent).not.toHaveBeenCalled();
  });
});
