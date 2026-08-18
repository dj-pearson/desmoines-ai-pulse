import { describe, it, expect } from "vitest";
import {
  parseEventPrice,
  buildEventOffers,
  isEventAccessibleForFree,
  eventPriceContent,
} from "@/lib/eventOffers";

describe("parseEventPrice: free", () => {
  it("treats an absent or empty price as free admission", () => {
    expect(parseEventPrice(null)).toEqual({ kind: "free" });
    expect(parseEventPrice(undefined)).toEqual({ kind: "free" });
    expect(parseEventPrice("")).toEqual({ kind: "free" });
    expect(parseEventPrice("   ")).toEqual({ kind: "free" });
  });

  it("reads the free wordings the database actually contains", () => {
    expect(parseEventPrice("Free")).toEqual({ kind: "free" });
    expect(parseEventPrice("FREE")).toEqual({ kind: "free" });
    expect(parseEventPrice("Free admission")).toEqual({ kind: "free" });
    expect(parseEventPrice("No charge")).toEqual({ kind: "free" });
  });

  it("treats a zero amount as free however it is written", () => {
    expect(parseEventPrice("$0")).toEqual({ kind: "free" });
    expect(parseEventPrice("0")).toEqual({ kind: "free" });
    expect(parseEventPrice("$0.00")).toEqual({ kind: "free" });
  });
});

describe("parseEventPrice: a single amount", () => {
  it("keeps the amount and drops the symbol", () => {
    expect(parseEventPrice("$25")).toEqual({ kind: "fixed", price: "25" });
    expect(parseEventPrice("25")).toEqual({ kind: "fixed", price: "25" });
    expect(parseEventPrice("$12.50")).toEqual({ kind: "fixed", price: "12.50" });
  });

  it("strips thousands separators", () => {
    expect(parseEventPrice("$1,250")).toEqual({ kind: "fixed", price: "1250" });
    expect(parseEventPrice("$1,250.00")).toEqual({ kind: "fixed", price: "1250" });
  });

  it("normalises to two decimals only when there is a fractional part", () => {
    expect(parseEventPrice("$54.40")).toEqual({ kind: "fixed", price: "54.40" });
    expect(parseEventPrice("$54.4")).toEqual({ kind: "fixed", price: "54.40" });
    expect(parseEventPrice("$54.00")).toEqual({ kind: "fixed", price: "54" });
  });
});

describe("parseEventPrice: ranges", () => {
  it("splits the range that the old regex mashed into one number", () => {
    // "$54.40-$89.40".replace(/[^0-9.]/g, '') was "54.4089.40".
    expect(parseEventPrice("$54.40-$89.40")).toEqual({
      kind: "range",
      low: "54.40",
      high: "89.40",
      free: false,
    });
  });

  it("handles spacing, en dashes and 'to' between the bounds", () => {
    const expected = { kind: "range", low: "25", high: "40", free: false };
    expect(parseEventPrice("$25 - $40")).toEqual(expected);
    expect(parseEventPrice("$25\u2013$40")).toEqual(expected);
    expect(parseEventPrice("$25 to $40")).toEqual(expected);
    expect(parseEventPrice("25-40")).toEqual(expected);
  });

  it("takes the min and max across several ticket tiers", () => {
    expect(parseEventPrice("Adults $12, Kids $6, Seniors $9")).toEqual({
      kind: "range",
      low: "6",
      high: "12",
      free: false,
    });
  });

  it("treats an open-ended amount as a floor, not an exact price", () => {
    expect(parseEventPrice("$10+")).toEqual({ kind: "range", low: "10", free: false });
    expect(parseEventPrice("From $20")).toEqual({ kind: "range", low: "20", free: false });
    expect(parseEventPrice("Starting at $15")).toEqual({ kind: "range", low: "15", free: false });
    expect(parseEventPrice("$30 and up")).toEqual({ kind: "range", low: "30", free: false });
  });

  it("keeps the free tier when free admission sits alongside paid ones", () => {
    expect(parseEventPrice("Free - $20")).toEqual({
      kind: "range",
      low: "0",
      high: "20",
      free: true,
    });
  });
});

