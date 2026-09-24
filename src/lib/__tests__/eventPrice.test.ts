import { describe, it, expect } from "vitest";
import { isFreePrice, eventPriceLabel, FREE_PRICE_FILTER, PRICE_NOT_LISTED } from "@/lib/eventPrice";

describe("isFreePrice (events plan WP0 item 2)", () => {
  it.each([
    [null, null],
    [undefined, null],
    ["", null],
    ["   ", null],
    ["Free", true],
    ["FREE admission", true],
    ["$0", true],
    ["0", true],
    ["$0.00", true],
    ["$0-$25", false],
    ["$15", false],
    ["See website", false],
  ])("%j -> %j", (price, expected) => {
    expect(isFreePrice(price)).toBe(expected);
  });

  it("the server filter never treats a missing price as free", () => {
    expect(FREE_PRICE_FILTER).not.toMatch(/is\.null/);
    expect(FREE_PRICE_FILTER.split(",")).toEqual(["price.ilike.%free%", "price.eq.$0", "price.eq.0"]);
  });

  it("labels unknown as not listed, never Free", () => {
    expect(eventPriceLabel(null)).toBe(PRICE_NOT_LISTED);
    expect(eventPriceLabel("")).toBe(PRICE_NOT_LISTED);
    expect(eventPriceLabel("free entry")).toBe("Free");
    expect(eventPriceLabel(" $15 ")).toBe("$15");
  });
});
