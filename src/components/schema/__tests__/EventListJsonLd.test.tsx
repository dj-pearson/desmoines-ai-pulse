/**
 * Events pass 2 WP6 item 1 (docs/page-plans/events-pass2.md): event names and
 * descriptions are scraped, and EventListJsonLd writes them into inline
 * ld+json on every prerendered events landing and month page. A description
 * holding "</script><img onerror>" must stay inside the JSON string and must
 * not become markup.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { EventListJsonLd } from "@/components/schema/EventListJsonLd";
import type { Event } from "@/lib/types";

const HOSTILE = "Doors at 7 </script><img src=x onerror=1> & dancing";

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Jazz on the </script>Riverfront",
    original_description: HOSTILE,
    date: "2026-10-02T00:30:00Z",
    event_start_utc: "2026-10-02T00:30:00Z",
    location: "Western Gateway Park, Des Moines, IA",
    venue: "Western Gateway Park",
    category: "Music",
    ...overrides,
  };
}

async function renderScript(events: Event[]): Promise<HTMLScriptElement> {
  render(
    <HelmetProvider>
      <EventListJsonLd
        events={events}
        listName="Events today"
        listDescription="What is on in Des Moines today."
        listUrl="https://desmoinesinsider.com/events/today"
      />
    </HelmetProvider>,
  );
  return waitFor(() => {
    const found = document.head.querySelector<HTMLScriptElement>(
      'script[type="application/ld+json"]',
    );
    if (!found) throw new Error("JSON-LD not committed yet");
    return found;
  });
}

afterEach(() => {
  cleanup();
});

describe("EventListJsonLd escaping", () => {
  it("keeps a closing script tag in a description inside the JSON string", async () => {
    const script = await renderScript([makeEvent()]);

    expect(script.innerHTML).not.toMatch(/<\/script/i);
    expect(script.innerHTML).not.toContain("<img");
    expect(document.querySelector("img[onerror]")).toBeNull();
  });

  it("round-trips the scraped name exactly", async () => {
    const script = await renderScript([makeEvent()]);
    const parsed = JSON.parse(script.textContent ?? "{}");

    expect(parsed["@type"]).toBe("ItemList");
    expect(parsed.itemListElement[0].item.name).toBe("Jazz on the </script>Riverfront");
    expect(parsed.itemListElement[0].item.description).toContain("</script><img");
  });

  it("renders nothing for an empty list", () => {
    render(
      <HelmetProvider>
        <EventListJsonLd events={[]} listName="x" listDescription="x" listUrl="https://x" />
      </HelmetProvider>,
    );
    expect(document.head.querySelector('script[type="application/ld+json"]')).toBeNull();
  });
});
