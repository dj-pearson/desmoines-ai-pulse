import { beforeEach, describe, expect, it } from "vitest";
import {
  applyAttributionConsent,
  attributionFromSearch,
  CAMPAIGN_ATTRIBUTION_STORAGE_KEY,
  CAMPAIGN_ATTRIBUTION_TTL_MS,
  captureCampaignAttribution,
  readStoredCampaignAttribution,
  resetSessionAttributionForTests,
  resolveCampaignAttribution,
} from "@/lib/campaignAttribution";
import { storage } from "@/lib/safeStorage";

/**
 * WEB-ADS-016. A footer signup on the second page used to carry no campaign,
 * because the utm_* params only ever lived on the landing URL.
 */
const LANDING = "?utm_source=facebook&utm_medium=paid&utm_campaign=fall-guide";
const FB = { utm_source: "facebook", utm_medium: "paid", utm_campaign: "fall-guide" };
const NONE = { utm_source: null, utm_medium: null, utm_campaign: null };

beforeEach(() => {
  storage.remove(CAMPAIGN_ATTRIBUTION_STORAGE_KEY);
  resetSessionAttributionForTests();
});

describe("attributionFromSearch", () => {
  it("reads the three utm params", () => {
    expect(attributionFromSearch(LANDING)).toEqual(FB);
  });

  it("is not a touch without a source or a campaign", () => {
    expect(attributionFromSearch("?utm_medium=email")).toBeNull();
    expect(attributionFromSearch("?q=jazz")).toBeNull();
    expect(attributionFromSearch("?utm_source=%20%20")).toBeNull();
  });

  it("trims and caps values at the server's 200 characters", () => {
    const long = "x".repeat(250);
    const found = attributionFromSearch(`?utm_campaign=${long}&utm_source=%20ig%20`);
    expect(found?.utm_campaign).toHaveLength(200);
    expect(found?.utm_source).toBe("ig");
  });
});

describe("resolveCampaignAttribution", () => {
  it("keeps the landing campaign across an SPA navigation without consent", () => {
    captureCampaignAttribution(LANDING, false);
    // Second page: no utm in the URL. This is the case that used to be blank.
    expect(resolveCampaignAttribution("?category=music")).toEqual(FB);
    // ...and nothing was written to the device.
    expect(storage.get(CAMPAIGN_ATTRIBUTION_STORAGE_KEY)).toBeNull();
  });

  it("prefers the current URL's campaign", () => {
    captureCampaignAttribution(LANDING, false);
    expect(resolveCampaignAttribution("?utm_source=newsletter&utm_campaign=wk45")).toEqual({
      utm_source: "newsletter",
      utm_medium: null,
      utm_campaign: "wk45",
    });
  });

  it("falls back to the stored campaign on a later visit when consent allowed storing it", () => {
    captureCampaignAttribution(LANDING, true, 1_000);
    resetSessionAttributionForTests(); // a reload: memory gone, device kept
    expect(resolveCampaignAttribution("", 2_000)).toEqual(FB);
  });

  it("is all nulls when nothing was ever seen", () => {
    expect(resolveCampaignAttribution("")).toEqual(NONE);
  });

  it("lets the latest campaign win", () => {
    captureCampaignAttribution(LANDING, true);
    captureCampaignAttribution("?utm_source=google&utm_campaign=brand", true);
    expect(resolveCampaignAttribution("")).toMatchObject({ utm_source: "google", utm_campaign: "brand" });
  });
});

describe("stored campaign", () => {
  it("expires after 30 days and is removed", () => {
    captureCampaignAttribution(LANDING, true, 0);
    expect(readStoredCampaignAttribution(CAMPAIGN_ATTRIBUTION_TTL_MS - 1)).toEqual(FB);
    expect(readStoredCampaignAttribution(CAMPAIGN_ATTRIBUTION_TTL_MS)).toBeNull();
    expect(storage.get(CAMPAIGN_ATTRIBUTION_STORAGE_KEY)).toBeNull();
  });

  it("drops a malformed record", () => {
    storage.set(CAMPAIGN_ATTRIBUTION_STORAGE_KEY, { utm_source: 42, expiresAt: Date.now() + 1000 });
    expect(readStoredCampaignAttribution()).toBeNull();
    expect(storage.get(CAMPAIGN_ATTRIBUTION_STORAGE_KEY)).toBeNull();
  });
});

describe("consent", () => {
  it("granting consent after landing persists the landing campaign", () => {
    captureCampaignAttribution(LANDING, false);
    applyAttributionConsent(true, 5_000);
    resetSessionAttributionForTests();
    expect(readStoredCampaignAttribution(6_000)).toEqual(FB);
  });

  it("withdrawing consent removes the stored campaign", () => {
    captureCampaignAttribution(LANDING, true);
    applyAttributionConsent(false);
    expect(storage.get(CAMPAIGN_ATTRIBUTION_STORAGE_KEY)).toBeNull();
  });
});
