/**
 * WEB-BE-071: a menu captured more than 180 days ago is collapsed behind a link
 * to the restaurant's own menu, and its JSON-LD carries no Offer prices. One
 * age rule (src/lib/menuAge.ts) drives both, so they are tested together on
 * either side of the threshold.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import type { MenuItemRow, RestaurantMenuData } from "@/hooks/useRestaurantMenu";

const menuState: { data: RestaurantMenuData | undefined } = { data: undefined };

vi.mock("@/hooks/useRestaurantMenu", () => ({
  useRestaurantMenu: () => ({ data: menuState.data, isLoading: false }),
  useRestaurantMenuVersions: () => ({ data: [], isLoading: false }),
}));

import { RestaurantMenuSection } from "@/components/RestaurantMenuSection";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000 - 60_000).toISOString();

function item(name: string, price: string, priceNumeric: number): MenuItemRow {
  return {
    id: name,
    section_name: "Mains",
    section_sort_order: 0,
    item_name: name,
    item_description: null,
    price,
    price_numeric: priceNumeric,
    dietary_tags: [],
    is_popular: false,
    sort_order: 0,
  };
}

function menuCapturedDaysAgo(days: number): RestaurantMenuData {
  const capturedAt = daysAgo(days);
  return {
    menu: {
      id: "m1",
      restaurant_id: "r1",
      version: 1,
      is_current: true,
      source_type: "scraped",
      source_url: "https://diner.example/menu-page",
      captured_at: capturedAt,
      notes: null,
      created_at: capturedAt,
    },
    sections: [{ name: "Mains", items: [item("Pork Tenderloin", "$14", 14)] }],
    totalItems: 1,
    versions: [],
  };
}

function renderSection(menuUrl: string | null = "https://diner.example/menu") {
  return render(
    <HelmetProvider>
      <RestaurantMenuSection
        restaurantId="r1"
        restaurantName="Test Diner"
        restaurantSlug="test-diner"
        menuUrl={menuUrl}
      />
    </HelmetProvider>,
  );
}

async function menuJsonLd(): Promise<string> {
  return waitFor(() => {
    const scripts = Array.from(
      document.head.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
    );
    const menu = scripts.find((s) => (s.textContent ?? "").includes('"@type":"Menu"'));
    if (!menu) throw new Error("Menu JSON-LD not committed yet");
    return menu.textContent ?? "";
  });
}

afterEach(() => {
  cleanup();
  menuState.data = undefined;
  document.head.querySelectorAll('script[type="application/ld+json"]').forEach((s) => s.remove());
});

describe("RestaurantMenuSection menu age", () => {
  it("shows a 179-day-old menu with prices, and its JSON-LD carries Offers", async () => {
    menuState.data = menuCapturedDaysAgo(179);
    renderSection();

    expect(screen.getByText("Pork Tenderloin")).toBeTruthy();
    expect(screen.getByText("$14")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /show the menu we captured/i })).toBeNull();

    const ld = await menuJsonLd();
    expect(ld).toContain('"@type":"Offer"');
    expect(ld).toContain('"price":14');
  });

  it("collapses a 181-day-old menu behind the restaurant's own menu link", async () => {
    menuState.data = menuCapturedDaysAgo(181);
    renderSection();

    const own = screen.getByRole("link", { name: /see test diner's current menu/i });
    // restaurants.menu_url wins over the page the scrape read.
    expect(own.getAttribute("href")).toBe("https://diner.example/menu");
    expect(screen.getByText(/more than six months ago/i)).toBeTruthy();
    expect(screen.queryByText("Pork Tenderloin")).toBeNull();
    expect(screen.queryByText("$14")).toBeNull();

    // Counter-assertion: the menu is still there for anyone who asks for it.
    const reveal = screen.getByRole("button", { name: /show the menu we captured/i });
    expect(reveal.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(reveal);
    expect(screen.getByText("Pork Tenderloin")).toBeTruthy();
    expect(reveal.getAttribute("aria-expanded")).toBe("true");
  });

  it("emits no Offer for a 181-day-old menu but keeps the item names", async () => {
    menuState.data = menuCapturedDaysAgo(181);
    renderSection();

    const ld = await menuJsonLd();
    expect(ld).toContain('"name":"Pork Tenderloin"');
    expect(ld).not.toContain("Offer");
    expect(ld).not.toContain('"price"');
    expect(ld).not.toContain("with prices");
  });

  it("falls back to the scraped page when the restaurant has no menu_url", () => {
    menuState.data = menuCapturedDaysAgo(400);
    renderSection(null);
    const own = screen.getByRole("link", { name: /see test diner's current menu/i });
    expect(own.getAttribute("href")).toBe("https://diner.example/menu-page");
  });
});
