/**
 * WEB-SEO-036: a neighborhood page holding fewer than five rows must take
 * itself out of the index rather than ship a promise it cannot keep.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

const useNeighborhoodContent = vi.fn();

vi.mock("@/hooks/useNeighborhoodContent", () => ({
  useNeighborhoodContent: (name?: string) => useNeighborhoodContent(name),
  NEIGHBORHOOD_MIN_ITEMS: 5,
}));
vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/components/NeighborhoodGuide", () => ({
  default: ({ neighborhood }: { neighborhood: string }) => <div>Guide for {neighborhood}</div>,
}));
vi.mock("@/components/LocalSEO", () => ({ default: () => null }));
vi.mock("@/components/RouteCanonical", () => ({ RouteCanonical: () => null }));

import NeighborhoodPage from "@/pages/NeighborhoodPage";

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: String(i) }));
}

function renderPage() {
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={["/neighborhoods/beaverdale"]}>
        <Routes>
          <Route path="/neighborhoods/:neighborhood" element={<NeighborhoodPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

function robots(): string[] {
  return Array.from(document.head.querySelectorAll('meta[name="robots"]')).map(
    (m) => m.getAttribute("content") ?? "",
  );
}

describe("WEB-SEO-036 neighborhood thin-content guard", () => {
  beforeEach(() => {
    document.head.querySelectorAll("meta").forEach((m) => m.remove());
    useNeighborhoodContent.mockReset();
  });

  it("noindexes a neighborhood with fewer than five rows", async () => {
    useNeighborhoodContent.mockReturnValue({
      data: { events: rows(2), restaurants: rows(1), attractions: [], total: 3 },
      isLoading: false,
    });
    renderPage();
    await waitFor(() => expect(robots().length).toBeGreaterThan(0));
    expect(robots().every((c) => c.startsWith("noindex"))).toBe(true);
    expect(document.body.textContent).toContain("Nothing listed in Beaverdale yet");
  });

  it("renders the guide and no noindex once five rows exist", async () => {
    useNeighborhoodContent.mockReturnValue({
      data: { events: rows(3), restaurants: rows(2), attractions: [], total: 5 },
      isLoading: false,
    });
    renderPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain("Guide for Beaverdale");
    });
    expect(robots()).toEqual([]);
  });
});
