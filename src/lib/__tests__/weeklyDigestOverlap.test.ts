import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DIGEST_OVERLAP_DAYS,
  OVERLAP_CHUNK,
  mailedOtherWeeklyDigest,
  type DigestLedgerReader,
} from "../../../supabase/functions/_shared/weeklyDigestOverlap.ts";

/**
 * WEB-ADS-037. send-weekly-digest (Sunday, weekly_digest_log) and
 * weekly-digest-personal (Thursday, nurture_sends) each capped only against
 * their own ledger, so a member got both digests every week. Each now skips
 * users the other one mailed in the last 6 days.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-15T08:00:00Z");
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

type Row = Record<string, unknown>;

/** Evaluates in/eq/gte the way PostgREST would, and records each request. */
function fakeClient(tables: Record<string, Row[]>, opts: { error?: string; ignoreFilters?: boolean } = {}) {
  const requests: Array<{ table: string; ids: string[] }> = [];
  const client: DigestLedgerReader = {
    from(table) {
      return {
        select() {
          const filters: Array<(r: Row) => boolean> = [];
          let ids: string[] = [];
          const q = {
            in(column: string, values: string[]) {
              ids = values;
              filters.push((r) => values.includes(String(r[column])));
              return q;
            },
            eq(column: string, value: string) {
              filters.push((r) => r[column] === value);
              return q;
            },
            gte(column: string, value: string) {
              filters.push((r) => String(r[column]) >= value);
              return q;
            },
            then<T1, T2>(
              resolve: (v: { data: Row[] | null; error: { message: string } | null }) => T1 | PromiseLike<T1>,
              reject?: (e: unknown) => T2 | PromiseLike<T2>,
            ) {
              requests.push({ table, ids });
              const rows = tables[table] ?? [];
              const data = opts.ignoreFilters ? rows : rows.filter((r) => filters.every((f) => f(r)));
              const out = opts.error ? { data: null, error: { message: opts.error } } : { data, error: null };
              return Promise.resolve(out).then(resolve, reject);
            },
          };
          return q;
        },
      };
    },
  };
  return { client, requests };
}

describe("mailedOtherWeeklyDigest", () => {
  it("the personal digest skips a user the Sunday digest mailed this week, and not one it mailed last week", async () => {
    const { client, requests } = fakeClient({
      weekly_digest_log: [
        { user_id: "sunday-this-week", email_status: "sent", sent_at: ago(4) },
        { user_id: "sunday-last-week", email_status: "sent", sent_at: ago(8) },
      ],
    });
    const out = await mailedOtherWeeklyDigest(
      client,
      "weekly-digest-personal",
      ["sunday-this-week", "sunday-last-week", "never"],
      NOW,
    );
    expect([...out]).toEqual(["sunday-this-week"]);
    expect(requests.map((r) => r.table)).toEqual(["weekly_digest_log"]);
  });

  it("a failed Sunday send does not stop the personal digest", async () => {
    const { client } = fakeClient({
      weekly_digest_log: [{ user_id: "u1", email_status: "failed", sent_at: ago(1) }],
    });
    expect((await mailedOtherWeeklyDigest(client, "weekly-digest-personal", ["u1"], NOW)).size).toBe(0);
  });

  it("the Sunday digest skips a user the personal digest mailed, but not a skipped or failed attempt", async () => {
    const { client, requests } = fakeClient({
      nurture_sends: [
        { user_id: "thursday", kind: "weekly_digest", status: "queued", created_at: ago(3) },
        { user_id: "delivered", kind: "weekly_digest", status: "delivered", created_at: ago(5) },
        { user_id: "skipped", kind: "weekly_digest", status: "skipped", created_at: ago(3) },
        { user_id: "failed", kind: "weekly_digest", status: "failed", created_at: ago(3) },
        { user_id: "old", kind: "weekly_digest", status: "queued", created_at: ago(DIGEST_OVERLAP_DAYS + 1) },
        { user_id: "other-kind", kind: "onboarding_day3", status: "queued", created_at: ago(1) },
      ],
    });
    const out = await mailedOtherWeeklyDigest(
      client,
      "send-weekly-digest",
      ["thursday", "delivered", "skipped", "failed", "old", "other-kind"],
      NOW,
    );
    expect([...out].sort()).toEqual(["delivered", "thursday"]);
    expect(requests.map((r) => r.table)).toEqual(["nurture_sends"]);
  });

  it("re-checks status and window itself, so an over-wide answer cannot suppress the wrong user", async () => {
    const { client } = fakeClient(
      {
        weekly_digest_log: [
          { user_id: "failed", email_status: "failed", sent_at: ago(1) },
          { user_id: "old", email_status: "sent", sent_at: ago(10) },
        ],
      },
      { ignoreFilters: true },
    );
    expect((await mailedOtherWeeklyDigest(client, "weekly-digest-personal", ["failed", "old"], NOW)).size).toBe(0);
  });

  it("throws on a failed read instead of reading it as nobody", async () => {
    const { client } = fakeClient({}, { error: "permission denied" });
    await expect(mailedOtherWeeklyDigest(client, "send-weekly-digest", ["u1"], NOW)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("asks in chunks and deduplicates ids", async () => {
    const ids = Array.from({ length: OVERLAP_CHUNK + 5 }, (_, i) => `u${i}`);
    const { client, requests } = fakeClient({});
    await mailedOtherWeeklyDigest(client, "send-weekly-digest", [...ids, "u0"], NOW);
    expect(requests.map((r) => r.ids.length)).toEqual([OVERLAP_CHUNK, 5]);
  });
});

describe("both senders consult the other's ledger", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it.each([
    ["supabase/functions/_shared/agents/weekly-digest-personal.ts", "weekly-digest-personal"],
    ["supabase/functions/agent-weekly-digest/index.ts", "weekly-digest-personal"],
    ["supabase/functions/send-weekly-digest/index.ts", "send-weekly-digest"],
  ])("%s asks as %s", (file, sender) => {
    const src = read(file);
    expect(src).toMatch(new RegExp(`mailedOtherWeeklyDigest\\(\\s*supabase,\\s*"${sender}"`));
    if (sender === "weekly-digest-personal") {
      expect(src).toMatch(/if \(otherDigest\.has\(p\.user_id\)\) \{ skippedOtherDigest\+\+; continue; \}/);
    }
  });

  it("send-weekly-digest sends only the filtered list", () => {
    const src = read("supabase/functions/send-weekly-digest/index.ts");
    expect(src).toMatch(/sendDigestsInBatches\(\s*toSend,/);
  });
});
