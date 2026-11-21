import { describe, expect, it } from "vitest";
import {
  PREFERENCES_CHUNK,
  weeklyDigestOptedOut,
  type PreferencesReader,
} from "../../../supabase/functions/_shared/weeklyDigestOptOut.ts";

/**
 * WEB-ADS-036. The personal weekly digest ignored the account
 * page's "Weekly event digest" switch. The agent-level pair (switch off: no
 * send; switch on or no row: reaches the gate) is in
 * supabase/functions/_tests/marketing-optout-agents.test.ts; this covers what
 * that file's mock cannot: a failed read, chunking, and a null value.
 */

type PrefRow = { user_id: string; weekly_digest_enabled: boolean | null };

function fakeReader(rows: PrefRow[], opts: { error?: string } = {}) {
  const calls: string[][] = [];
  const reader: PreferencesReader = {
    from: () => ({
      select: () => ({
        in: async (_column: string, values: string[]) => {
          calls.push(values);
          if (opts.error) return { data: null, error: { message: opts.error } };
          return { data: rows.filter((r) => values.includes(r.user_id)), error: null };
        },
      }),
    }),
  };
  return { reader, calls };
}

describe("weeklyDigestOptedOut", () => {
  it("returns only users whose row does not say true", async () => {
    const { reader } = fakeReader([
      { user_id: "off", weekly_digest_enabled: false },
      { user_id: "on", weekly_digest_enabled: true },
      { user_id: "null", weekly_digest_enabled: null },
    ]);
    const out = await weeklyDigestOptedOut(reader, ["off", "on", "null", "no-row"]);
    expect([...out].sort()).toEqual(["null", "off"]);
  });

  it("throws on a failed read instead of reading it as nobody opted out", async () => {
    const { reader } = fakeReader([{ user_id: "off", weekly_digest_enabled: false }], { error: "permission denied" });
    await expect(weeklyDigestOptedOut(reader, ["off"])).rejects.toThrow(/permission denied/);
  });

  it("reads in chunks and finds an opt-out past the first chunk", async () => {
    const ids = Array.from({ length: PREFERENCES_CHUNK * 2 + 5 }, (_, i) => `u${i}`);
    const last = ids[ids.length - 1];
    const { reader, calls } = fakeReader([{ user_id: last, weekly_digest_enabled: false }]);
    const out = await weeklyDigestOptedOut(reader, [...ids, ids[0]]);
    expect(calls.map((c) => c.length)).toEqual([PREFERENCES_CHUNK, PREFERENCES_CHUNK, 5]);
    expect(out.has(last)).toBe(true);
  });

  it("makes no request for an empty batch", async () => {
    const { reader, calls } = fakeReader([]);
    expect((await weeklyDigestOptedOut(reader, [])).size).toBe(0);
    expect(calls).toEqual([]);
  });
});
