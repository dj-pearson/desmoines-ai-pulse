import { describe, expect, it } from "vitest";
import { narrowestFilterChip } from "@/lib/narrowestFilterChip";

const chip = (key: string) => ({ key, label: key, onRemove: () => undefined });

describe("narrowestFilterChip (WEB-UX-090)", () => {
  it("prefers a diet keyword over cuisine, price and search", () => {
    expect(narrowestFilterChip([chip("q"), chip("cuisine-Thai"), chip("price-$$"), chip("tag-vegan")])?.key).toBe("tag-vegan");
  });
  it("rating before price and cuisine", () => {
    expect(narrowestFilterChip([chip("cuisine-Thai"), chip("rating"), chip("price-$$")])?.key).toBe("rating");
  });
  it("search text is the last resort", () => {
    expect(narrowestFilterChip([chip("q"), chip("cuisine-Thai")])?.key).toBe("cuisine-Thai");
    expect(narrowestFilterChip([chip("q")])?.key).toBe("q");
  });
  it("ties go to the last added; nothing active is null", () => {
    expect(narrowestFilterChip([chip("cuisine-Thai"), chip("cuisine-Pho")])?.key).toBe("cuisine-Pho");
    expect(narrowestFilterChip([])).toBeNull();
  });
});
