import { describe, it, expect } from "vitest";
import {
  EVENT_AREAS,
  findEventArea,
  isInBBox,
  eventInArea,
  applyEventArea,
  eventAreaOrFilter,
  type BBoxEventArea,
} from "@/lib/eventAreas";
import { SUBURBS, type SuburbSlug } from "@/lib/suburbs";

// Coordinates as seeded in supabase/migrations/20260203000000_known_venues.sql
// and 20260203000001_add_more_known_venues.sql.
const VENUES: Record<string, [number, number]> = {
  "Wells Fargo Arena": [41.5908, -93.6208],
  "Civic Center": [41.5869, -93.6285],
  "Principal Park": [41.5811, -93.6233],
  "Pappajohn Sculpture Park": [41.5867, -93.635],
  "Science Center of Iowa": [41.5856, -93.6308],
  "Temple Theater": [41.5847, -93.6269],
  "Downtown Farmers Market": [41.5869, -93.6194],
  "Western Gateway Park": [41.5867, -93.6342],
  "Wooly's": [41.5908, -93.6097],
  "Botanical Garden": [41.5917, -93.6156],
  "The Ingersoll": [41.5847, -93.6683],
  "Des Moines Art Center": [41.5847, -93.6686],
  "Community Playhouse": [41.5856, -93.6683],
  "Hoyt Sherman Place": [41.5847, -93.6433],
  "Val Air Ballroom": [41.5722, -93.7494],
  "Iowa State Fairgrounds": [41.5928, -93.5658],
  "Confluence Brewing": [41.5622, -93.6125],
  "xBk Live": [41.5939, -93.6631],
};

const EXPECTED: Record<string, string[]> = {
  downtown: [
    "Wells Fargo Arena",
    "Civic Center",
    "Principal Park",
    "Pappajohn Sculpture Park",
    "Science Center of Iowa",
    "Temple Theater",
    "Downtown Farmers Market",
    "Western Gateway Park",
  ],
  "east-village": ["Wooly's", "Botanical Garden"],
  ingersoll: ["The Ingersoll", "Des Moines Art Center", "Community Playhouse"],
  "valley-junction": [],
};

function bboxArea(slug: string): BBoxEventArea {
  const area = findEventArea(slug);
  if (!area || area.kind !== "bbox") throw new Error(`no bbox area ${slug}`);
  return area;
}

describe("eventAreas (events plan WP0 item 6)", () => {
  it("slugs are unique and every area the FAQ promises exists", () => {
    const slugs = EVENT_AREAS.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of ["altoona", "johnston", "windsor-heights", "des-moines", "downtown", "east-village", "valley-junction", "ingersoll"]) {
      expect(findEventArea(s), s).toBeDefined();
    }
    expect(findEventArea("nowhere")).toBeUndefined();
    expect(findEventArea(null)).toBeUndefined();
  });

  it.each(Object.entries(EXPECTED))("known venues inside %s are exactly the expected set", (slug, expected) => {
    const area = bboxArea(slug);
    const inside = Object.entries(VENUES)
      .filter(([, [lat, lng]]) => isInBBox(lat, lng, area.bbox))
      .map(([name]) => name);
    expect(inside.sort()).toEqual([...expected].sort());
  });

  it("bboxes do not overlap", () => {
    const boxes = EVENT_AREAS.filter((a): a is BBoxEventArea => a.kind === "bbox");
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].bbox;
        const b = boxes[j].bbox;
        const overlaps = a.south < b.north && b.south < a.north && a.west < b.east && b.west < a.east;
        expect(overlaps, `${boxes[i].slug} / ${boxes[j].slug}`).toBe(false);
      }
    }
  });

  it("a city area is an exact match, so Des Moines excludes West Des Moines", () => {
    const dsm = findEventArea("des-moines")!;
    expect(eventInArea({ city: "Des Moines" }, dsm)).toBe(true);
    expect(eventInArea({ city: " des moines " }, dsm)).toBe(true);
    expect(eventInArea({ city: "West Des Moines" }, dsm)).toBe(false);
    expect(eventInArea({ city: null }, dsm)).toBe(false);
  });

  it("an event with no coordinates is in no bbox", () => {
    expect(eventInArea({ latitude: null, longitude: null }, bboxArea("downtown"))).toBe(false);
    expect(isInBBox(Number.NaN, -93.62, bboxArea("downtown").bbox)).toBe(false);
  });

  it("applyEventArea writes an exact ilike for Des Moines, a place group for a suburb, four bounds for bboxes", () => {
    const calls: string[] = [];
    const builder = {
      ilike(c: string, v: string) { calls.push(`ilike ${c} ${v}`); return builder; },
      or(v: string) { calls.push(`or ${v}`); return builder; },
      gte(c: string, v: number) { calls.push(`gte ${c} ${v}`); return builder; },
      lte(c: string, v: number) { calls.push(`lte ${c} ${v}`); return builder; },
    };
    expect(applyEventArea(builder, findEventArea("des-moines")!)).toBe(builder);
    expect(calls).toEqual(["ilike city Des Moines"]);
    calls.length = 0;
    applyEventArea(builder, findEventArea("ankeny")!);
    expect(calls).toEqual([`or ${eventAreaOrFilter(findEventArea("ankeny")!)}`]);
    calls.length = 0;
    applyEventArea(builder, bboxArea("east-village"));
    expect(calls).toEqual([
      "gte latitude 41.583",
      "lte latitude 41.596",
      "gte longitude -93.617",
      "lte longitude -93.6",
    ]);
  });
});

