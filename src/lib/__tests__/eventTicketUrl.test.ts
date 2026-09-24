import { describe, it, expect } from "vitest";
import { buildEventJsonLd, eventTicketUrl } from "@/lib/eventSchema";

describe("eventTicketUrl and offers.url (events plan WP8 item 5)", () => {
  const base = {
    id: "e1",
    title: "Show",
    date: "2026-09-25T00:00:00Z",
    location: "Downtown",
    category: "Music",
    price: "$20",
  };

  it("keeps an http(s) source_url", () => {
    expect(eventTicketUrl({ source_url: "https://tickets.example/show" })).toBe("https://tickets.example/show");
  });

  it("drops javascript:, junk and broken links", () => {
    expect(eventTicketUrl({ source_url: "javascript:alert(1)" })).toBeNull();
    expect(eventTicketUrl({ source_url: "not a url" })).toBeNull();
    expect(eventTicketUrl({ source_url: "https://x.example", source_url_broken: true })).toBeNull();
    expect(eventTicketUrl({ source_url: undefined })).toBeNull();
  });

  it("points offers.url at the page when the source link is unusable", () => {
    const node = buildEventJsonLd({ ...base, source_url: "javascript:alert(1)" });
    expect((node as { offers?: { url: string } }).offers?.url).toBe(node.url);
  });
});
