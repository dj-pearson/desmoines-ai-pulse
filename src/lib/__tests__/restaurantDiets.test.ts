import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { DIETARY_KEYWORDS as LIST_FILTER_KEYWORDS, resolveDietarySelections } from "@/hooks/useRestaurants";
import { DIETS, dietOrClause } from "@/hooks/useDietaryRestaurants";
import { DIETARY_OPTIONS } from "@/lib/restaurantPresets";
import { dietaryIlikeClauses } from "@/lib/restaurantDiets";

/**
 * WEB-FEAT-054. /restaurants (list filter and map) and /restaurants/dietary
 * kept a keyword table each. The list's had no kosher and keto without
 * "ketogenic", so /restaurants?tags=keto listed fewer rows than
 * /restaurants/dietary/keto, and the list could not filter for kosher.
 */
describe("one diet keyword table for the list filter and the dietary pages", () => {
  it("gives the list filter exactly the dietary pages' keywords", () => {
    expect(LIST_FILTER_KEYWORDS).toEqual(Object.fromEntries(DIETS.map((d) => [d.id, [...d.keywords]])));
  });

  it("offers every diet the dietary pages have, kosher included, in their order", () => {
    expect(DIETARY_OPTIONS).toEqual(DIETS.map((d) => ({ value: d.id, label: d.label })));
    expect(DIETARY_OPTIONS.map((o) => o.value)).toContain("kosher");
    expect(resolveDietarySelections({ tags: ["kosher"] })).toEqual(["kosher"]);
  });

  it("searches the same keywords over the same fields as the dietary page for each diet", () => {
    const asSet = (clauses: string[]) => new Set(clauses);
    for (const diet of DIETS) {
      expect(asSet(dietaryIlikeClauses([diet.id]))).toEqual(asSet(dietOrClause(diet).split(",")));
    }
  });

  it("matches 'ketogenic' when the list filter has keto selected", () => {
    expect(dietaryIlikeClauses(["keto"])).toContain("description.ilike.%ketogenic%");
  });

  it("yields no clause for an id outside the table, rather than searching for the slug", () => {
    expect(dietaryIlikeClauses(["Happy Hour"])).toEqual([]);
    expect(dietaryIlikeClauses(["vegan", "Takeout"])).toEqual([
      "description.ilike.%vegan%",
      "cuisine.ilike.%vegan%",
      "name.ilike.%vegan%",
    ]);
  });
});
