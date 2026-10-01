import { describe, expect, it } from "vitest";
import {
  EVENT_SERIES,
  allSeriesTitlePatterns,
  getEventSeries,
  normaliseEventTitle,
  officialSeriesUrl,
  seriesAmong,
  seriesForEvent,
  seriesForSlug,
  seriesPath,
  seriesTitlePatterns,
} from "@/lib/eventSeries";

describe("normaliseEventTitle", () => {
  it.each([
    ["11th Annual Cloris Awards", "cloris awards"],
    ["Panda Fest 2026", "panda fest"],
    ["Hinterland 2026 Music Festival", "hinterland music festival"],
    ["Jazz in July 2026: Night 3", "jazz in july night 3"],
    ["22nd Annual Des Moines' Original Oktoberfest", "des moines original oktoberfest"],
    ["Des Moines\u2019 Original Oktoberfest", "des moines original oktoberfest"],
    ["2026 Taylor Fest - (6/19)", "taylor fest"],
    ["Forever in Love: Bridal Show, Sept 13", "forever in love bridal show"],
    ["The Playhouse 2025-26 Encore Awards", "the playhouse encore awards"],
    ["Time Travelers Vintage Expo, October 2026", "time travelers vintage expo october"],
    ["2026 Head of the Des Moines Regatta Sponsored by Above &amp; Beyond Cancer", "head of the des moines regatta sponsored by above beyond cancer"],
  ])("%s -> %s", (title, expected) => {
    expect(normaliseEventTitle(title)).toBe(expected);
  });

  it("keeps a month that is part of the name", () => {
    expect(normaliseEventTitle("Jazz in July")).toBe("jazz in july");
  });

  it("keeps an ordinal that names a tour rather than an edition", () => {
    expect(normaliseEventTitle("Blackberry Smoke: 25th Anniversary Tour 2026")).toBe(
      "blackberry smoke 25th anniversary tour",
    );
  });

  it("gives two years of the same event the same key", () => {
    expect(normaliseEventTitle("10th Annual Cloris Awards 2025")).toBe(
      normaliseEventTitle("11th Annual Cloris Awards"),
    );
  });

  it("is empty for nothing", () => {
    expect(normaliseEventTitle(null)).toBe("");
    expect(normaliseEventTitle("2026")).toBe("");
  });
});

describe("seriesForEvent", () => {
  it("matches every edition-shaped title to its series", () => {
    expect(seriesForEvent({ title: "Hinterland Music Festival (Saturday Pass) with Mumford & Sons" })?.slug).toBe(
      "hinterland-music-festival",
    );
    expect(seriesForEvent({ title: "2026 Des Moines Concours Gala" })?.slug).toBe("des-moines-concours");
    expect(seriesForEvent({ title: "PandaFest 2027" })?.slug).toBe("panda-fest");
  });

  it("does not take an event that merely mentions the series", () => {
    expect(seriesForEvent({ title: "Backyard BBQ Contest at Beaverdale Fall Festival" })).toBeNull();
    expect(seriesForEvent({ title: "Kids Markets at Des Moines Holiday Boutique" })).toBeNull();
  });

  it("requires the venue for a name other places use", () => {
    expect(seriesForEvent({ title: "Pumpkin Fest", venue: "Center Grove Orchard" })?.slug).toBe(
      "center-grove-orchard-pumpkin-fest",
    );
    expect(seriesForEvent({ title: "Pumpkin Fest", venue: "Some Other Farm" })).toBeNull();
    expect(seriesForEvent({ title: "Family Halloween", location: "Living History Farms, Urbandale" })?.slug).toBe(
      "living-history-farms-family-halloween",
    );
  });
});

describe("seriesAmong", () => {
  it("lists each series once, in registry order, from a month's rows", () => {
    const found = seriesAmong([
      { title: "Pumpkin Fest", venue: "Center Grove Orchard" },
      { title: "Panda Fest 2026" },
      { title: "Panda Fest 2026", venue: "Outlets of Des Moines" },
      { title: "Gary Clark Jr." },
    ]);
    expect(found.map((s) => s.slug)).toEqual(["panda-fest", "center-grove-orchard-pumpkin-fest"]);
    expect(seriesAmong([])).toEqual([]);
  });
});

describe("seriesForSlug", () => {
  it("reads a dated event slug", () => {
    expect(seriesForSlug("11th-annual-cloris-awards-2026-08-30")?.slug).toBe("cloris-awards");
    expect(seriesForSlug("panda-fest-2026-2026-10-02")?.slug).toBe("panda-fest");
  });

  it("cannot match a venue-qualified series without a venue", () => {
    expect(seriesForSlug("pumpkin-fest-2026-10-01")).toBeNull();
  });

  it("is null for an unrelated slug", () => {
    expect(seriesForSlug("gary-clark-jr-2026-09-30")).toBeNull();
    expect(seriesForSlug(undefined)).toBeNull();
  });
});

describe("the registry", () => {
  it("has 20 series with unique slugs and aliases already normalised", () => {
    expect(EVENT_SERIES).toHaveLength(20);
    expect(new Set(EVENT_SERIES.map((s) => s.slug)).size).toBe(20);
    for (const s of EVENT_SERIES) {
      expect(s.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      for (const alias of s.aliases) expect(normaliseEventTitle(alias)).toBe(alias);
    }
  });

  it("holds no dates", () => {
    expect(JSON.stringify(EVENT_SERIES)).not.toMatch(/\b20\d{2}\b/);
  });

  it("builds paths and finds by slug", () => {
    const def = getEventSeries("rainbow-safari");
    expect(def && seriesPath(def)).toBe("/events/series/rainbow-safari");
    expect(getEventSeries("nope")).toBeNull();
  });

  it("builds ilike patterns safe for an or() filter", () => {
    const def = getEventSeries("des-moines-original-oktoberfest");
    expect(def && seriesTitlePatterns(def)).toEqual(["title.ilike.*des*moines*original*oktoberfest*"]);
    for (const p of allSeriesTitlePatterns()) expect(p).toMatch(/^title\.ilike\.\*[a-z0-9*]+\*$/);
  });
});

describe("officialSeriesUrl", () => {
  const def = getEventSeries("panda-fest");
  if (!def) throw new Error("panda-fest missing");

  it("takes the first stored URL on the organiser's host", () => {
    expect(
      officialSeriesUrl(def, [
        { source_url: "https://www.eventbrite.com/e/panda-fest" },
        { source_url: "https://www.pandafests.com/" },
      ]),
    ).toBe("https://www.pandafests.com/");
  });

  it("skips a link the checker flagged, and has none without one", () => {
    expect(officialSeriesUrl(def, [{ source_url: "https://pandafests.com/", source_url_broken: true }])).toBeNull();
    expect(officialSeriesUrl(def, [{ source_url: "https://seatgeek.com/x" }])).toBeNull();
  });
});
