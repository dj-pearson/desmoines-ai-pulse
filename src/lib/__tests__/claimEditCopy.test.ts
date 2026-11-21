import { describe, expect, it } from "vitest";
import { CLAIM_EDIT_COPY } from "@/lib/businessCopy";
import { OWNER_EDITABLE_FIELDS, OWNER_STRUCTURED_FIELDS } from "@/hooks/useMyBusinessClaims";

/**
 * WEB-ADS-048: the claim page promised hours to every owner while the owner
 * form had no hours at all. The promise is now per type; this holds each
 * line to the fields the /business editor sends for that type.
 */

const WORD_FOR: Record<string, RegExp> = {
  hours_json: /hours/i,
  phone: /phone/i,
  menu_url: /menu/i,
  website: /website/i,
  description: /description/i,
  image_url: /photo/i,
};

function editable(type: "restaurant" | "attraction"): Set<string> {
  return new Set<string>([...OWNER_EDITABLE_FIELDS[type], ...OWNER_STRUCTURED_FIELDS[type]]);
}

describe("claim page copy", () => {
  for (const type of ["restaurant", "attraction"] as const) {
    it(`${type}: names every field the owner can edit and none they cannot`, () => {
      const fields = editable(type);
      for (const [field, word] of Object.entries(WORD_FOR)) {
        if (fields.has(field)) expect(CLAIM_EDIT_COPY[type], field).toMatch(word);
        else expect(CLAIM_EDIT_COPY[type], field).not.toMatch(word);
      }
    });
  }

  it("counter-check: the old line fails the attraction rule", () => {
    const old = "Hours, phone, website and description, changed from your own account instead of an email to us.";
    expect(old).toMatch(WORD_FOR.hours_json);
    expect(editable("attraction").has("hours_json")).toBe(false);
  });
});
