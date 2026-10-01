/**
 * WP9 item 1 (docs/page-plans/eat-drink.md): menu item names and descriptions
 * are scraped or AI-extracted, and MenuSchema writes them into inline ld+json.
 * A description holding "</script><img onerror>" must stay inside the JSON
 * string and must not become markup.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MenuSchema } from "@/components/schema/MenuSchema";
import type { MenuItemRow, MenuSection } from "@/hooks/useRestaurantMenu";

const HOSTILE = 'Crispy </script><img src=x onerror="alert(1)"> fries & dip';

function makeItem(overrides: Partial<MenuItemRow>): MenuItemRow {
  return {
    id: "item-1",
    section_name: "Sides",
    section_sort_order: 0,
    item_name: "Fries",
    item_description: null,
    price: "$6",
    price_numeric: 6,
    dietary_tags: [],
    is_popular: true,
    sort_order: 0,
    ...overrides,
  };
}

async function renderScripts(sections: MenuSection[]): Promise<HTMLScriptElement[]> {
  render(
    <HelmetProvider>
      <MenuSchema restaurantName="Test Diner" restaurantSlug="test-diner" sections={sections} />
    </HelmetProvider>,
  );
  return waitFor(() => {
    const found = Array.from(
      document.head.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
    );
    if (found.length < 2) throw new Error("JSON-LD not committed yet");
    return found;
  });
}

afterEach(() => {
  cleanup();
});

describe("MenuSchema JSON-LD escaping", () => {
  it("keeps a closing script tag in a description inside the JSON string", async () => {
    const scripts = await renderScripts([
      { name: "Sides", items: [makeItem({ item_description: HOSTILE, item_name: "</script>Fries" })] },
    ]);

    for (const script of scripts) {
      expect(script.innerHTML).not.toMatch(/<\/script/i);
      expect(script.innerHTML).not.toContain("<img");
    }
    expect(document.querySelector("img[onerror]")).toBeNull();
  });

  it("round-trips the scraped text exactly", async () => {
    const scripts = await renderScripts([
      { name: "Sides", items: [makeItem({ item_description: HOSTILE })] },
    ]);
    const parsed = scripts.map((s) => JSON.parse(s.textContent ?? "{}"));

    const menu = parsed.find((p) => p["@type"] === "Menu");
    expect(menu.hasMenuSection[0].hasMenuItem[0].description).toBe(HOSTILE);

    const popular = parsed.find((p) => p["@type"] === "ItemList");
    expect(popular.itemListElement[0].description).toBe(HOSTILE);
  });
});
