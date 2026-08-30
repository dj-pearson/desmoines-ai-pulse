import { describe, it, expect } from "vitest";
import {
  computeHomeSectionOrder,
  CANONICAL_SECTION_ORDER,
  PERSONALIZATION_THRESHOLD,
} from "@/lib/homeSectionOrder";

/** WEB-FEAT-007 — deterministic home section ordering. */
describe("computeHomeSectionOrder", () => {
  it("returns the canonical order + control cohort with no signal", () => {
    expect(computeHomeSectionOrder({})).toEqual({
      order: CANONICAL_SECTION_ORDER,
      cohort: "control",
    });
  });

  it("stays canonical below the personalization threshold", () => {
    const r = computeHomeSectionOrder({ restaurant: PERSONALIZATION_THRESHOLD - 1 });
    expect(r.cohort).toBe("control");
    expect(r.order).toEqual(CANONICAL_SECTION_ORDER);
  });

  it("promotes a dominant type to the front (dining-first)", () => {
    const r = computeHomeSectionOrder({ restaurant: 5, event: 1 });
    expect(r.order).toEqual(["restaurant", "event", "attraction"]);
    expect(r.cohort).toBe("personalized:restaurant");
  });

  it("promotes attractions when dominant", () => {
    const r = computeHomeSectionOrder({ attraction: 4, event: 1, restaurant: 2 });
    expect(r.order[0]).toBe("attraction");
    expect(r.order).toEqual(["attraction", "event", "restaurant"]);
  });

  it("falls back to canonical on a tie (no flicker between equal interests)", () => {
    const r = computeHomeSectionOrder({ event: 4, restaurant: 4 });
    expect(r.cohort).toBe("control");
    expect(r.order).toEqual(CANONICAL_SECTION_ORDER);
  });

  it("is deterministic for the same input", () => {
    const a = computeHomeSectionOrder({ event: 7 });
    const b = computeHomeSectionOrder({ event: 7 });
    expect(a).toEqual(b);
    expect(a.order).toEqual(["event", "restaurant", "attraction"]);
  });
});
