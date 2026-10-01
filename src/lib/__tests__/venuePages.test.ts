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

  it("matches a one-word venue name only exactly, or by a listed alias", () => {
    expect(matchVenue("XBK", venues)?.slug).toBe("xbk");
    // SEO-045: "xBk Live" is how the events table spells it, so it is an alias.
    expect(matchVenue("xBk Live", venues)?.slug).toBe("xbk");
    expect(matchVenue("xBk Gallery", venues)).toBeNull();
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

/**
 * SEO-045. The venues rows 20261018000045 adds, and the venue strings the
 * events table actually carried for them (visible, upcoming, production
 * 2026-10-01). Each string must reach its own page and no other.
 */
describe("matchVenue over the top 30 venues", () => {
  const rows = [
    { name: "Hoyt Sherman Place", slug: "hoyt-sherman-place" },
    { name: "Vibrant Music Hall", slug: "vibrant-music-hall" },
    { name: "Wells Fargo Arena", slug: "wells-fargo-arena" },
    { name: "Flix Brewhouse", slug: "flix-brewhouse" },
    { name: "Woolys", slug: "woolys" },
    { name: "Des Moines Civic Center", slug: "des-moines-civic-center" },
    { name: "Funny Bone Comedy Club", slug: "funny-bone-comedy-club" },
    { name: "Knapp Center", slug: "knapp-center" },
    { name: "Hilton Coliseum", slug: "hilton-coliseum" },
    { name: "Mediacom Stadium", slug: "mediacom-stadium" },
    { name: "The Ingersoll", slug: "the-ingersoll" },
    { name: "Val Air Ballroom", slug: "val-air-ballroom" },
    { name: "xBk", slug: "xbk" },
    { name: "Des Moines Community Playhouse", slug: "des-moines-community-playhouse" },
    { name: "MidAmerican Energy Company RecPlex", slug: "midamerican-energy-company-recplex" },
    { name: "Living History Farms", slug: "living-history-farms" },
    { name: "Drake Stadium", slug: "drake-stadium" },
    { name: "Water Works Park", slug: "water-works-park" },
    { name: "Stephens Auditorium", slug: "stephens-auditorium" },
    { name: "Prairie Meadows Casino & Hotel", slug: "prairie-meadows" },
    { name: "Center Grove Orchard", slug: "center-grove-orchard" },
    { name: "Jack Trice Stadium", slug: "jack-trice-stadium" },
    { name: "Greater Des Moines Botanical Garden", slug: "greater-des-moines-botanical-garden" },
    { name: "EMC Expo Center", slug: "emc-expo-center" },
    { name: "Iowa Events Center", slug: "iowa-events-center" },
    { name: "Principal Park", slug: "principal-park" },
    { name: "Iowa State Fairgrounds", slug: "iowa-state-fairgrounds" },
    { name: "Jordan Creek Town Center", slug: "jordan-creek-town-center" },
    { name: "Science Center of Iowa", slug: "science-center-of-iowa" },
  ];

  const production: Array<[string, string]> = [
    ["Hoyt Sherman Place", "hoyt-sherman-place"],
    ["Vibrant Music Hall", "vibrant-music-hall"],
    ["Wells Fargo Arena", "wells-fargo-arena"],
    ["Casey's Center", "wells-fargo-arena"],
    ["Casey's Center at Iowa Events Center", "wells-fargo-arena"],
    ["Flix Brewhouse", "flix-brewhouse"],
    ["Wooly's", "woolys"],
    ["Civic Center of Greater Des Moines", "des-moines-civic-center"],
    ["Funny Bone Comedy Club", "funny-bone-comedy-club"],
    ["Knapp Center", "knapp-center"],
    ["Hilton Coliseum", "hilton-coliseum"],
    ["Mediacom Stadium", "mediacom-stadium"],
    ["The Ingersoll", "the-ingersoll"],
    ["Val Air Ballroom", "val-air-ballroom"],
    ["xBk Live", "xbk"],
    ["Des Moines Community Playhouse", "des-moines-community-playhouse"],
    ["The MidAmerican Energy Company RecPlex", "midamerican-energy-company-recplex"],
    ["Living History Farms", "living-history-farms"],
    ["Drake Stadium", "drake-stadium"],
    ["Water Works Park", "water-works-park"],
    ["Stephens Auditorium", "stephens-auditorium"],
    ["Prairie Meadows Casino & Hotel", "prairie-meadows"],
    ["Center Grove Orchard", "center-grove-orchard"],
    ["MidAmerican Energy Field at Jack Trice Stadium", "jack-trice-stadium"],
    ["Greater Des Moines Botanical Garden", "greater-des-moines-botanical-garden"],
    ["EMC Expo Center", "emc-expo-center"],
    ["Iowa Events Center", "iowa-events-center"],
    ["Principal Park", "principal-park"],
    ["Principal Park, Home of the Iowa Cubs", "principal-park"],
    ["Iowa State Fairgrounds", "iowa-state-fairgrounds"],
    ["4-H Exhibits Building, Iowa State Fairgrounds", "iowa-state-fairgrounds"],
    ["Iowa State Fairgrounds - Varied Industries Building", "iowa-state-fairgrounds"],
    ["Jordan Creek Town Center", "jordan-creek-town-center"],
    ["Science Center of Iowa", "science-center-of-iowa"],
  ];

  it.each(production)("%s -> %s", (eventVenue, slug) => {
    expect(matchVenue(eventVenue, rows)?.slug).toBe(slug);
  });

  it("an equal name beats a longer alias that contains it", () => {
    // Without tiers the arena's alias "Casey's Center at Iowa Events Center"
    // outscored the Iowa Events Center row on length.
    expect(matchVenue("Iowa Events Center", rows)?.slug).toBe("iowa-events-center");
  });

  it("a bare city is not a venue", () => {
    // Production carries two upcoming events whose venue is just "Des Moines".
    // It is 10 of the Civic Center's 23 characters and must match nothing.
    expect(matchVenue("Des Moines", rows)).toBeNull();
    expect(matchVenue("West Des Moines", rows)).toBeNull();
    expect(matchVenue("Des Moines", [rows[5]])).toBeNull();
  });

  it("still matches a fragment that is most of the name", () => {
    expect(matchVenue("Civic Center", rows)?.slug).toBe("des-moines-civic-center");
    expect(matchVenue("Hoyt Sherman", rows)?.slug).toBe("hoyt-sherman-place");
  });

  it("leaves unrelated places alone", () => {
    expect(matchVenue("Best Buy Jordan Creek", rows)).toBeNull();
    expect(matchVenue("Rook Room Game Lounge and Cafe", rows)).toBeNull();
    expect(matchVenue("Iowa State Fair Grandstand", rows)).toBeNull();
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
