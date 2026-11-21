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

// WEB-BE-072: dietary_tags are scraped and partly inferred. The structured
// data must not publish them as GlutenFreeDiet and the like.
describe("MenuSchema dietary claims", () => {
  it("emits no suitableForDiet, even for a tagged item", async () => {
    const scripts = await renderScripts([
      {
        name: "Mains",
        items: [makeItem({ item_name: "Fish Tacos (GFO)", dietary_tags: ["gluten-free", "vegan"] })],
      },
    ]);
    const menu = scripts.map((s) => JSON.parse(s.textContent ?? "{}")).find((p) => p["@type"] === "Menu");
    // Counter-assertion: the item is in the schema, so the absence below is
    // not an empty menu.
    expect(menu.hasMenuSection[0].hasMenuItem[0].name).toBe("Fish Tacos (GFO)");
    for (const script of scripts) {
      expect(script.textContent).not.toContain("suitableForDiet");
      expect(script.textContent).not.toContain("GlutenFreeDiet");
    }
  });
});

// WEB-BE-071: past 180 days the structured data stops stating prices.
describe("MenuSchema prices by menu age", () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000 - 60_000).toISOString();

  async function menuFor(capturedAt: string | undefined) {
    render(
      <HelmetProvider>
        <MenuSchema
          restaurantName="Test Diner"
          restaurantSlug="test-diner"
          capturedAt={capturedAt}
          sections={[{ name: "Sides", items: [makeItem({ is_popular: false })] }]}
        />
      </HelmetProvider>,
    );
    return waitFor(() => {
      const script = document.head.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
      if (!script) throw new Error("JSON-LD not committed yet");
      return JSON.parse(script.textContent ?? "{}");
    });
  }

  it("keeps the Offer on a 179-day-old menu", async () => {
    const menu = await menuFor(daysAgo(179));
    expect(menu.hasMenuSection[0].hasMenuItem[0].offers).toMatchObject({ "@type": "Offer", price: 6 });
  });

  it("drops the Offer on a 181-day-old menu and keeps the item", async () => {
    const menu = await menuFor(daysAgo(181));
    const fries = menu.hasMenuSection[0].hasMenuItem[0];
    expect(fries.name).toBe("Fries");
    expect(fries.offers).toBeUndefined();
    expect(menu.description).not.toContain("with prices");
  });

  it("drops the Offer when the capture date is unknown", async () => {
    const menu = await menuFor(undefined);
    expect(menu.hasMenuSection[0].hasMenuItem[0].offers).toBeUndefined();
  });
});