describe("parseEventPrice: unknown", () => {
  it("refuses to invent a number for prose", () => {
    // Every one of these used to come out as the string "0", i.e. free.
    expect(parseEventPrice("Varies")).toEqual({ kind: "unknown" });
    expect(parseEventPrice("TBD")).toEqual({ kind: "unknown" });
    expect(parseEventPrice("See website")).toEqual({ kind: "unknown" });
    expect(parseEventPrice("Donation")).toEqual({ kind: "unknown" });
    expect(parseEventPrice("Varies by package")).toEqual({ kind: "unknown" });
  });

  it("does not read a year or an address number as a price", () => {
    expect(parseEventPrice("Summer 2026 Pass")).toEqual({ kind: "unknown" });
    expect(parseEventPrice("Call 515-555-0100")).toEqual({ kind: "unknown" });
  });

  it("ignores implausibly large amounts", () => {
    expect(parseEventPrice("$999,999,999")).toEqual({ kind: "unknown" });
  });
});

describe("buildEventOffers", () => {
  it("emits a zero Offer for free events", () => {
    expect(buildEventOffers("Free")).toEqual({
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    });
  });

  it("emits a single Offer for a single amount", () => {
    expect(buildEventOffers("$25")).toEqual({
      "@type": "Offer",
      price: "25",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    });
  });

  it("emits an AggregateOffer for a range", () => {
    expect(buildEventOffers("$54.40-$89.40")).toEqual({
      "@type": "AggregateOffer",
      lowPrice: "54.40",
      highPrice: "89.40",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    });
  });

  it("omits highPrice on an open-ended range", () => {
    const offers = buildEventOffers("$10+");
    expect(offers).toEqual({
      "@type": "AggregateOffer",
      lowPrice: "10",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    });
    expect(offers && "highPrice" in offers).toBe(false);
  });

  it("emits nothing at all when the price is unreadable", () => {
    expect(buildEventOffers("Varies")).toBeUndefined();
  });

  it("passes the availability through", () => {
    expect(buildEventOffers("$25", "https://schema.org/SoldOut")).toMatchObject({
      availability: "https://schema.org/SoldOut",
    });
  });

  it("never emits a price containing a symbol, comma or second decimal point", () => {
    const inputs = ["$54.40-$89.40", "$1,250.00", "$25 to $40", "Free", "$12.50", "Adults $12, Kids $6"];
    for (const input of inputs) {
      const offers = buildEventOffers(input);
      const values = offers
        ? Object.entries(offers)
            .filter(([k]) => k === "price" || k === "lowPrice" || k === "highPrice")
            .map(([, v]) => v as string)
        : [];
      expect(values.length).toBeGreaterThan(0);
      for (const value of values) {
        expect(value).toMatch(/^[0-9]+(\.[0-9]{2})?$/);
      }
    }
  });
});

describe("isEventAccessibleForFree", () => {
  it("is true only when admission is genuinely free", () => {
    expect(isEventAccessibleForFree("Free")).toBe(true);
    expect(isEventAccessibleForFree(null)).toBe(true);
    expect(isEventAccessibleForFree("$0")).toBe(true);
    expect(isEventAccessibleForFree("Free - $20")).toBe(true);
  });

  it("is false for a priced event", () => {
    expect(isEventAccessibleForFree("$25")).toBe(false);
    expect(isEventAccessibleForFree("$54.40-$89.40")).toBe(false);
  });

  it("is undefined when unknown, so callers omit the property", () => {
    // The old code emitted `false` here alongside a price of "0", which claims
    // a paid event that costs nothing.
    expect(isEventAccessibleForFree("Varies")).toBeUndefined();
  });
});

describe("eventPriceContent", () => {
  it("gives a single number for microdata, or nothing", () => {
    expect(eventPriceContent("Free")).toBe("0");
    expect(eventPriceContent("$25")).toBe("25");
    expect(eventPriceContent("$54.40-$89.40")).toBeUndefined();
    expect(eventPriceContent("Varies")).toBeUndefined();
  });
});
