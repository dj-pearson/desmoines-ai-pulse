import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Growth roadmap #3. The panel renders only what get_listing_owner_stats
 * returns, hides itself while the function is not deployed, and says plainly
 * when there is no comparison rather than inventing one.
 */

const hook = vi.fn();
vi.mock("@/hooks/useListingOwnerStats", () => ({
  useListingOwnerStats: (...args: unknown[]) => hook(...args),
}));

import { ListingStatsPanel } from "@/components/business/ListingStatsPanel";

const OK = {
  status: "ok",
  days: 30,
  from: "2026-10-09",
  to: "2026-11-07",
  series: [
    { date: "2026-11-06", views: 20, shares: 3, clicks: 7 },
    { date: "2026-11-07", views: 30, shares: 0, clicks: 0 },
  ],
  totals: { views: 50, shares: 3, clicks: 7 },
  previous: { views: 20, shares: 0, clicks: 0 },
  peers: { group: "cuisine", label: "Mexican", size: 6, median_views: 20, percentile: 67 },
};

const renderPanel = () =>
  render(<ListingStatsPanel listingType="restaurant" listingId="r1" />);

beforeEach(() => hook.mockReset());

describe("ListingStatsPanel", () => {
  it("shows the totals, the change and the comparison", () => {
    hook.mockReturnValue({ data: OK, isLoading: false, error: null, refetch: vi.fn() });
    renderPanel();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("Up 150% on the previous 30 days")).toBeInTheDocument();
    expect(screen.getByText(/More page views than 67% of the 6 other Mexican restaurants/)).toBeInTheDocument();
    expect(screen.getByText(/allowed analytics cookies/)).toBeInTheDocument();
  });

  it("asks the hook for the chosen range", async () => {
    hook.mockReturnValue({ data: OK, isLoading: false, error: null, refetch: vi.fn() });
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "7 days" }));
    expect(hook).toHaveBeenLastCalledWith("restaurant", "r1", 7, true);
  });

  it("says when there is no fair comparison", () => {
    hook.mockReturnValue({ data: { ...OK, peers: null }, isLoading: false, error: null, refetch: vi.fn() });
    renderPanel();
    expect(screen.getByText(/enough similar places/)).toBeInTheDocument();
  });

  it("renders nothing while the function is not deployed", () => {
    hook.mockReturnValue({ data: null, isLoading: false, error: null, refetch: vi.fn() });
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
  });

  it("explains venues instead of showing zeros", () => {
    hook.mockReturnValue({ data: { status: "no_data", days: 30 }, isLoading: false, error: null, refetch: vi.fn() });
    renderPanel();
    expect(screen.getByText(/don't track page visits for venue listings/)).toBeInTheDocument();
  });
});
