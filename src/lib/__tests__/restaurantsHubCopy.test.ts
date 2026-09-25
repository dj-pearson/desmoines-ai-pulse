import { describe, it, expect } from "vitest";
import { buildRestaurantsHubFaqs, drinkCuisines, formatRestaurantCount } from "@/lib/restaurantsHubCopy";

describe("formatRestaurantCount", () => {
  it("rounds down to the ten below, so the copy never overstates", () => {
    expect(formatRestaurantCount(477)).toBe("470+");
    expect(formatRestaurantCount(480)).toBe("480+");
    expect(formatRestaurantCount(12)).toBe("10+");
  });

  it("prints small totals exactly and unknown totals as nothing", () => {
    expect(formatRestaurantCount(7)).toBe("7");
    expect(formatRestaurantCount(0)).toBeNull();
    expect(formatRestaurantCount(null)).toBeNull();
    expect(formatRestaurantCount(undefined)).toBeNull();
  });
});

describe("buildRestaurantsHubFaqs", () => {
  const text = (faqs: ReturnType<typeof buildRestaurantsHubFaqs>) =>
    faqs.map((f) => `${f.question} ${f.answer}`).join("\n");

  it("takes its numbers from the counts it is given", () => {
    const faqs = text(buildRestaurantsHubFaqs({ restaurantCount: 477, cuisineCount: 31 }));
    expect(faqs).toContain("470+ restaurants");
    expect(faqs).toContain("31 cuisine types");
    expect(faqs).not.toMatch(/450\+|over 200|30\+/);
  });

  it("drops the number rather than guessing when the count is unknown", () => {
    const faqs = text(buildRestaurantsHubFaqs({ restaurantCount: null, cuisineCount: 0 }));
    expect(faqs).not.toMatch(/\d+\+ restaurants/);
    expect(faqs).not.toContain("null");
  });

  it("carries none of the claims the data does not back", () => {
    const faqs = text(buildRestaurantsHubFaqs({ restaurantCount: 477, cuisineCount: 31 }));
    expect(faqs).not.toMatch(/real-time|48 hours|building permits|verified by local|unbiased|Django/i);
  });

  it("links every internal target to a route that exists", () => {
    const hrefs = buildRestaurantsHubFaqs({ restaurantCount: 477, cuisineCount: 31 })
      .flatMap((f) => f.links ?? [])
      .map((l) => l.to);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/restaurants/open-now",
        "/restaurants/dietary",
        "/restaurants/new",
        "/restaurants/harbinger",
        "/restaurants/alba",
        "/restaurants/centro",
        "/restaurants/bubba",
        "/neighborhoods/east-village",
      ])
    );
    for (const href of hrefs) expect(href.startsWith("/")).toBe(true);
  });
});

describe("hub copy prices (eat-drink pass 2 WP1 item 9)", () => {
  it("names no dollar band for a price level", () => {
    const faqs = buildRestaurantsHubFaqs({ restaurantCount: 477, cuisineCount: 31 })
      .map((f) => f.answer)
      .join("\n");
    expect(faqs).not.toMatch(/under (about )?\$\d|\$\d+\s*-\s*\$?\d+/i);
  });
});

describe("drinkCuisines (eat-drink pass 2 WP1 item 13)", () => {
  const facet = [
    { cuisine: "American", count: 90 },
    { cuisine: "Bar & Grill", count: 12 },
    { cuisine: "Brewery", count: 9 },
    { cuisine: "Wine Bar", count: 4 },
    { cuisine: "Sushi Bar", count: 6 },
    { cuisine: "Salad Bar", count: 2 },
    { cuisine: "Cocktail Lounge", count: 0 },
    { cuisine: "Barbecue", count: 20 },
  ];

  it("keeps drinking places with rows, most rows first", () => {
    expect(drinkCuisines(facet).map((c) => c.cuisine)).toEqual(["Bar & Grill", "Brewery", "Wine Bar"]);
  });

  it("does not read Barbecue or a food bar as a bar", () => {
    const names = drinkCuisines(facet).map((c) => c.cuisine);
    expect(names).not.toContain("Barbecue");
    expect(names).not.toContain("Sushi Bar");
    expect(names).not.toContain("Salad Bar");
  });

  it("leaves out a cuisine with no rows", () => {
    expect(drinkCuisines(facet).map((c) => c.cuisine)).not.toContain("Cocktail Lounge");
  });
});
