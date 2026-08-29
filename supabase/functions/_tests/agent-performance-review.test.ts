/**
 * The weekly review must not turn an unwritten column into a finding
 * (AOS-MANAGE-007 AC3: sourced only from real ledger data).
 *
 * automation_job_runs carries items_escalated, tokens_used and cost_usd, and on
 * the 277 rows present when this was written all three are ZERO on every row.
 * That is indistinguishable from a column nothing writes, so "0 escalations" and
 * "$0.00 spent" would be findings invented out of an absence - the same defect
 * WEB-BE-032 fixed in agent-ops-digest and AOS-MANAGE-001 had to design around.
 *
 * The helpers are exported from index.ts, which calls Deno.serve at import time,
 * so these import it knowing a server starts; the assertions are pure.
 */
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { reviewLines, sourced, summarise } from "../agent-performance-review/index.ts";

const run = (over: Record<string, unknown> = {}) => ({
  job_name: "moderate-content",
  status: "success",
  items_processed: 0,
  items_failed: 0,
  items_escalated: 0,
  tokens_used: 0,
  cost_usd: 0,
  attempts: 1,
  error: null,
  started_at: "2026-08-29T10:00:00Z",
  finished_at: "2026-08-29T10:00:02Z",
  ...over,
});

Deno.test("summarise groups by job and counts successes", () => {
  const stats = summarise([
    run(),
    run({ status: "failed" }),
    run({ job_name: "backfill-images", items_processed: 4, items_failed: 1 }),
  ]);
  const moderate = stats.find((s) => s.job === "moderate-content")!;
  assertEquals(moderate.runs, 2);
  assertEquals(moderate.succeeded, 1);
  const backfill = stats.find((s) => s.job === "backfill-images")!;
  assertEquals(backfill.processed, 4);
  assertEquals(backfill.failed, 1);
  assertEquals(backfill.avgSeconds, 2);
});

Deno.test("an all-zero column is reported as UNSOURCED, not as a zero", () => {
  const lines = reviewLines([run(), run(), run()], 7);
  const body = lines.join("\n");
  assertStringIncludes(body, "UNAVAILABLE");
  assertStringIncludes(body, "items_escalated");
  assertStringIncludes(body, "tokens_used");
  assertStringIncludes(body, "cost_usd");
  assert(
    !/0 escalations|\$0\.00/.test(body),
    "an unwritten column must never be rendered as a zero finding",
  );
});

Deno.test("NEGATIVE CONTROL - a column with real data is not called unsourced", () => {
  // Without this the check above would pass for code that always says
  // UNAVAILABLE, which would be just as useless in the other direction.
  assertEquals(sourced([run(), run({ tokens_used: 1200 })], "tokens_used"), true);
  assertEquals(sourced([run(), run()], "tokens_used"), false);
  const lines = reviewLines([run({ items_escalated: 3, tokens_used: 10, cost_usd: 0.4 })], 7).join("\n");
  assertStringIncludes(lines, "every ledger column carries data");
});

Deno.test("a job that never succeeded is named, with its error", () => {
  const lines = reviewLines(
    [
      run({ job_name: "validate-source-urls", status: "failed", error: "42P01 relation does not exist" }),
      run({ job_name: "validate-source-urls", status: "failed" }),
      run(),
    ],
    7,
  ).join("\n");
  assertStringIncludes(lines, "validate-source-urls: 0 of 2 runs succeeded");
  assertStringIncludes(lines, "42P01");
  // A job that did succeed must not be listed as broken.
  assert(!/moderate-content: 0 of/.test(lines));
});

Deno.test("an empty window says so rather than reporting a clean sheet", () => {
  const lines = reviewLines([], 7).join("\n");
  assertStringIncludes(lines, "UNAVAILABLE");
  assert(
    !/none[\s\S]*every ledger column carries data/.test(lines),
    "no runs must not read as a healthy week",
  );
});
