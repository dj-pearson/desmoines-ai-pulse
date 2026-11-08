import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DIETS } from "../useDietaryRestaurants";

/**
 * IOS-AUDIT-FEAT-044. The iOS Dining diet filter is what a shared
 * /restaurants/dietary/<diet> link opens (DeepLinkHandler,
 * IOS-AUDIT-FEAT-043), so its keyword table has to be the one that page
 * uses. It had copied DIETARY_KEYWORDS from useRestaurants.ts instead: no
 * kosher, and keto without "ketogenic". Kosher links opened the unfiltered
 * tab and keto found fewer rows than the page they came from.
 *
 * Swift cannot import this file and there is no compiler in cloud sessions,
 * so this reads the Swift source. It parses only the shapes the two tables
 * are written in today; if either is rewritten into another shape the
 * parse finds nothing and the test fails rather than passing on nothing.
 */

const SERVICE = "ios/DesMoinesInsider/Services/RestaurantsService.swift";
const FILTERS = "ios/DesMoinesInsider/Views/Restaurants/RestaurantInlineFilters.swift";

function stringsIn(text: string): string[] {
  return [...text.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

/** `static let dietaryKeywords: [String: [String]] = [ "id": ["kw", ...], ... ]` */
function iosDietaryKeywords(): Record<string, string[]> {
  const src = readFileSync(SERVICE, "utf8");
  const block = src.match(/static let dietaryKeywords: \[String: \[String\]\] = \[([\s\S]*?)\n\s*\]/);
  expect(block, `dietaryKeywords literal not found in ${SERVICE}`).not.toBeNull();
  const table: Record<string, string[]> = {};
  for (const m of block![1].matchAll(/"([^"]+)":\s*\[([^\]]*)\]/g)) {
    table[m[1]] = stringsIn(m[2]);
  }
  return table;
}

/** DietaryPill's `options`: `("key", "Label", "emoji"),` per row. */
function iosDietaryPillOptions(): { key: string; label: string }[] {
  const src = readFileSync(FILTERS, "utf8");
  const pill = src.slice(src.indexOf("private struct DietaryPill"));
  const block = pill.match(/private static let options[^=]*= \[([\s\S]*?)\n\s*\]/);
  expect(block, `DietaryPill options not found in ${FILTERS}`).not.toBeNull();
  return [...block![1].matchAll(/\(\s*"([^"]+)",\s*"([^"]+)"/g)].map((m) => ({ key: m[1], label: m[2] }));
}

describe("iOS Dining diets match the web's DIETS (IOS-AUDIT-FEAT-044)", () => {
  it("RestaurantsService.dietaryKeywords has the same ids and keywords", () => {
    const expected = Object.fromEntries(DIETS.map((d) => [d.id, [...d.keywords]]));
    expect(iosDietaryKeywords()).toEqual(expected);
  });

  it("DietaryPill offers every diet, with the web's labels, in the web's order", () => {
    expect(iosDietaryPillOptions()).toEqual(DIETS.map((d) => ({ key: d.id, label: d.label })));
  });
});
