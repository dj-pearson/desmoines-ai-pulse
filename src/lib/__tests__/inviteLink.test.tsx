import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

/**
 * WEB-ADS-021. The invite card's link was `/?ref=CODE` and nothing else, so a
 * newsletter signup that came through a friend's invite was stored with no
 * campaign. The link now carries utm_source=referral&utm_medium=invite next to
 * ref. Three things must hold together: the link has the pair, the referral
 * capture still finds ref in it, and a signup after landing on it sends
 * utm_source=referral.
 */
const rpc = vi.fn();
const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: vi.fn(),
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuthState: () => ({ user: null }) }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { inviteLink } = await import("@/lib/referralCode");
const { readStoredReferral, REFERRAL_STORAGE_KEY, useReferralCapture } = await import(
  "@/hooks/useReferralCapture"
);
const { captureCampaignAttribution, resetSessionAttributionForTests } = await import(
  "@/lib/campaignAttribution"
);
const { useNewsletterSubscription } = await import("@/hooks/useNewsletterSubscription");
const { storage } = await import("@/lib/safeStorage");

const BASE = "https://desmoinesinsider.com";

/** The path-and-query a visitor lands on when they open the link. */
function landing(link: string): { pathname: string; search: string } {
  const url = new URL(link);
  return { pathname: url.pathname, search: url.search };
}

beforeEach(() => {
  storage.remove(REFERRAL_STORAGE_KEY);
  resetSessionAttributionForTests();
  rpc.mockReset();
  invoke.mockReset();
});

afterEach(() => {
  resetSessionAttributionForTests();
});

describe("inviteLink", () => {
  it("carries ref and the referral/invite utm pair", () => {
    const params = new URL(inviteLink(BASE, "ABCD2345")).searchParams;
    expect(params.get("ref")).toBe("ABCD2345");
    expect(params.get("utm_source")).toBe("referral");
    expect(params.get("utm_medium")).toBe("invite");
  });

  it("points at the home page whether or not the base ends in a slash", () => {
    expect(landing(inviteLink(BASE, "ABCD2345")).pathname).toBe("/");
    expect(inviteLink(`${BASE}/`, "ABCD2345")).toBe(inviteLink(BASE, "ABCD2345"));
  });
});

describe("a visitor who opens an invite link", () => {
  it("has the referral code captured from the tagged link", () => {
    const { pathname, search } = landing(inviteLink(BASE, "ABCD2345"));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[`${pathname}${search}`]}>{children}</MemoryRouter>
    );
    renderHook(() => useReferralCapture(), { wrapper });
    expect(readStoredReferral()).toBe("ABCD2345");
  });

  it("subscribes later with utm_source=referral, not with no campaign", async () => {
    const { search } = landing(inviteLink(BASE, "ABCD2345"));
    // What useCampaignAttributionCapture does on the landing page, without
    // analytics consent: memory only.
    captureCampaignAttribution(search, false);
    invoke.mockResolvedValue({ data: { ok: true, message: "ok" }, error: null });
    const { result } = renderHook(() => useNewsletterSubscription());

    await act(async () => {
      await result.current.subscribe({ email: "friend@example.com", source: "footer" });
    });

    const [, options] = invoke.mock.calls[0] as [string, { body: { utm: Record<string, unknown> } }];
    expect(options.body.utm).toEqual({
      utm_source: "referral",
      utm_medium: "invite",
      utm_campaign: null,
    });
  });
});