describe("one definition of each suburb (events-pass2 WP5 items 5 and 6)", () => {
  it("every SUBURBS slug is a city area named for the suburb", () => {
    for (const [slug, suburb] of Object.entries(SUBURBS)) {
      const area = findEventArea(slug);
      expect(area, slug).toBeDefined();
      expect(area?.kind, slug).toBe("city");
      if (area?.kind === "city") {
        expect(area.city, slug).toBe(suburb.name);
        expect(area.locationFallback, slug).toBe(true);
      }
    }
  });

  it("every nearby suburb is a suburb page, and never the page itself", () => {
    for (const [slug, suburb] of Object.entries(SUBURBS)) {
      for (const near of suburb.nearby) {
        expect(Object.keys(SUBURBS), `${slug} -> ${near}`).toContain(near);
        expect(near).not.toBe(slug);
      }
    }
    const waukee: SuburbSlug = "waukee";
    expect(findEventArea(waukee)?.label).toBe("Waukee");
  });

  it("the place group is city first, then a null city with a location ending in the suburb", () => {
    expect(eventAreaOrFilter(findEventArea("urbandale")!)).toBe(
      'city.ilike.Urbandale,and(city.is.null,or(location.ilike."%, Urbandale",location.ilike."%, Urbandale, IA%",location.ilike."%, Urbandale, Iowa%"))'
    );
    expect(eventAreaOrFilter(findEventArea("des-moines")!)).toBeNull();
    expect(eventAreaOrFilter(bboxArea("downtown"))).toBeNull();
  });

  it("matches by place, not substring", () => {
    const urbandale = findEventArea("urbandale")!;
    expect(eventInArea({ city: "Urbandale", location: "Living History Farms" }, urbandale)).toBe(true);
    expect(eventInArea({ city: null, location: "Walnut Creek Park, Urbandale" }, urbandale)).toBe(true);
    expect(eventInArea({ city: null, location: "3600 86th St, Urbandale, IA 50322" }, urbandale)).toBe(true);
    // A street named for the suburb, in another city.
    expect(eventInArea({ city: "Des Moines", location: "4000 Urbandale Ave, Des Moines" }, urbandale)).toBe(false);
    expect(eventInArea({ city: null, location: "4000 Urbandale Ave, Des Moines, IA" }, urbandale)).toBe(false);
    // City wins: a city that isn't Urbandale never falls back to location.
    expect(eventInArea({ city: "Clive", location: "Something, Urbandale" }, urbandale)).toBe(false);
    // West Des Moines is not Des Moines, either way round.
    const wdm = findEventArea("west-des-moines")!;
    expect(eventInArea({ city: null, location: "Valley Junction, West Des Moines" }, wdm)).toBe(true);
    expect(eventInArea({ city: null, location: "Court Ave, Des Moines" }, wdm)).toBe(false);
  });
});
