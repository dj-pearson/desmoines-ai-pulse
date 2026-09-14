/**
 * WEB-SEO-040: a detail page must emit `noindex` only when the query SUCCEEDED
 * and returned no row. On a thrown query it renders a retry state and no robots
 * meta at all, so a transient PostgREST error cannot deindex a live page.
 *
 * SeasonalGuide stands in for the six pages that shared the same shape
 * (VenueDetail, TrailDetail, ItineraryDetail, TeamDetail, HotelDetails,
 * EventDetails); they were patched together and the branch is identical.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

const useSeasonalGuide = vi.fn();

vi.mock("@/hooks/useSeasonalGuides", () => ({
  useSeasonalGuide: (slug: string) => useSeasonalGuide(slug),
  getSeasonLabel: () => "Fall",
  getSeasonColor: () => "",
}));
vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/components/RouteCanonical", () => ({ RouteCanonical: () => null }));

import SeasonalGuide from "@/pages/SeasonalGuide";

function renderPage() {
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={["/guides/fall-in-des-moines"]}>
        <SeasonalGuide />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

function robotsMetas(): string[] {
  return Array.from(
    document.head.querySelectorAll('meta[name="robots"], meta[name="googlebot"]'),
  ).map((m) => m.getAttribute("content") ?? "");
}

describe("WEB-SEO-040 detail page robots meta", () => {
  beforeEach(() => {
    document.head.querySelectorAll("meta").forEach((m) => m.remove());
    useSeasonalGuide.mockReset();
  });

  it("emits no robots meta when the query threw", async () => {
    useSeasonalGuide.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("PostgREST 503"),
      refetch: vi.fn(),
    });
    renderPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain("couldn't load this guide");
    });
    expect(robotsMetas()).toEqual([]);
  });

  it("emits noindex when the query succeeded with no row", async () => {
    useSeasonalGuide.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    await waitFor(() => {
      expect(robotsMetas().length).toBeGreaterThan(0);
    });
    expect(robotsMetas().every((c) => c.startsWith("noindex"))).toBe(true);
  });
});
