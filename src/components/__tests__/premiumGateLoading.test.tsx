import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * WEB-FEAT-018 — a paying subscriber must never be told to upgrade.
 *
 * useSubscription reports tier "free" until the user-subscriptions query
 * resolves, and PremiumGate never consulted the loading flag. So a VIP loading
 * /trip-planner got "Upgrade to Unlock" first and the feature they pay for
 * second, on every single load.
 *
 * The gate is asserted through what it RENDERS rather than through the hook,
 * because the bug lived in the gap between the two.
 */
let mockSubscription = {
  hasFeature: (_f: string) => true,
  tier: "vip",
  isPremium: true,
  subscriptionLoading: false,
};

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => mockSubscription,
}));
vi.mock("@/components/UpgradeModal", () => ({
  UpgradeModal: () => null,
}));

const { PremiumGate } = await import("@/components/PremiumGate");

const renderGate = (props: Record<string, unknown> = {}) =>
  render(
    <MemoryRouter>
      <PremiumGate feature="trip_planner" {...props}>
        <p>the paid feature</p>
      </PremiumGate>
    </MemoryRouter>,
  );

beforeEach(() => {
  mockSubscription = {
    hasFeature: () => true,
    tier: "vip",
    isPremium: true,
    subscriptionLoading: false,
  };
});

describe("PremiumGate while the subscription is resolving", () => {
  it("does not show the upgrade wall to a subscriber mid-load", () => {
    // The exact sequence that shipped: loading, so tier reads "free".
    mockSubscription = {
      hasFeature: () => false,
      tier: "free",
      isPremium: false,
      subscriptionLoading: true,
    };
    renderGate();

    expect(screen.queryByText(/upgrade/i)).toBeNull();
    expect(screen.getByLabelText(/checking your subscription/i)).toBeTruthy();
  });

  it("renders nothing at all in hide mode while loading", () => {
    mockSubscription = {
      hasFeature: () => false,
      tier: "free",
      isPremium: false,
      subscriptionLoading: true,
    };
    const { container } = renderGate({ mode: "hide" });
    expect(container.textContent).toBe("");
  });

  it("shows the content once the subscription resolves in the user's favour", () => {
    renderGate();
    expect(screen.getByText("the paid feature")).toBeTruthy();
  });

  it("still shows the wall to a free user once resolved", () => {
    // The gate must not have been softened into never gating: a resolved free
    // tier is the case it exists for.
    mockSubscription = {
      hasFeature: () => false,
      tier: "free",
      isPremium: false,
      subscriptionLoading: false,
    };
    renderGate();
    expect(screen.queryByText("the paid feature")).toBeNull();
    expect(screen.getByText(/upgrade to insider/i)).toBeTruthy();
  });
});
