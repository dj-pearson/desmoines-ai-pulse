import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DeliveryRecordError,
  dispatchNewsletter,
  loadAllPages,
  toAttempted,
  type DeliveryRow,
  type NewsletterRecipient,
} from "../../../supabase/functions/_shared/newsletterDispatch.ts";

/**
 * The newsletter send loop (send-newsletter-campaign send_now and
 * dispatch-scheduled-newsletters). Both used to insert every delivery row
 * once, after the last send, so a run killed part-way left no record and the
 * reclaim-and-resume path mailed the same readers again.
 */

function list(n: number): NewsletterRecipient[] {
  return Array.from({ length: n }, (_, i) => ({
    email: `reader${String(i).padStart(4, "0")}@example.com`,
    unsubscribe_token: `t${i}`,
  }));
}

/** A fake newsletter_deliveries table plus a mailbox, with a kill switch. */
function harness(opts: { killAfterSends?: number; failInsertOn?: number } = {}) {
  const table: DeliveryRow[] = [];
  const mailbox: string[] = [];
  let inserts = 0;
  return {
    table,
    mailbox,
    send: async (r: NewsletterRecipient) => {
      if (opts.killAfterSends !== undefined && mailbox.length >= opts.killAfterSends) {
        // An edge function hitting its wall-clock limit: nothing after this runs.
        throw new KilledError();
      }
      mailbox.push(r.email);
      return { message_id: `m-${r.email}` };
    },
    recordDeliveries: async (rows: DeliveryRow[]) => {
      inserts++;
      if (opts.failInsertOn === inserts) return { error: "permission denied for table newsletter_deliveries" };
      table.push(...rows);
      return { error: null };
    },
  };
}

class KilledError extends Error {}

/**
 * Simulates the process dying: the first KilledError aborts the whole run,
 * like the isolate being torn down, rather than settling as one failed send.
 */
async function runUntilKilled(run: () => Promise<unknown>) {
  const original = Promise.allSettled.bind(Promise);
  Promise.allSettled = (async (ps: Iterable<Promise<unknown>>) => {
    const out = await original(ps);
    if (out.some((s) => s.status === "rejected" && s.reason instanceof KilledError)) throw new KilledError();
    return out;
  }) as typeof Promise.allSettled;
  try {
    await run();
  } catch (e) {
    if (!(e instanceof KilledError)) throw e;
  } finally {
    Promise.allSettled = original;
  }
}

describe("dispatchNewsletter", () => {
  it("a run killed part-way leaves a delivery row for every reader it mailed", async () => {
    const h = harness({ killAfterSends: 12 });
    await runUntilKilled(() =>
      dispatchNewsletter({ campaignId: "c1", recipients: list(40), attempted: new Map(), batchSize: 5, ...h }),
    );
    expect(h.mailbox).toHaveLength(12);
    // Two whole batches were recorded before the batch the kill landed in.
    expect(h.table.map((r) => r.email)).toEqual(h.mailbox.slice(0, 10));
  });

  it("resuming after the kill mails each reader once in total", async () => {
    const recipients = list(40);
    const first = harness({ killAfterSends: 12 });
    await runUntilKilled(() =>
      dispatchNewsletter({ campaignId: "c1", recipients, attempted: new Map(), batchSize: 5, ...first }),
    );

    // The dispatcher's resume reads the rows the first run left behind.
    const second = harness();
    const result = await dispatchNewsletter({
      campaignId: "c1",
      recipients,
      attempted: toAttempted(first.table),
      batchSize: 5,
      ...second,
    });

    const everyone = [...first.mailbox, ...second.mailbox];
    const copies = new Map<string, number>();
    for (const e of everyone) copies.set(e, (copies.get(e) ?? 0) + 1);
    // At most the one batch in flight at the kill can repeat (2 here: the
    // 11th and 12th sends were made but their batch was never recorded).
    expect([...copies.values()].filter((n) => n > 1)).toHaveLength(2);
    expect(copies.size).toBe(40);
    expect(result.skipped).toBe(10);
    expect(result.delivered).toBe(40);
  });

  it("counts earlier runs' successes and failures in the totals", async () => {
    const recipients = list(6);
    const attempted = toAttempted([
      { email: recipients[0].email.toUpperCase(), error_message: null },
      { email: recipients[1].email, error_message: "Throttling" },
    ]);
    const h = harness();
    const result = await dispatchNewsletter({ campaignId: "c1", recipients, attempted, ...h });
    expect(h.mailbox).toEqual(recipients.slice(2).map((r) => r.email));
    expect(result).toMatchObject({ delivered: 5, failed: 1, skipped: 2 });
  });

  it("stops sending when a batch cannot be recorded", async () => {
    const h = harness({ failInsertOn: 2 });
    const err = await dispatchNewsletter({
      campaignId: "c1",
      recipients: list(30),
      attempted: new Map(),
      batchSize: 5,
      ...h,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DeliveryRecordError);
    expect((err as DeliveryRecordError).delivered).toBe(10);
    // Batch 2 went out unrecorded; nothing after it was sent.
    expect(h.mailbox).toHaveLength(10);
  });

  it("records a failed send with its reason and keeps going", async () => {
    const h = harness();
    const recipients = list(3);
    const result = await dispatchNewsletter({
      campaignId: "c1",
      recipients,
      attempted: new Map(),
      ...h,
      send: async (r) => {
        if (r.email === recipients[1].email) throw new Error("MessageRejected");
        return h.send(r);
      },
    });
    expect(result).toMatchObject({ delivered: 2, failed: 1, errors: ["MessageRejected"] });
    expect(h.table[1]).toMatchObject({ resend_message_id: null, status: "bounced", error_message: "MessageRejected" });
  });
});

describe("loadAllPages", () => {
  it("reads past PostgREST's 1000-row cap", async () => {
    const all = list(2345);
    const rows = await loadAllPages(async (from, to) => ({ data: all.slice(from, to + 1), error: null }));
    expect(rows).toHaveLength(2345);
  });

  it("throws on a page error instead of returning a short list", async () => {
    const all = list(1500);
    await expect(
      loadAllPages(async (from, to) =>
        from === 0 ? { data: all.slice(from, to + 1), error: null } : { data: null, error: { message: "timeout" } },
      ),
    ).rejects.toThrow("timeout");
  });
});

describe("both senders use the shared loop", () => {
  const strip = (path: string) =>
    readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  for (const fn of ["send-newsletter-campaign", "dispatch-scheduled-newsletters"]) {
    it(`${fn} sends through dispatchNewsletter and reads recipients in pages`, () => {
      const src = strip(`supabase/functions/${fn}/index.ts`);
      expect(src).toMatch(/dispatchNewsletter\(/);
      expect(src).toMatch(/loadAllPages</);
      // No second, end-of-run bulk insert of a collected array.
      expect(src).not.toMatch(/deliveryRows/);
    });
  }

  it("send_now is stamped due and claimed, so a killed run is resumable", () => {
    const src = strip("supabase/functions/send-newsletter-campaign/index.ts");
    expect(src).toMatch(/scheduled_for:\s*action === "schedule" \? scheduled_for : nowIso/);
    expect(src).toMatch(/claimed_at:\s*action === "schedule" \? null : nowIso/);
  });
});
