/**
 * WEB-FEAT-070: the /social "For You" badge was never earned.
 *
 * TrendingContent filled its grid from useSimplePersonalization and badged
 * every one of those cards "For You". The hook's two personal signals were
 * reads of search_analytics and user_analytics, and both tables have an
 * admin-only SELECT policy, so for every visitor RLS answered [] and the hook
 * fell through to "most recently added" rows. Even for an admin, the boost
 * compared a search category ("Music") with a content type ("event") and never
 * matched. So: no "For You", the fill says what it is, an item already in the
 * trending half is not shown twice, and a fill card carries no invented score.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

/** Every table read the hook makes, by name. */
const tablesRead: string[] = [];

function builder(table: string) {
  tablesRead.push(table);
  // What RLS gives a non-admin for an admin-only SELECT: no rows, no error.
  const result = () => Promise.resolve({ data: [], error: null });
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "order", "limit", "insert"]) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    result().then(resolve, reject);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => builder(table) },
}));

const AUTH = { user: { id: "user-1" }, isAuthenticated: true };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => AUTH }));

const recentRows: Record<string, Array<Record<string, unknown>>> = {};
vi.mock("@/lib/trendingContent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/trendingContent")>();
  return {
    ...actual,
    fetchRecentVisibleContent: vi.fn(async (type: string) => recentRows[type] ?? []),
    fetchVisibleContent: vi.fn(async () => new Map()),
  };
});

const trending = {
  trendingItems: [] as Array<Record<string, unknown>>,
  isLoading: false,
  error: null,
  refreshTrending: vi.fn(),
};
vi.mock("@/hooks/useTrendingContent", () => ({ useTrending: () => trending }));

import TrendingContent from "@/components/TrendingContent";

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const ROW_A = { id: "r-a", name: "Alpha Bistro", image_url: "https://example.com/a.jpg", slug: "alpha-bistro" };
const ROW_B = { id: "r-b", name: "Beta Grill", image_url: "https://example.com/b.jpg", slug: "beta-grill" };

beforeEach(() => {
  tablesRead.length = 0;
  trending.trendingItems = [];
  for (const key of Object.keys(recentRows)) delete recentRows[key];
});

describe("TrendingContent fill on /social", () => {
  it("never labels a recently added row 'For You'", async () => {
    recentRows.restaurant = [ROW_A, ROW_B];
    render(wrap(<TrendingContent contentType="restaurant" limit={6} showPersonalized />));

    await screen.findByText("Alpha Bistro");
    expect(screen.queryByText("For You")).toBeNull();
    expect(screen.getAllByText("Recently added")).toHaveLength(2);
  });

  it("shows an item that is both trending and recent once", async () => {
    recentRows.restaurant = [ROW_A, ROW_B];
    trending.trendingItems = [
      {
        id: "trending-r-a",
        contentType: "restaurant",
        contentId: "r-a",
        content: ROW_A,
        trendingScore: 42,
        timeWindow: "7d",
        reason: "Hot",
      },
    ];
    render(wrap(<TrendingContent contentType="restaurant" limit={6} showPersonalized />));

    await screen.findByText("Beta Grill");
    expect(screen.getAllByText("Alpha Bistro")).toHaveLength(1);
    // The trending card keeps its real score; the fill card invents none.
    expect(screen.getByText("Score: 42")).toBeTruthy();
    expect(screen.queryByText("Score: 10")).toBeNull();
  });

  it("does not read the admin-only analytics tables", async () => {
    recentRows.restaurant = [ROW_A];
    render(wrap(<TrendingContent contentType="restaurant" limit={6} showPersonalized />));

    await screen.findByText("Alpha Bistro");
    await waitFor(() => expect(screen.queryByText(/Loading trending/)).toBeNull());
    expect(tablesRead).not.toContain("search_analytics");
    expect(tablesRead).not.toContain("user_analytics");
  });
});
