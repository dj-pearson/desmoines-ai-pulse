import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * WEB-PERF-057 (c): the affiliate unit named its landmark after the partner
 * ("Booking affiliate advertisement"), so it read differently from the
 * campaign slot in the same position and two affiliate slots on one page could
 * share a name. It is named by placement now, like AdBanner (WEB-UX-046).
 */

vi.mock("@/hooks/useAffiliateAd", () => ({
  useAffiliateAd: () => ({
    partner: { name: "Fixture Partner" },
    imageUrl: "https://affiliate.example.test/728x90.png",
    affiliateUrl: "https://affiliate.example.test/landing",
    width: 728,
    height: 90,
  }),
}));
vi.mock("@/lib/tracking", () => ({
  createViewabilityObserver: () => ({ disconnect: vi.fn() }),
}));
vi.mock("@/lib/adAnalytics", () => ({ logAdImpression: vi.fn(), logAdClick: vi.fn() }));
vi.mock("@/lib/capacitorUtils", () => ({ isCapacitor: () => false, openExternalUrl: vi.fn() }));

import { AffiliateAdBanner } from "@/components/AffiliateAdBanner";

describe("AffiliateAdBanner landmark name", () => {
  it.each([
    ["top_banner", "Advertisement, top of page"],
    ["featured_spot", "Advertisement, featured"],
    ["below_fold", "Advertisement, below listings"],
  ] as const)("%s is named %s", (placement, name) => {
    render(<AffiliateAdBanner placement={placement} />);
    expect(screen.getByRole("complementary", { name })).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: /Fixture Partner/ })).toBeNull();
    // The partner is still named, in the creative's alt text.
    expect(screen.getByAltText(/Fixture Partner/)).toBeTruthy();
  });
});
