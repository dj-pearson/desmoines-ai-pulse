/**
 * WEB-LEGAL-014. Every first-party writer to user_analytics records a session
 * id, the page and often the user; none of it may happen for a visitor who has
 * not granted the analytics category.
 *
 * Two halves. The behaviour tests drive the three lib writers that had no gate
 * (affiliate/house ad fill, sponsored listings, the guest-favorites funnel) and
 * check both directions, so a mock that never inserts cannot pass the negative
 * case on its own. The source scan names any file in src/ that inserts into
 * user_analytics without a consent check, which is what lets the next writer be
 * caught rather than found in an audit.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
let granted = false;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ insert: (row: unknown) => insert(row) }),
  },
}));

vi.mock("@/lib/analyticsConsent", () => ({
  analyticsGranted: () => granted,
}));

import { logAdClick, logAdImpression } from "@/lib/adAnalytics";
import { logSponsoredClick, logSponsoredImpression } from "@/lib/sponsored";
import { logFavoriteFunnelEvent } from "@/lib/favoriteAnalytics";

const ROW_ID = "0b6f8f3e-2a51-4c3e-9d8e-6f1c2b3a4d5e";
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
  granted = false;
  localStorage.clear();
  sessionStorage.clear();
});

// Each case uses its own placement or content id, because the impression
// writers dedupe per module lifetime and a key seen by one test would hide
// the insert in the next.
const writers: Array<[string, (n: number) => void]> = [
  ["logAdImpression", (n) => logAdImpression("affiliate", `slot_${n}`)],
  ["logAdClick", (n) => logAdClick("house", `slot_${n}`)],
  ["logSponsoredImpression", (n) => logSponsoredImpression("restaurant", `${ROW_ID.slice(0, -1)}${n}`)],
  ["logSponsoredClick", () => logSponsoredClick("event", ROW_ID)],
  ["logFavoriteFunnelEvent", () => logFavoriteFunnelEvent("guest_save", "event", ROW_ID, null)],
];

describe.each(writers.map(([name, write], i) => [name, write, i] as const))("%s", (_name, write, i) => {
  it("writes nothing, and stores no session id, without analytics consent", async () => {
    write(i * 2);
    await flush();
    expect(insert).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("writes one row with a session id once consent is granted", async () => {
    granted = true;
    write(i * 2 + 1);
    await flush();
    expect(insert).toHaveBeenCalledTimes(1);
    expect(typeof insert.mock.calls[0][0].session_id).toBe("string");
  });
});

describe("user_analytics writers in src/", () => {
  const SRC = path.resolve(__dirname, "../..");

  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") sourceFiles(full, out);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  // Comments are stripped first: several writers explain the table at length
  // between .from() and .insert(), and a gate named only in a comment is not a
  // gate.
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  const WRITES = /\.from\(\s*["'`]user_analytics["'`]\s*\)\s*\.(insert|upsert)\(/;
  const GATE = /\banalyticsGranted\(|\bhasConsent\(\s*["'`]analytics["'`]\s*\)/;

  function ungatedWriters(): string[] {
    return sourceFiles(SRC)
      .filter((file) => {
        const code = stripComments(readFileSync(file, "utf8"));
        return WRITES.test(code) && !GATE.test(code);
      })
      .map((file) => path.relative(SRC, file));
  }

  it("finds the writers at all (an empty scan is not a pass)", () => {
    const writersFound = sourceFiles(SRC).filter((file) =>
      WRITES.test(stripComments(readFileSync(file, "utf8")))
    );
    expect(writersFound.length).toBeGreaterThanOrEqual(10);
  });

  it("every file that inserts into user_analytics checks analytics consent", () => {
    expect(ungatedWriters()).toEqual([]);
  });

  it("does not accept a gate that exists only in a comment", () => {
    const code = stripComments(
      "// if (!analyticsGranted()) return;\nsupabase.from('user_analytics').insert({});"
    );
    expect(WRITES.test(code)).toBe(true);
    expect(GATE.test(code)).toBe(false);
  });
});
