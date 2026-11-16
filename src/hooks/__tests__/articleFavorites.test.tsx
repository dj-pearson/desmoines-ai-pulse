import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { renderHook, render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * XPLAT-013, web half. A guide saved on iOS is a content_favorites row with
 * content_type 'article'; the web Save writes the same row. The server leaves
 * articles out of the favourites cap (20261116000010), so the client must too:
 * a free user at 3 of 3 saves can still save a guide, and a place save at the
 * same count still asks for the upgrade.
 */

const insert = vi.fn(() => Promise.resolve({ error: null }));
const authState: { isAuthenticated: boolean } = { isAuthenticated: true };
const toastSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: [], error: null }),
  };
  return { supabase: { from: () => ({ ...chain, insert }) } };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock("@/hooks/useSavedCount", () => ({ useSavedCount: () => ({ count: 3 }) }));
vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => ({
    canPerformAction: (_a: string, n: number) => n < 3,
    getRemainingQuota: () => 0,
    isPremium: false,
    limits: { favorites: 3 },
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuthFlags: () => ({ isAuthenticated: authState.isAuthenticated }),
}));
vi.mock("@/lib/paywallStore", () => ({ openPaywall: () => {} }));
vi.mock("@/lib/favoriteAnalytics", () => ({ logFavoriteFunnelEvent: () => {} }));
vi.mock("@/lib/toast", () => ({
  toast: Object.assign((...args: unknown[]) => toastSpy(...args), { success: () => {} }),
}));

import {
  useContentFavorites,
  countsTowardFavoritesCap,
  CAP_EXEMPT_CONTENT_TYPES,
} from "@/hooks/useContentFavorites";
import { FavoriteButton } from "@/components/FavoriteButton";
import { getGuestFavorites, clearGuestFavorites } from "@/lib/guestFavorites";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("article favourites (XPLAT-013)", () => {
  beforeEach(() => {
    insert.mockClear();
    toastSpy.mockClear();
    authState.isAuthenticated = true;
    clearGuestFavorites();
  });

  it("only articles are exempt from the cap", () => {
    expect(countsTowardFavoritesCap("article")).toBe(false);
    for (const t of ["restaurant", "attraction", "hotel", "playground"] as const) {
      expect(countsTowardFavoritesCap(t)).toBe(true);
    }
  });

  it("saves a guide at the free cap and writes content_type 'article'", () => {
    const { result } = renderHook(() => useContentFavorites("article"), { wrapper });
    expect(result.current.canAddFavorite).toBe(true);
    const outcome = result.current.toggleFavorite("a1");
    expect(outcome).toEqual({ success: true, needsUpgrade: false });
    return vi.waitFor(() =>
      expect(insert).toHaveBeenCalledWith({
        user_id: "u1",
        content_type: "article",
        content_id: "a1",
      }),
    );
  });

  it("a place save at the same count still needs the upgrade", () => {
    const { result } = renderHook(() => useContentFavorites("restaurant"), { wrapper });
    expect(result.current.toggleFavorite("r1")).toEqual({ success: false, needsUpgrade: true });
    expect(insert).not.toHaveBeenCalled();
  });

  it("signed out, Save on a guide asks for an account and stores nothing", () => {
    authState.isAuthenticated = false;
    render(<FavoriteButton contentType="article" contentId="a1" itemName="Brunch Guide" />);
    fireEvent.click(screen.getByRole("button", { name: "Save Brunch Guide" }));
    expect(toastSpy).toHaveBeenCalledWith("Sign up free to save guides", expect.anything());
    expect(getGuestFavorites()).toEqual([]);
    expect(insert).not.toHaveBeenCalled();
  });

  it("the exempt list matches what the server leaves out of the cap", () => {
    const sql = readFileSync(
      "supabase/migrations/20261116000010_content_favorites_articles.sql",
      "utf8",
    );
    const exempt = [...sql.matchAll(/content_type <> '([a-z]+)'/g)].map((m) => m[1]);
    expect(exempt.length).toBeGreaterThan(0);
    expect([...new Set(exempt)]).toEqual([...CAP_EXEMPT_CONTENT_TYPES]);
  });

  it("the article page renders the Save control", () => {
    const page = readFileSync("src/pages/ArticleDetails.tsx", "utf8");
    expect(page).toMatch(/<FavoriteButton\s+contentType="article"\s+contentId=\{article\.id\}/);
  });
});
