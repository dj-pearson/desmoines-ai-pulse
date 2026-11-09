import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

let granted = false;
vi.mock("@/lib/analyticsConsent", () => ({
  analyticsGranted: (consent?: { analytics?: boolean } | null) =>
    consent === undefined ? granted : !!consent?.analytics,
}));

import { useCampaignAttributionCapture } from "@/hooks/useCampaignAttributionCapture";
import {
  CAMPAIGN_ATTRIBUTION_STORAGE_KEY,
  readStoredCampaignAttribution,
  resetSessionAttributionForTests,
  resolveCampaignAttribution,
} from "@/lib/campaignAttribution";
import { storage } from "@/lib/safeStorage";

function at(url: string) {
  return ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
}

const LANDING = "/events?utm_source=facebook&utm_campaign=fall-guide";

describe("useCampaignAttributionCapture (WEB-ADS-016)", () => {
  beforeEach(() => {
    storage.remove(CAMPAIGN_ATTRIBUTION_STORAGE_KEY);
    resetSessionAttributionForTests();
    granted = false;
  });

  it("remembers the landing campaign in memory only, without analytics consent", () => {
    renderHook(() => useCampaignAttributionCapture(), { wrapper: at(LANDING) });
    expect(resolveCampaignAttribution("")).toMatchObject({ utm_source: "facebook", utm_campaign: "fall-guide" });
    expect(storage.get(CAMPAIGN_ATTRIBUTION_STORAGE_KEY)).toBeNull();
  });

  it("persists it with analytics consent", () => {
    granted = true;
    renderHook(() => useCampaignAttributionCapture(), { wrapper: at(LANDING) });
    expect(readStoredCampaignAttribution()).toMatchObject({ utm_source: "facebook" });
  });

  it("persists the landing campaign when the banner is accepted on that page, and removes it on withdrawal", () => {
    renderHook(() => useCampaignAttributionCapture(), { wrapper: at(LANDING) });
    expect(storage.get(CAMPAIGN_ATTRIBUTION_STORAGE_KEY)).toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent("cookie-consent-changed", { detail: { analytics: true } }));
    });
    expect(readStoredCampaignAttribution()).toMatchObject({ utm_campaign: "fall-guide" });

    act(() => {
      window.dispatchEvent(new CustomEvent("cookie-consent-changed", { detail: { analytics: false } }));
    });
    expect(storage.get(CAMPAIGN_ATTRIBUTION_STORAGE_KEY)).toBeNull();
  });
});
