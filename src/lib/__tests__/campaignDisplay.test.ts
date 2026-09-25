import { describe, it, expect } from "vitest";
import {
  CAMPAIGN_STATUS,
  campaignDays,
  campaignStatusLabel,
  creativeStage,
  formatCampaignDate,
  formatUSD,
} from "../campaignDisplay";

/**
 * Business plan WP0 item 1. Run under TZ=America/Chicago as well as UTC: the
 * date bug this guards against only shows west of Greenwich.
 */
describe("formatUSD", () => {
  it("prints cents", () => {
    expect(formatUSD(66.5)).toBe("$66.50");
    expect(formatUSD(1234)).toBe("$1,234.00");
  });

  it("prints a dash for a missing amount, not $0.00", () => {
    expect(formatUSD(null)).toBe("-");
    expect(formatUSD(undefined)).toBe("-");
    expect(formatUSD(Number.NaN)).toBe("-");
  });

  it("prints a real zero", () => {
    expect(formatUSD(0)).toBe("$0.00");
  });
});

describe("campaignDays", () => {
  it("counts inclusively, like the pricing trigger", () => {
    expect(campaignDays("2026-10-01", "2026-10-30")).toBe(30);
    expect(campaignDays("2026-10-01", "2026-10-01")).toBe(1);
  });

  it("crosses the DST change without losing a day", () => {
    expect(campaignDays("2026-10-31", "2026-11-02")).toBe(3);
  });

  it("reads a timestamptz as its date part", () => {
    expect(campaignDays("2026-10-01T00:00:00+00:00", "2026-10-03T00:00:00+00:00")).toBe(3);
  });

  it("is null for missing, unreadable or backwards dates", () => {
    expect(campaignDays(null, "2026-10-30")).toBeNull();
    expect(campaignDays("2026-10-01", null)).toBeNull();
    expect(campaignDays("soon", "2026-10-30")).toBeNull();
    expect(campaignDays("2026-10-30", "2026-10-01")).toBeNull();
  });
});

describe("formatCampaignDate", () => {
  it("names the calendar day in the string, not the UTC instant", () => {
    expect(formatCampaignDate("2026-10-01")).toBe("October 1, 2026");
    expect(formatCampaignDate("2026-10-01T00:00:00+00:00")).toBe("October 1, 2026");
  });

  it("takes a pattern", () => {
    expect(formatCampaignDate("2026-10-01", "MMM d")).toBe("Oct 1");
  });

  it("prints a dash for an unreadable value", () => {
    expect(formatCampaignDate("")).toBe("-");
    expect(formatCampaignDate("next week")).toBe("-");
  });
});

describe("CAMPAIGN_STATUS", () => {
  it("covers every campaigns.status value", () => {
    for (const s of [
      "draft",
      "pending_payment",
      "pending_creative",
      "pending_review",
      "active",
      "paused",
      "completed",
      "cancelled",
      "rejected",
    ]) {
      expect(CAMPAIGN_STATUS[s], s).toBeDefined();
    }
  });

  it("treats an unpaid campaign as a step, not an error", () => {
    expect(CAMPAIGN_STATUS.pending_payment.tone).toBe("neutral");
  });

  it("says pending_review is approved, with the start date", () => {
    expect(campaignStatusLabel("pending_review", "2026-10-01")).toBe("Approved, starts October 1, 2026");
    expect(campaignStatusLabel("pending_review", null)).toMatch(/^Approved/);
  });

  it("falls back to readable text for an unknown status", () => {
    expect(campaignStatusLabel("some_new_state")).toBe("some new state");
  });
});

describe("creativeStage", () => {
  const approved = { is_approved: true, rejection_reason: null };
  const waiting = { is_approved: null, rejection_reason: null };
  const sentBack = { is_approved: false, rejection_reason: "Text too small" };

  it("is none with no creatives", () => {
    expect(creativeStage([])).toBe("none");
  });

  it("is approved only when every creative is", () => {
    expect(creativeStage([approved, approved])).toBe("approved");
    expect(creativeStage([approved, waiting])).toBe("in_review");
  });

  it("puts a sent-back creative ahead of everything else", () => {
    expect(creativeStage([approved, waiting, sentBack])).toBe("changes_needed");
  });

  it("does not call a rejected flag with no reason a change request", () => {
    expect(creativeStage([{ is_approved: false, rejection_reason: null }])).toBe("in_review");
  });
});
