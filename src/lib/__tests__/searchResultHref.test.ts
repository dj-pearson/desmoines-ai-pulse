import { describe, expect, it } from "vitest";
import { searchResultHref } from "@/lib/searchResultHref";

const UUID = "30000000-0000-0000-0000-000000000001";

describe("searchResultHref", () => {
  it("links an event by its Central date slug", () => {
    // 03:00Z on Oct 2 is 10pm Central on Oct 1: the slug carries the Central day.
    const href = searchResultHref(
      { id: UUID, title: "Jazz Night at Noce", event_start_utc: "2026-10-02T03:00:00Z" },
      "events",
    );
    expect(href).toBe("/events/jazz-night-at-noce-2026-10-01");
  });

  it("falls back to the legacy date column for an event", () => {
    expect(searchResultHref({ id: UUID, title: "Art Walk", date: "2026-10-01T18:00:00Z" }, "events")).toBe(
      "/events/art-walk-2026-10-01",
    );
  });

  it("links an attraction by slug, then by slugged name, never by id", () => {
    expect(searchResultHref({ id: UUID, name: "Science Center", slug: "science-center-of-iowa" }, "attractions")).toBe(
      "/attractions/science-center-of-iowa",
    );
    const href = searchResultHref({ id: UUID, name: "Pappajohn Sculpture Park" }, "attractions");
    expect(href).toBe("/attractions/pappajohn-sculpture-park");
    expect(href).not.toContain(UUID);
  });

  it("links a restaurant by slug, falling back to id", () => {
    expect(searchResultHref({ id: UUID, name: "Noce", slug: "noce" }, "restaurants")).toBe("/restaurants/noce");
    expect(searchResultHref({ id: UUID, name: "Noce" }, "restaurants")).toBe(`/restaurants/${UUID}`);
  });

  it("links a hotel to /stay/:slug, or the hub when it has none", () => {
    expect(searchResultHref({ id: UUID, name: "Hotel Fort Des Moines", slug: "hotel-fort-des-moines" }, "hotels")).toBe(
      "/stay/hotel-fort-des-moines",
    );
    expect(searchResultHref({ id: UUID, name: "No Slug Inn" }, "hotels")).toBe("/stay");
  });

  it("does not crash on a nameless attraction", () => {
    expect(searchResultHref({ id: UUID, name: null }, "attractions")).toBe("/attractions");
  });
});
