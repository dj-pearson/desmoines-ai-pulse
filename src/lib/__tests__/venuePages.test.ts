import { describe, it, expect } from "vitest";
import {
  buildVenueJsonLd,
  currentVenueName,
  formatMiles,
  matchVenue,
  nearby,
  normaliseVenueName,
  venueCity,
  venueIlikeOrFilter,
} from "@/lib/venuePages";

const venues = [
  { name: "Wells Fargo Arena", slug: "wells-fargo-arena", address: "730 3rd St, Des Moines, IA 50309", latitude: 41.5908, longitude: -93.6208, capacity: 16980 },
  { name: "Des Moines Civic Center", slug: "des-moines-civic-center", address: "221 Walnut St, Des Moines, IA 50309", latitude: 41.5851, longitude: -93.6271 },
  { name: "Val Air Ballroom", slug: "val-air-ballroom", address: "301 Ashworth Rd, West Des Moines, IA 50265", latitude: 41.5724, longitude: -93.7288 },
  { name: "xBk", slug: "xbk", address: "1159 24th St, Des Moines, IA 50311" },
];

describe("matchVenue", () => {
  it("matches the scraper spellings of a venue", () => {
    expect(matchVenue("Wells Fargo Arena", venues)?.slug).toBe("wells-fargo-arena");
    expect(matchVenue("Wells Fargo Arena - Des Moines", venues)?.slug).toBe("wells-fargo-arena");
    expect(matchVenue("the Val Air Ballroom", venues)?.slug).toBe("val-air-ballroom");
    expect(matchVenue("Civic Center", venues)?.slug).toBe("des-moines-civic-center");
  });

  it("does not match on a one-word fragment", () => {
    expect(matchVenue("Arena", venues)).toBeNull();
    expect(matchVenue("Ballroom", venues)).toBeNull();
  });

  it("matches a one-word venue name only exactly", () => {
    expect(matchVenue("XBK", venues)?.slug).toBe("xbk");
    expect(matchVenue("xBk Live", venues)).toBeNull();
  });

  it("does not match across a word boundary", () => {
    expect(matchVenue("Wells Fargo Arenas Parking Lot", venues)).toBeNull();
  });

  it("reads apostrophes out, so Wooly's is Woolys and Lefty's is Leftys (pass 2 WP5 item 1)", () => {
    const rows = [
      { name: "Woolys", slug: "woolys" },
      { name: "Leftys Live Music", slug: "leftys-live-music" },
      ...venues,
    ];
    expect(normaliseVenueName("Wooly's")).toBe(normaliseVenueName("Woolys"));
    expect(matchVenue("Wooly's", rows)?.slug).toBe("woolys");
    expect(matchVenue("Wooly\u2019s", rows)?.slug).toBe("woolys");
    expect(matchVenue("Lefty's Live Music", rows)?.slug).toBe("leftys-live-music");
    expect(matchVenue("Leftys", rows)?.slug).toBe("leftys-live-music");
  });

  it("matches the arena under its new name, Casey's Center", () => {
    expect(matchVenue("Casey's Center", venues)?.slug).toBe("wells-fargo-arena");
    expect(matchVenue("Caseys Center", venues)?.slug).toBe("wells-fargo-arena");
    expect(matchVenue("Casey's Center at Iowa Events Center", venues)?.slug).toBe("wells-fargo-arena");
    expect(matchVenue("Wells Fargo Arena", venues)?.slug).toBe("wells-fargo-arena");
  });

  it("returns null for an empty or unknown venue", () => {
    expect(matchVenue(null, venues)).toBeNull();
    expect(matchVenue("Mickey's Irish Pub", venues)).toBeNull();
  });
});

describe("nearby", () => {
  const origin = venues[0];

  it("orders by straight-line distance and drops what is too far", () => {
    const out = nearby(origin, venues, { maxMiles: 2 });
    expect(out.map((x) => x.item.slug)).toEqual(["wells-fargo-arena", "des-moines-civic-center"]);
    expect(out[1].miles).toBeGreaterThan(0.3);
    expect(out[1].miles).toBeLessThan(0.7);
  });

  it("leaves out items with no coordinates rather than ranking them last", () => {
    expect(nearby(origin, venues, { maxMiles: 100 }).map((x) => x.item.slug)).not.toContain("xbk");
  });

  it("returns nothing when the origin has no coordinates", () => {
    expect(nearby({ latitude: null, longitude: null }, venues)).toEqual([]);
  });

  it("accepts the NUMERIC columns PostgREST returns as strings", () => {
    const out = nearby({ latitude: "41.5908", longitude: "-93.6208" }, venues, { maxMiles: 1 });
    expect(out[0].item.slug).toBe("wells-fargo-arena");
  });
});

describe("formatMiles and venueCity", () => {
  it("rounds to a tenth and floors tiny distances", () => {
    expect(formatMiles(0.04)).toBe("under 0.1 mi");
    expect(formatMiles(0.46)).toBe("0.5 mi");
  });

  it("reads the city from an address, or gives null", () => {
    expect(venueCity("301 Ashworth Rd, West Des Moines, IA 50265")).toBe("West Des Moines");
    expect(venueCity("Downtown")).toBeNull();
  });
});

describe("buildVenueJsonLd", () => {
  it("emits an EventVenue with address, locality and geo", () => {
    const node = buildVenueJsonLd(venues[2]);
    expect(node["@type"]).toBe("EventVenue");
    expect(node["@id"]).toBe("https://desmoinesinsider.com/music/venues/val-air-ballroom#venue");
    expect(node.address).toMatchObject({ streetAddress: "301 Ashworth Rd", addressLocality: "West Des Moines" });
    expect(node.geo).toMatchObject({ latitude: 41.5724, longitude: -93.7288 });
  });

  it("never asserts the unverified capacity", () => {
    expect(JSON.stringify(buildVenueJsonLd(venues[0]))).not.toMatch(/capacity|16980/i);
  });

  it("omits geo when there are no coordinates", () => {
    expect(buildVenueJsonLd(venues[3])).not.toHaveProperty("geo");
  });
});

describe("currentVenueName", () => {
  it("shows the arena under its current name and leaves others alone", () => {
    expect(currentVenueName("Wells Fargo Arena")).toBe("Casey's Center");
    expect(currentVenueName("Principal Park")).toBe("Principal Park");
    expect(currentVenueName(null)).toBeNull();
  });
});

describe("venueIlikeOrFilter", () => {
  it("fetches by every name the venue answers to, apostrophes as one-character wildcards", () => {
    const f = venueIlikeOrFilter({ name: "Wells Fargo Arena", slug: "wells-fargo-arena" });
    expect(f).toContain("venue.ilike.%Wells Fargo Arena%");
    expect(f).toContain("venue.ilike.%Casey_s Center%");
    expect(f).toContain("venue.ilike.%Caseys Center%");
  });

  it("keeps or() syntax out of the pattern", () => {
    const f = venueIlikeOrFilter({ name: "Bar, Grill (Upstairs)" });
    expect(f).toBe("venue.ilike.%Bar Grill Upstairs%");
  });
});
