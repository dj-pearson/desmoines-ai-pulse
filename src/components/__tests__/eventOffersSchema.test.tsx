/**
 * WEB-SEO-018: renders the two list/detail JSON-LD emitters and reads the
 * offers node back out of the shipped script tag.
 *
 * The unit tests in src/lib/__tests__/eventOffers.test.ts cover the builder.
 * This covers the wiring: the emitters use conditional spreads to drop
 * `offers` and `isAccessibleForFree` entirely on an unreadable price, and a
 * mistake there is invisible to both the builder tests and tsc.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { EventListJsonLd } from "@/components/schema/EventListJsonLd";
import type { Event } from "@/lib/types";

/** The three price shapes behind the 30 Event nodes live on /events. */
const PRICES = {
  range: "$54.40-$89.40",
  unknown: "Varies",
  free: "Free",
} as const;

function makeEvent(id: string, price: string): Event {
  return {
    id,
    title: `Test Event ${id}`,
    date: "2026-09-12T01:00:00Z",
    event_start_utc: "2026-09-12T01:00:00Z",
    price,
    venue: "Val Air Ballroom",
    location: "301 Ashworth Rd",
    city: "West Des Moines",
    category: "Music",
  } as unknown as Event;
}

/** Pull the Event nodes out of the JSON-LD Helmet committed to document.head. */
async function renderEventNodes(events: Event[]): Promise<Record<string, unknown>[]> {
  render(
    <HelmetProvider>
      <EventListJsonLd
        events={events}
        listName="Events"
        listDescription="Events in Des Moines"
        listUrl="https://desmoinesinsider.com/events"
      />
    </HelmetProvider>,
  );
  const scripts = await waitFor(() => {
    const found = document.head.querySelectorAll('script[type="application/ld+json"]');
    if (found.length === 0) throw new Error("no JSON-LD committed");
    return found;
  });
  const nodes: Record<string, unknown>[] = [];
  for (const script of scripts) {
    const parsed = JSON.parse(script.textContent ?? "{}");
    for (const entry of parsed.itemListElement ?? []) {
      if (entry?.item?.["@type"] === "Event") nodes.push(entry.item);
    }
  }
  return nodes;
}

describe("EventListJsonLd offers (WEB-SEO-018)", () => {
  let nodes: Record<string, unknown>[] = [];

  beforeAll(async () => {
    nodes = await renderEventNodes([
      makeEvent("range", PRICES.range),
      makeEvent("unknown", PRICES.unknown),
      makeEvent("free", PRICES.free),
    ]);
  });

  it("emits one Event node per event", () => {
    expect(nodes).toHaveLength(3);
  });

  it("ships an AggregateOffer for a price range, not a mashed number", () => {
    const offers = nodes[0].offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("AggregateOffer");
    expect(offers.lowPrice).toBe("54.40");
    expect(offers.highPrice).toBe("89.40");
    expect(JSON.stringify(nodes[0])).not.toContain("54.4089.40");
    expect(nodes[0].isAccessibleForFree).toBe(false);
  });

  it("omits both offers and isAccessibleForFree when the price is unreadable", () => {
    expect("offers" in nodes[1]).toBe(false);
    expect("isAccessibleForFree" in nodes[1]).toBe(false);
  });

  it("ships a zero Offer and a free flag for a free event", () => {
    const offers = nodes[2].offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("Offer");
    expect(offers.price).toBe("0");
    expect(nodes[2].isAccessibleForFree).toBe(true);
  });

  it("keeps the Offer extras the node carried before the change", () => {
    const offers = nodes[2].offers as Record<string, unknown>;
    expect(offers.priceCurrency).toBe("USD");
    expect(offers.availability).toBe("https://schema.org/InStock");
    expect(offers.url).toBeTruthy();
    expect(offers.validFrom).toBeTruthy();
  });
});
