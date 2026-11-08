import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
let consent = true;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ insert: (row: unknown) => insert(row) }),
    auth: { getSession: async () => ({ data: { session: { user: { id: "user-1" } } }, error: null }) },
  },
}));

vi.mock("@/lib/cookieConsent", () => ({
  hasConsent: () => consent,
}));

import {
  ADVERTISER_FUNNEL_STEPS,
  logAdvertiserFunnelEvent,
  logAdvertiserFunnelEventOnce,
} from "@/lib/advertiserFunnel";
import { toFunnelSteps } from "@/hooks/useConversionFunnel";

const CAMPAIGN = "0b6f8f3e-2a51-4c3e-9d8e-6f1c2b3a4d5e";
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
  consent = true;
  localStorage.clear();
  sessionStorage.clear();
});

describe("logAdvertiserFunnelEvent", () => {
  it("writes nothing, and stores no session id, without analytics consent", async () => {
    consent = false;
    logAdvertiserFunnelEvent("ad_funnel_advertise_viewed");
    logAdvertiserFunnelEventOnce("ad_funnel_payment_confirmed", CAMPAIGN);
    await flush();
    expect(insert).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("records a campaign step against the campaign, with the signed-in user and no amount", async () => {
    logAdvertiserFunnelEvent("ad_funnel_checkout_started", { campaignId: CAMPAIGN, source: "campaign_page" });
    await flush();
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row).toMatchObject({
      event_type: "ad_funnel_checkout_started",
      content_type: "campaign",
      content_id: CAMPAIGN,
      user_id: "user-1",
      filters_used: { source: "campaign_page" },
    });
    expect(typeof row.session_id).toBe("string");
    expect(JSON.stringify(row)).not.toMatch(/total|amount|cost|price/i);
  });

  it("sends a non-uuid campaign id as null rather than a row the uuid column refuses", async () => {
    logAdvertiserFunnelEvent("ad_funnel_campaign_saved", { campaignId: "not-a-uuid", placementCount: 2 });
    await flush();
    expect(insert.mock.calls[0][0]).toMatchObject({ content_id: null, filters_used: { placement_count: 2 } });
  });

  it("never throws into the page when the insert is refused or rejects", async () => {
    insert.mockResolvedValueOnce({ error: { message: "denied" } });
    insert.mockRejectedValueOnce(new Error("network"));
    expect(() => logAdvertiserFunnelEvent("ad_funnel_advertise_viewed")).not.toThrow();
    expect(() => logAdvertiserFunnelEvent("ad_funnel_advertise_viewed")).not.toThrow();
    await flush();
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("counts a landing-page event once per campaign, so a reload is not a second payment", async () => {
    logAdvertiserFunnelEventOnce("ad_funnel_payment_confirmed", CAMPAIGN);
    logAdvertiserFunnelEventOnce("ad_funnel_payment_confirmed", CAMPAIGN);
    logAdvertiserFunnelEventOnce("ad_funnel_checkout_cancelled", CAMPAIGN);
    await flush();
    expect(insert.mock.calls.map((c) => c[0].event_type)).toEqual([
      "ad_funnel_payment_confirmed",
      "ad_funnel_checkout_cancelled",
    ]);
  });
});

describe("toFunnelSteps", () => {
  it("orders the advertiser steps and computes the drop from the step before", () => {
    const counts = {
      ad_funnel_advertise_viewed: 200,
      ad_funnel_campaign_saved: 20,
      ad_funnel_checkout_started: 10,
      ad_funnel_payment_confirmed: 4,
    };
    const steps = toFunnelSteps(ADVERTISER_FUNNEL_STEPS, counts);
    expect(steps.map((s) => s.count)).toEqual([200, 20, 10, 4]);
    expect(steps.map((s) => s.dropOffPercent)).toEqual([0, 90, 50, 60]);
  });

  it("does not report a negative drop when a later step outnumbers the one before", () => {
    // Possible: consent can be granted between steps, or a campaign paid from
    // its page skips /advertise in this window.
    const steps = toFunnelSteps(ADVERTISER_FUNNEL_STEPS, {
      ad_funnel_advertise_viewed: 1,
      ad_funnel_campaign_saved: 3,
    });
    expect(steps[1]).toMatchObject({ dropOff: 0, dropOffPercent: 0 });
  });
});

describe("where the steps are logged", () => {
  const read = (rel: string) =>
    readFileSync(path.resolve(__dirname, "../../..", rel), "utf8").replace(/\/\/.*$/gm, "");

  it("counts a payment only after verify-campaign-payment confirms it", () => {
    const src = read("src/pages/AdvertiseSuccess.tsx");
    expect(src).toMatch(/receipt\.data\?\.state === "paid"/);
    expect(src).toMatch(/confirmedPaid\)\s*logAdvertiserFunnelEventOnce\("ad_funnel_payment_confirmed"/);
  });

  it("logs checkout_started from both places a checkout opens", () => {
    expect(read("src/pages/Advertise.tsx")).toMatch(/"ad_funnel_checkout_started", \{ campaignId, source: "advertise" \}/);
    expect(read("src/components/campaigns/PayCampaignButton.tsx")).toMatch(
      /"ad_funnel_checkout_started", \{ campaignId, source: "campaign_page" \}/,
    );
  });
});
