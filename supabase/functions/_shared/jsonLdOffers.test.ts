/**
 * schema.org offers -> events.price (WEB-BE-049 AC3, ld+json slice).
 *
 * Run with: deno test supabase/functions/_shared/jsonLdOffers.test.ts
 *
 * Two halves. The first pins what each offers shape is written as. The second
 * feeds every string this module can produce through the two readers in
 * src/lib that decide the free badge, the free filter and the Event JSON-LD,
 * so a format change here that flips one of those fails in this file rather
 * than on the site.
 *
 * node:assert rather than std/assert deliberately: it needs no network.
 */

import { strict as assert } from "node:assert";
import { priceFromOffers } from "./jsonLdOffers.ts";
import { extractEventsFromJsonLd } from "./jsonLdEvents.ts";
import { toAdapterEvent } from "./domain-adapters/catchdesmoinesParse.ts";
import { isFreePrice } from "../../../src/lib/eventPrice.ts";
import { parseEventPrice } from "../../../src/lib/eventOffers.ts";

Deno.test("one Offer with a price", () => {
  assert.equal(priceFromOffers({ "@type": "Offer", price: "25", priceCurrency: "USD" }), "$25");
  assert.equal(priceFromOffers({ price: 25 }), "$25");
  assert.equal(priceFromOffers({ price: "$1,250.00" }), "$1250");
  assert.equal(priceFromOffers({ price: "12.5" }), "$12.50");
});

Deno.test("a price of zero is free, not unknown", () => {
  // vibrantmusichall skipped any offer priced 0 and wrote "See website".
  assert.equal(priceFromOffers({ price: 0 }), "Free");
  assert.equal(priceFromOffers([{ price: "0" }, { price: "0.00" }]), "Free");
});

Deno.test("tiers and AggregateOffer become a range, not the low end alone", () => {
  assert.equal(priceFromOffers({ "@type": "AggregateOffer", lowPrice: 35, highPrice: 85 }), "$35-$85");
  assert.equal(priceFromOffers([{ price: "60" }, { price: "25" }, { price: "40" }]), "$25-$60");
  assert.equal(
    priceFromOffers({ "@type": "AggregateOffer", offers: [{ price: 20 }, { price: 45 }] }),
    "$20-$45",
  );
  assert.equal(priceFromOffers({ priceSpecification: { price: "18" } }), "$18");
});

Deno.test("a free tier beside a paid one is a range with a free tier", () => {
  assert.equal(priceFromOffers([{ price: 0 }, { price: 20 }]), "Free - $20");
});

Deno.test("a string that is not one amount is not read as one", () => {
  // jsonLdEvents stripped non-digits, so "10-20" was stored as "1020".
  assert.equal(priceFromOffers({ price: "10-20" }), undefined);
  assert.equal(priceFromOffers({ price: "Varies" }), undefined);
  assert.equal(priceFromOffers({ price: "" }), undefined);
  assert.equal(priceFromOffers({ price: "2026202620" }), undefined);
});

Deno.test("another currency is not a dollar price", () => {
  assert.equal(priceFromOffers({ price: "25", priceCurrency: "CAD" }), undefined);
  assert.equal(priceFromOffers([{ price: "25", priceCurrency: "EUR" }, { price: "30" }]), "$30");
});

Deno.test("isAccessibleForFree is used only when no amount is stated", () => {
  assert.equal(priceFromOffers(undefined, true), "Free");
  assert.equal(priceFromOffers(undefined, "true"), "Free");
  assert.equal(priceFromOffers(undefined, false), undefined);
  assert.equal(priceFromOffers({ price: 40 }, true), "$40");
});

Deno.test("nothing readable is undefined, so callers keep See website", () => {
  assert.equal(priceFromOffers(undefined), undefined);
  assert.equal(priceFromOffers(null), undefined);
  assert.equal(priceFromOffers([]), undefined);
  assert.equal(priceFromOffers("not an offer"), undefined);
});

Deno.test("every output reads the same way in src/lib", () => {
  const cases: Array<[unknown, boolean | null, string]> = [
    [{ price: 0 }, true, "free"],
    [{ price: 25 }, false, "fixed"],
    [{ lowPrice: 25, highPrice: 60 }, false, "range"],
    [[{ price: 0 }, { price: 20 }], false, "range"],
    [{ price: "12.5" }, false, "fixed"],
  ];
  for (const [offers, free, kind] of cases) {
    const text = priceFromOffers(offers);
    assert.ok(text, `no text for ${JSON.stringify(offers)}`);
    assert.equal(isFreePrice(text), free, `isFreePrice(${text})`);
    assert.equal(parseEventPrice(text).kind, kind, `parseEventPrice(${text})`);
  }
  const range = parseEventPrice(priceFromOffers({ lowPrice: 25, highPrice: 60 }));
  assert.deepEqual(range, { kind: "range", low: "25", high: "60", free: false });
  const freeTier = parseEventPrice(priceFromOffers([{ price: 0 }, { price: 20 }]));
  assert.deepEqual(freeTier, { kind: "range", low: "0", high: "20", free: true });
});

Deno.test("jsonLdEvents writes the price from offers and isAccessibleForFree", () => {
  const html = `<script type="application/ld+json">${JSON.stringify([
    { "@type": "Event", name: "Tiered", startDate: "2026-12-01T19:00:00", offers: [{ price: "30" }, { price: "55" }] },
    { "@type": "Event", name: "Open House", startDate: "2026-12-02", isAccessibleForFree: true },
    { "@type": "Event", name: "Unknown", startDate: "2026-12-03" },
  ])}</script>`;
  const rows = extractEventsFromJsonLd(html, "https://example.com/events/");
  const byTitle = Object.fromEntries(rows.map((r) => [r.title, r.price]));
  assert.equal(byTitle["Tiered"], "$30-$55");
  assert.equal(byTitle["Open House"], "Free");
  assert.equal(byTitle["Unknown"], "See website");
});

Deno.test("Catch Des Moines detail pages keep the price their ld+json states", () => {
  const detail = "https://www.catchdesmoines.com/event/some-show/1/";
  const base = { "@type": "Event", name: "Some Show", startDate: "2026-12-05T19:30:00-06:00" };
  assert.equal(toAdapterEvent({ ...base, offers: { price: "22" } }, detail, null)?.price, "$22");
  assert.equal(toAdapterEvent({ ...base, isAccessibleForFree: true }, detail, null)?.price, "Free");
  assert.equal(toAdapterEvent(base, detail, null)?.price, "See website");
});
