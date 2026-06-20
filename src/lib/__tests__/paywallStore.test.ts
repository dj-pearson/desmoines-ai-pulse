import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { openPaywall, closePaywall, usePaywallState } from "@/lib/paywallStore";

/** WEB-FEAT-001 — the global store that drives the one app-root paywall modal. */
describe("paywall store", () => {
  beforeEach(() => act(() => closePaywall()));

  it("openPaywall sets open + feature + tier; closePaywall clears open", () => {
    const { result } = renderHook(() => usePaywallState());

    expect(result.current.open).toBe(false);

    act(() => openPaywall("unlimited_favorites", "insider"));
    expect(result.current.open).toBe(true);
    expect(result.current.feature).toBe("unlimited_favorites");
    expect(result.current.requiredTier).toBe("insider");

    act(() => closePaywall());
    expect(result.current.open).toBe(false);
  });

  it("closePaywall is idempotent", () => {
    const { result } = renderHook(() => usePaywallState());
    act(() => openPaywall("trip_planner"));
    expect(result.current.feature).toBe("trip_planner");
    expect(result.current.requiredTier).toBe("insider"); // defaults to insider

    act(() => closePaywall());
    act(() => closePaywall());
    expect(result.current.open).toBe(false);
  });
});
