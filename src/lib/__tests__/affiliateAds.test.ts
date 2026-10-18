import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { AFFILIATE_PARTNERS, HOTEL_BRAND_AFFILIATE_LINKS } from "@/lib/affiliateAds";

describe("hotel brand affiliate links (WEB-FEAT-021)", () => {
  it("keeps every brand's link, including the two with no banner", () => {
    expect(Object.keys(HOTEL_BRAND_AFFILIATE_LINKS).sort()).toEqual(
      ["choice", "hilton", "hyatt", "ihg", "marriott"],
    );
    for (const url of Object.values(HOTEL_BRAND_AFFILIATE_LINKS)) {
      expect(url).toMatch(/^https:\/\/[a-z]+\.[a-z]+\.[a-z]+\/\w+$/);
    }
  });

  it("banner partners take their link from the brand map, not a second copy", () => {
    for (const partner of AFFILIATE_PARTNERS) {
      expect(partner.affiliateUrl).toBe(
        HOTEL_BRAND_AFFILIATE_LINKS[partner.id as keyof typeof HOTEL_BRAND_AFFILIATE_LINKS],
      );
    }
  });

  it("every banner partner's creative exists under public/", () => {
    for (const partner of AFFILIATE_PARTNERS) {
      for (const asset of Object.values(partner.assets)) {
        expect(existsSync(`public${asset}`), asset).toBe(true);
      }
    }
  });
});
