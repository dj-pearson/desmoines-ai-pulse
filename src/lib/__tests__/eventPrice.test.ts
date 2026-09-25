import { describe, it, expect } from "vitest";
import { isFreePrice, eventPriceLabel, FREE_PRICE_FILTER, PRICE_NOT_LISTED } from "@/lib/eventPrice";

describe("isFreePrice (events plan WP0 item 2, pass-2 WP2 item 3)", () => {
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
    // events-pass2 WP2 item 3: free means nobody pays.
    ["$25; kids under 5 free", false],
    ["Free parking, $40 tickets", false],
    ["Free for members, $15 public", false],
    ["Free; $ 10 suggested donation", false],
    ["Free, $0 donation", true],
    ["FREE admission", true],
  ])("%j -> %j", (price, expected) => {
    expect(isFreePrice(price)).toBe(expected);
  });

  it("the server filter never treats a missing price as free", () => {
    expect(FREE_PRICE_FILTER).not.toMatch(/is\.null/);
    expect(FREE_PRICE_FILTER).toBe(
      "and(price.ilike.%free%,price.not.match.[$] *[1-9]),price.eq.$0,price.eq.0",
    );
  });

  it("the server filter's regex refuses what isFreePrice refuses", () => {
    // PostgREST `match` is a POSIX regex; `[$] *[1-9]` means the same in JS.
    const posix = /price\.not\.match\.([^),]+)\)/.exec(FREE_PRICE_FILTER)?.[1];
    expect(posix).toBe("[$] *[1-9]");
    const re = new RegExp(posix ?? "");
    for (const text of ["$25; kids under 5 free", "Free parking, $40 tickets", "Free for members, $15 public"]) {
      expect(re.test(text), text).toBe(true);
      expect(isFreePrice(text), text).toBe(false);
    }
    for (const text of ["Free", "FREE admission", "Free, $0 donation"]) {
      expect(re.test(text), text).toBe(false);
      expect(isFreePrice(text), text).toBe(true);
    }
  });

  it("the filter string can be read by the nlp-search drift test", () => {
    // search.test.ts pulls it out of this file with /"([^"]+)"/.
    expect(FREE_PRICE_FILTER).not.toContain('"');
  });

  it("labels unknown as not listed, never Free", () => {
    expect(eventPriceLabel(null)).toBe(PRICE_NOT_LISTED);
    expect(eventPriceLabel("")).toBe(PRICE_NOT_LISTED);
    expect(eventPriceLabel("free entry")).toBe("Free");
    expect(eventPriceLabel(" $15 ")).toBe("$15");
    expect(eventPriceLabel("$25; kids under 5 free")).toBe("$25; kids under 5 free");
  });
});
