import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { attractionSearchFilter } from "@/hooks/useAttractions";

describe("attractionSearchFilter", () => {
  it("strips the comma that used to 400 the list", () => {
    const f = attractionSearchFilter("Ankeny, IA");
    expect(f).toBe(
      "name.ilike.%Ankeny IA%,type.ilike.%Ankeny IA%,location.ilike.%Ankeny IA%,description.ilike.%Ankeny IA%",
    );
    // Exactly the three separators between the four clauses.
    expect(f?.split(",")).toHaveLength(4);
  });

  it("removes parentheses and the ilike wildcard", () => {
    expect(attractionSearchFilter("zoo (kids) *")).toContain("name.ilike.%zoo kids%");
  });

  it("escapes LIKE wildcards", () => {
    expect(attractionSearchFilter("50% off")).toContain("name.ilike.%50\\% off%");
  });

  it("keeps apostrophes", () => {
    expect(attractionSearchFilter("Casey's")).toContain("name.ilike.%Casey's%");
  });

  it("applies no filter for empty or all-punctuation input", () => {
    expect(attractionSearchFilter("")).toBeNull();
    expect(attractionSearchFilter(undefined)).toBeNull();
    expect(attractionSearchFilter(" , ( ) ")).toBeNull();
  });
});
