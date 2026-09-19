import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  EVENT_LIST_COLUMNS,
  RESTAURANT_LIST_COLUMNS,
  ATTRACTION_LIST_COLUMNS,
  PLAYGROUND_LIST_COLUMNS,
  HOTEL_LIST_COLUMNS,
} from "@/lib/listColumns";

/**
 * WEB-PERF-034. Swapping select('*') for a projection makes a field the card
 * reads but the projection omits render as nothing, silently - every one of
 * these cards guards with `&&`, so a missing field looks like a row that simply
 * has no value for it.
 *
 * The same swap also turned three PRE-EXISTING dead reads visible. Under
 * select('*'), `restaurant.address`, `attraction.category` and
 * `attraction.slug` all came back undefined - public.restaurants has no address
 * column, public.attractions has no category, and attractions.slug is not in
 * the generated types - and nobody could tell, because undefined and "this row
 * has no address" look identical through a `&&`. The address line and the
 * category badge had never rendered for anyone.
 *
 * So this asserts the rule rather than the three fixes: every `item.field` a
 * favorites tab reads must be in the projection that tab fetches with.
 */
const TABS = [
  { variable: "events", item: "event", columns: EVENT_LIST_COLUMNS },
  { variable: "favoritedRestaurants", item: "restaurant", columns: RESTAURANT_LIST_COLUMNS },
  { variable: "favoritedAttractions", item: "attraction", columns: ATTRACTION_LIST_COLUMNS },
  { variable: "favoritedPlaygrounds", item: "playground", columns: PLAYGROUND_LIST_COLUMNS },
  { variable: "favoritedHotels", item: "hotel", columns: HOTEL_LIST_COLUMNS },
] as const;

const SOURCE = readFileSync("src/components/FavoritesView.tsx", "utf8");

function projected(columns: string): Set<string> {
  return new Set(columns.split(",").map((c) => c.trim()).filter(Boolean));
}

/** The tab's JSX, with JSX comments removed so prose cannot register a field. */
function tabBody(variable: string): string {
  const start = SOURCE.indexOf(`${variable}.map((`);
  expect(start, `${variable} should be rendered in FavoritesView`).toBeGreaterThan(-1);
  const end = SOURCE.indexOf("</TabsContent>", start);
  return SOURCE.slice(start, end).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

describe("favorites tabs read only what they fetch", () => {
  it.each(TABS)("$item card reads no field outside its projection", ({ variable, item, columns }) => {
    const body = tabBody(variable);
    const read = new Set(
      [...body.matchAll(new RegExp(`\\b${item}\\.([a-z_][a-z0-9_]*)`, "g"))].map((m) => m[1]),
    );
    expect(read.size, "the card should read at least one field").toBeGreaterThan(0);
    expect([...read].filter((f) => !projected(columns).has(f))).toEqual([]);
  });

  it("no tab has gone back to select('*')", () => {
    // The point of the projection is the payload; a re-introduced star would
    // pass every assertion above while undoing the change.
    expect(SOURCE).not.toMatch(/\.select\(\s*["']\*["']\s*\)/);
  });

  it("the id set comes from the shared hook, not a second read of content_favorites", () => {
    // AC3. Four of the nine requests were re-reads of an id set
    // useContentFavorites already holds.
    expect(SOURCE).not.toContain('from("content_favorites")');
    expect(SOURCE).toContain("useFavoritedRows");
  });
});
