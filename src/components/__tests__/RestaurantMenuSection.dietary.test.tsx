/**
 * WEB-BE-072: a dietary badge repeats the restaurant's mark on the dish, and
 * the menu says so and tells the visitor to confirm with the restaurant.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import type { MenuItemRow, RestaurantMenuData } from "@/hooks/useRestaurantMenu";

const menuState: { data: RestaurantMenuData | undefined } = { data: undefined };

vi.mock("@/hooks/useRestaurantMenu", () => ({
  useRestaurantMenu: () => ({ data: menuState.data, isLoading: false }),
  useRestaurantMenuVersions: () => ({ data: [], isLoading: false }),
}));

import { RestaurantMenuSection } from "@/components/RestaurantMenuSection";

function makeItem(overrides: Partial<MenuItemRow>): MenuItemRow {
  return {
    id: overrides.item_name ?? "item",
    section_name: "Mains",
    section_sort_order: 0,
    item_name: "Burger",
    item_description: null,
    price: "$12",
    price_numeric: 12,
    dietary_tags: [],
    is_popular: false,
    sort_order: 0,
    ...overrides,
  };
}

// Relative, so the menu never crosses the 180-day line that collapses it (WEB-BE-071).
const RECENT = new Date(Date.now() - 7 * 86_400_000).toISOString();

function menuWith(items: MenuItemRow[]): RestaurantMenuData {
  return {
    menu: {
      id: "m1",
      restaurant_id: "r1",
      version: 1,
      is_current: true,
      source_type: "scraped",
      source_url: null,
      captured_at: RECENT,
      notes: null,
      created_at: RECENT,
    },
    sections: [{ name: "Mains", items }],
    totalItems: items.length,
    versions: [],
  };
}

function renderSection() {
  return render(
    <HelmetProvider>
      <RestaurantMenuSection restaurantId="r1" restaurantName="Test Diner" />
    </HelmetProvider>,
  );
}

const CAVEAT = /confirm with the restaurant before you order/i;

afterEach(() => {
  cleanup();
  menuState.data = undefined;
});

describe("RestaurantMenuSection dietary labels", () => {
  it("labels a badge as the restaurant's mark and shows the confirm line", () => {
    menuState.data = menuWith([
      makeItem({ item_name: "Hummus Plate (V) (GF)", dietary_tags: ["gluten-free", "vegetarian"] }),
    ]);
    renderSection();

    const gf = screen.getByTitle("Gluten-free, as marked on the restaurant's menu");
    expect(gf.textContent).toContain("GF");
    expect(screen.getByRole("group", { name: /as marked on the restaurant's menu/i })).toBeTruthy();
    expect(screen.getByText(CAVEAT)).toBeTruthy();
  });

  it("has no caveat when no dish carries a label", () => {
    menuState.data = menuWith([makeItem({ item_name: "Burger" })]);
    renderSection();
    // Counter-assertion: the menu rendered, so the missing line is not a blank page.
    expect(screen.getByText("Burger")).toBeTruthy();
    expect(screen.queryByText(CAVEAT)).toBeNull();
  });
});
