import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const favoritesState = { favorited: false, isToggling: false };

vi.mock("@/contexts/AuthContext", () => ({
  useAuthFlags: () => ({ isAuthenticated: true }),
}));
vi.mock("@/hooks/useFavorites", () => ({
  useFavorites: () => ({
    isFavorited: () => favoritesState.favorited,
    toggleFavorite: () => ({ success: true }),
    isToggling: favoritesState.isToggling,
  }),
}));
vi.mock("@/hooks/useContentFavorites", () => ({
  useContentFavorites: () => ({
    isFavorited: () => false,
    toggleFavorite: () => ({ success: true }),
    isToggling: false,
  }),
}));
vi.mock("@/lib/capacitorUtils", () => ({ hapticTap: () => {} }));
vi.mock("@/lib/paywallStore", () => ({ openPaywall: () => {} }));
vi.mock("@/lib/favoriteAnalytics", () => ({ logFavoriteFunnelEvent: () => {} }));
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {} }) }));

import { FavoriteButton } from "@/components/FavoriteButton";

/**
 * The name used to flip between "Save X" and "Remove X from favorites" while
 * aria-pressed flipped too, so the state was announced twice, and with
 * showText the visible "Saved" was not in the name (WCAG 2.5.3).
 */
describe("FavoriteButton accessible name", () => {
  beforeEach(() => {
    favoritesState.favorited = false;
    favoritesState.isToggling = false;
  });

  it("keeps one icon-only name and moves state to aria-pressed", () => {
    const { rerender } = render(<FavoriteButton eventId="e1" itemName="Jazz Night" />);
    const off = screen.getByRole("button", { name: "Save Jazz Night" });
    expect(off).toHaveAttribute("aria-pressed", "false");

    favoritesState.favorited = true;
    rerender(<FavoriteButton eventId="e1" itemName="Jazz Night" />);
    const on = screen.getByRole("button", { name: "Save Jazz Night" });
    expect(on).toHaveAttribute("aria-pressed", "true");
  });

  it("puts the visible text in the name in both states when showText", () => {
    const { rerender } = render(<FavoriteButton eventId="e1" itemName="Jazz Night" showText />);
    let button = screen.getByRole("button");
    expect(button).toHaveTextContent(/^Save/);
    expect(button).toHaveAccessibleName("Save Jazz Night");
    expect(button).toHaveAttribute("aria-pressed", "false");

    favoritesState.favorited = true;
    rerender(<FavoriteButton eventId="e1" itemName="Jazz Night" showText />);
    button = screen.getByRole("button");
    expect(button).toHaveAccessibleName("Saved Jazz Night");
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("does not swap the name while a toggle is in flight", () => {
    favoritesState.isToggling = true;
    render(<FavoriteButton eventId="e1" itemName="Jazz Night" />);
    const button = screen.getByRole("button", { name: "Save Jazz Night" });
    expect(button).toHaveAttribute("aria-busy", "true");
  });
});
