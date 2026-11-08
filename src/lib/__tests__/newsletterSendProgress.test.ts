import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SEND_NOW_INLINE_LIMIT,
  sendNowMode,
} from "../../../supabase/functions/_shared/newsletterDispatch.ts";
import { deliveredLabel, isInFlight, sendNowToast } from "../newsletterSendProgress";

/**
 * WEB-ADS-026: a large send_now is queued for dispatch-scheduled-newsletters
 * instead of looping inside the admin's request until the edge function is
 * killed. These pin the threshold, the edge function's queued branch, and what
 * the admin table shows while the dispatcher works.
 */

const NOW = new Date("2026-11-08T12:00:00Z");

describe("sendNowMode", () => {
  it("sends inline up to the limit and queues above it", () => {
    expect(sendNowMode(0)).toBe("inline");
    expect(sendNowMode(SEND_NOW_INLINE_LIMIT)).toBe("inline");
    expect(sendNowMode(SEND_NOW_INLINE_LIMIT + 1)).toBe("queue");
    expect(sendNowMode(5000)).toBe("queue");
  });
});

describe("send-newsletter-campaign queued branch", () => {
  const src = readFileSync("supabase/functions/send-newsletter-campaign/index.ts", "utf8");
  const queuedAt = src.indexOf("if (queued) {");
  const dispatchAt = src.indexOf("await dispatchNewsletter(");

  it("decides with sendNowMode on the resolved recipient count", () => {
    expect(src).toMatch(/action === "send_now" && sendNowMode\(recipients\.length\) === "queue"/);
  });

  it("writes a queued send as scheduled, unclaimed, due now", () => {
    expect(src).toMatch(/action === "schedule" \|\| queued \? "scheduled" : "sending"/);
    expect(src).toMatch(/claimed_at: action === "schedule" \|\| queued \? null : nowIso/);
    // claim_scheduled_newsletter_campaigns only takes rows with a scheduled_for.
    expect(src).toMatch(/scheduled_for: action === "schedule" \? scheduled_for : nowIso/);
  });

  it("returns before the inline send loop, keeping the old response keys", () => {
    expect(queuedAt).toBeGreaterThan(0);
    expect(dispatchAt).toBeGreaterThan(queuedAt);
    const branch = src.slice(queuedAt, dispatchAt);
    expect(branch).toMatch(/return new Response/);
    for (const key of ["queued: true", "delivered: 0", "failed: 0", "recipient_count: recipients.length"]) {
      expect(branch).toContain(key);
    }
    expect(branch).toMatch(/status: 200/);
  });
});

describe("sendNowToast", () => {
  it("does not report a queued send as zero delivered", () => {
    const msg = sendNowToast({ ok: true, queued: true, delivered: 0, failed: 0, recipient_count: 1200 });
    expect(msg).not.toMatch(/Delivered 0/);
    expect(msg).toMatch(/Queued/);
    expect(msg).toContain((1200).toLocaleString());
  });

  it("keeps the inline wording", () => {
    expect(sendNowToast({ ok: true, delivered: 40, failed: 2, recipient_count: 42 })).toBe(
      "Delivered 40 of 42; 2 failed",
    );
  });
});

describe("isInFlight", () => {
  it("counts sending and due scheduled rows only", () => {
    expect(isInFlight({ status: "sending", scheduled_for: null }, NOW)).toBe(true);
    expect(isInFlight({ status: "scheduled", scheduled_for: "2026-11-08T11:59:00Z" }, NOW)).toBe(true);
    expect(isInFlight({ status: "scheduled", scheduled_for: "2026-11-15T09:00:00Z" }, NOW)).toBe(false);
    expect(isInFlight({ status: "scheduled", scheduled_for: null }, NOW)).toBe(false);
    expect(isInFlight({ status: "sent", scheduled_for: "2026-11-08T11:00:00Z" }, NOW)).toBe(false);
    expect(isInFlight({ status: "failed", scheduled_for: null }, NOW)).toBe(false);
  });
});

describe("deliveredLabel", () => {
  it("shows the recorded-so-far count while a send is in flight", () => {
    expect(deliveredLabel({ status: "sending", scheduled_for: null, delivered: 0 }, 315, NOW)).toBe(
      `${(315).toLocaleString()} so far`,
    );
  });

  it("falls back to the stored count when progress was not read", () => {
    expect(deliveredLabel({ status: "sending", scheduled_for: null, delivered: 0 }, undefined, NOW)).toBe("0");
  });

  it("shows the stored count once the campaign is finished", () => {
    expect(deliveredLabel({ status: "sent", scheduled_for: null, delivered: 980 }, 975, NOW)).toBe(
      (980).toLocaleString(),
    );
  });
});
