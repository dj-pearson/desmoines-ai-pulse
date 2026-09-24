import { describe, it, expect } from "vitest";
import {
  EVENT_SMART_PRESETS,
  isPresetActive,
  PRICE_OPTIONS,
  LOCATION_OPTIONS,
} from "@/lib/eventPresets";
import { EVENT_CATEGORIES } from "@/lib/eventCategories";
import { EVENT_AREAS } from "@/lib/eventAreas";

// docs/page-plans/events.md WP2. The hub filters category with `eq`, so a
// preset naming a category outside the canonical vocabulary returns nothing.
// "Food & Drink" and "Art & Culture" did exactly that.

describe("event smart presets", () => {
  it("every preset category is canonical", () => {
    for (const preset of EVENT_SMART_PRESETS) {
      const category = preset.filters?.category;
      if (category !== undefined) {
        expect(EVENT_CATEGORIES, `${preset.id} -> ${category}`).toContain(category);
      }
    }
  });

  it("every preset either filters or links, never both, never neither", () => {
    for (const preset of EVENT_SMART_PRESETS) {
      expect(Boolean(preset.filters) !== Boolean(preset.href), preset.id).toBe(true);
    }
  });

  it("date night links to its landing instead of faking a category", () => {
    const dateNight = EVENT_SMART_PRESETS.find((p) => p.id === "date-night");
    expect(dateNight?.href).toBe("/events/date-night");
    expect(dateNight?.filters).toBeUndefined();
  });

  it("tonight describes tonight, not 'happening now'", () => {
    const tonight = EVENT_SMART_PRESETS.find((p) => p.id === "tonight");
    expect(tonight?.filters).toEqual({ datePreset: "today" });
    expect(tonight?.description).not.toMatch(/happening now/i);
  });

  it("preset price values are options the price control offers", () => {
    const priceValues = PRICE_OPTIONS.map((o) => o.value);
    for (const preset of EVENT_SMART_PRESETS) {
      const price = preset.filters?.priceRange;
      if (price !== undefined) expect(priceValues).toContain(price);
    }
  });

  it("ON state is derived from the current values", () => {
    const freeWeekend = EVENT_SMART_PRESETS.find((p) => p.id === "free-weekend");
    if (!freeWeekend) throw new Error("free-weekend preset missing");
    expect(isPresetActive(freeWeekend, {})).toBe(false);
    expect(isPresetActive(freeWeekend, { priceRange: "free" })).toBe(false);
    expect(isPresetActive(freeWeekend, { priceRange: "free", datePreset: "this-weekend" })).toBe(true);
    expect(
      isPresetActive(freeWeekend, { priceRange: "free", datePreset: "this-weekend", category: "Music" })
    ).toBe(true);
  });

  it("a link preset is never ON", () => {
    const dateNight = EVENT_SMART_PRESETS.find((p) => p.id === "date-night");
    if (!dateNight) throw new Error("date-night preset missing");
    expect(isPresetActive(dateNight, { category: "Arts" })).toBe(false);
  });
});

describe("filter options", () => {
  it("price offers Any and Free only until numeric prices exist (D2)", () => {
    expect(PRICE_OPTIONS.map((o) => o.value)).toEqual(["any-price", "free"]);
  });

  it("location options come from eventAreas", () => {
    expect(LOCATION_OPTIONS[0].value).toBe("any-location");
    expect(LOCATION_OPTIONS.slice(1).map((o) => o.value)).toEqual(EVENT_AREAS.map((a) => a.slug));
  });
});
