import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DIGEST_BATCH_SIZE,
  sendDigestsInBatches,
} from "../../../supabase/functions/_shared/weeklyDigestBatches.ts";

/**
 * WEB-ADS-038. send-weekly-digest fired every recipient at once, SES
 * throttled the burst, each throttled send was logged 'failed', and
 * get_weekly_digest_recipients then skipped that user for 6 days. The
 * migration half (a 'failed' row no longer excludes) was exercised on a local
 * Postgres 16; this file covers the send loop and pins both halves in source.
 */

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `u${i}`);
}

function tracker() {
  let inFlight = 0;
  let peak = 0;
  const order: string[] = [];
  const send = async (id: string) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    order.push(id);
    await new Promise((r) => setTimeout(r, 1));
    inFlight--;
  };
  return { send, peak: () => peak, order };
}

describe("sendDigestsInBatches", () => {
  it("never has more than the batch size in flight", async () => {
    const t = tracker();
    const result = await sendDigestsInBatches(ids(23), t.send);
    expect(t.peak()).toBe(DIGEST_BATCH_SIZE);
    expect(DIGEST_BATCH_SIZE).toBe(5);
    expect(t.order).toHaveLength(23);
    expect(result).toEqual({ successes: 23, failures: 0, deferred: 0 });
  });

  it("counts a thrown send as a failure and keeps going", async () => {
    const result = await sendDigestsInBatches(ids(12), async (id) => {
      if (id === "u3" || id === "u7") throw new Error("Throttling: Maximum sending rate exceeded");
    });
    expect(result).toEqual({ successes: 10, failures: 2, deferred: 0 });
  });

  it("stops starting batches once the time budget is spent and reports the rest as deferred", async () => {
    let clock = 0;
    const attempted: string[] = [];
    const timed = await sendDigestsInBatches(
      ids(20),
      async (id) => {
        attempted.push(id);
        clock += 120; // a batch of 5 costs 600ms of fake time
      },
      { batchSize: 5, budgetMs: 1000, now: () => clock },
    );
    // batch 1 at t=0, batch 2 at t=600, batch 3 would start at t=1200
    expect(attempted).toEqual(ids(10));
    expect(timed).toEqual({ successes: 10, failures: 0, deferred: 10 });
  });

  it("always attempts the first batch, even with no budget", async () => {
    const result = await sendDigestsInBatches(ids(8), async () => undefined, {
      budgetMs: 0,
      now: () => 0,
    });
    expect(result).toEqual({ successes: 5, failures: 0, deferred: 3 });
  });

  it("handles an empty list", async () => {
    expect(await sendDigestsInBatches([], async () => undefined)).toEqual({
      successes: 0,
      failures: 0,
      deferred: 0,
    });
  });
});

describe("send-weekly-digest wiring", () => {
  const source = readFileSync("supabase/functions/send-weekly-digest/index.ts", "utf8");

  it("sends through the batch loop, not one allSettled over every recipient", () => {
    expect(source).toContain("sendDigestsInBatches(");
    expect(source).not.toMatch(/Promise\.allSettled\(\s*recipients\.map/);
    expect(source).toMatch(/deferred,/);
  });
});

describe("get_weekly_digest_recipients retry migration", () => {
  const sql = readFileSync(
    "supabase/migrations/20261115000140_weekly_digest_retry_failed_sends.sql",
    "utf8",
  );
  const body = sql.slice(sql.indexOf("NOT EXISTS"), sql.indexOf("END;"));

  it("only a 'sent' row inside the window excludes a user", () => {
    expect(body).toMatch(/wdl\.email_status\s*=\s*'sent'/);
    expect(body).toMatch(/INTERVAL '6 days'/);
  });

  it("keeps the service-role-only grant and the return shape", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_weekly_digest_recipients\(\) FROM anon;/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_weekly_digest_recipients\(\) FROM authenticated;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_weekly_digest_recipients\(\) TO service_role;/);
    expect(sql).toMatch(/home_latitude REAL,\s*home_longitude REAL/);
  });
});
