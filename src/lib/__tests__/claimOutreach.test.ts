import { describe, it, expect } from "vitest";
import {
  claimPagePath,
  claimPageUrl,
  isClaimableType,
  isListingId,
  listingPath,
  outreachDraft,
  parseClaimTeaser,
  teaserHeadline,
} from "../claimOutreach";

const ID = "3f2b9c1e-8a4d-4f6e-9b2a-1c3d5e7f9a0b";

describe("claim page URLs", () => {
  it("builds the path and the production URL from the same parts", () => {
    expect(claimPagePath("restaurant", ID)).toBe(`/business/claim/restaurant/${ID}`);
    expect(claimPageUrl("restaurant", ID)).toBe(`https://desmoinesinsider.com/business/claim/restaurant/${ID}`);
  });

  it("only accepts the two claimable types and a UUID", () => {
    expect(isClaimableType("restaurant")).toBe(true);
    expect(isClaimableType("venue")).toBe(false);
    expect(isListingId(ID)).toBe(true);
    expect(isListingId("pizza-place")).toBe(false);
  });

  it("links to the listing the way the workspace does", () => {
    expect(listingPath("restaurant", ID, "Taqueria", "taqueria")).toBe("/restaurants/taqueria");
    expect(listingPath("restaurant", ID, "Taqueria", null)).toBe(`/restaurants/${ID}`);
    expect(listingPath("attraction", ID, "Science Center of Iowa")).toBe("/attractions/science-center-of-iowa");
  });
});

describe("parseClaimTeaser", () => {
  it("reads the function's jsonb", () => {
    expect(parseClaimTeaser({ name: "Popular", claimed: false, closed: false, views_30d_floor: 40 })).toEqual({
      name: "Popular",
      claimed: false,
      closed: false,
      viewsFloor: 40,
    });
  });

  it("never invents a figure", () => {
    expect(parseClaimTeaser({ name: "Q", claimed: false, closed: false, views_30d_floor: null })?.viewsFloor).toBeNull();
    expect(parseClaimTeaser({ name: "Q", claimed: false, closed: false, views_30d_floor: 5 })?.viewsFloor).toBeNull();
    expect(parseClaimTeaser(null)).toBeNull();
    expect(parseClaimTeaser({ claimed: false })).toBeNull();
  });
});

describe("wording", () => {
  it("quotes the floored number, or none", () => {
    expect(teaserHeadline({ name: "Popular", claimed: false, closed: false, viewsFloor: 1200 })).toBe(
      "1,200+ people looked at Popular on Des Moines Insider in the last 30 days",
    );
    expect(teaserHeadline({ name: "Quiet", claimed: false, closed: false, viewsFloor: null })).toBe(
      "People find Quiet on Des Moines Insider",
    );
  });

  it("drafts outreach that matches the page's number", () => {
    const d = outreachDraft("Popular", 47, "https://x/claim");
    expect(d.body).toContain("40+ people looked at Popular's page");
    expect(d.body).toContain("Claim it here: https://x/claim");
    expect(outreachDraft("Quiet", 6, "u").body).not.toMatch(/\d+\+ people/);
  });
});
