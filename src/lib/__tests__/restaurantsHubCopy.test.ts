import { describe, it, expect } from "vitest";
import { buildRestaurantsHubFaqs, formatRestaurantCount } from "@/lib/restaurantsHubCopy";

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
