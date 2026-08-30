/**
 * The executive digest must not invent a number (AOS-MANAGE-001 AC3).
 *
 * AC3 is "every number is sourced from real tables (no fabrication)", and this
 * digest reports on two families whose tables do not exist - payments and
 * agent_escalations (WEB-QA-018). The failure mode being guarded is the one
 * WEB-BE-032 already found in agent-ops-digest: `count ?? 0` made "the read
 * failed" and "nothing happened" print the same line, so a blind digest looked
 * like a healthy one.
 *
 * The helpers live in _shared/digestFormat.ts rather than in the function,
 * because index.ts calls Deno.serve at import time and importing it from a
 * test starts a server - the same reason that file exists at all.
 *
 * Three states have to stay distinguishable, which is what these assert:
 *   a real count      -> the number
 *   a failed read     -> UNAVAILABLE, naming the source
 *   an absent table   -> UNAVAILABLE, saying "not sourced, not zero"
 */
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { renderMetric, renderDelta, type Metric } from "../_shared/digestFormat.ts";

const base: Metric = { label: "New events", value: 12, source: "events.created_at" };

Deno.test("a real count renders as the number, with its source", () => {
  const line = renderMetric(base, "https://example.com");
  assertStringIncludes(line, "New events: 12");
  assertStringIncludes(line, "[events.created_at]");
});

Deno.test("a failed read is never rendered as a number", () => {
  const line = renderMetric({ ...base, value: null }, "https://example.com");
  assertStringIncludes(line.toLowerCase(), "unavailable");
  assert(!/New events: \d/.test(line), "a null count must not print as a digit");
  assertStringIncludes(line, "events.created_at");
});

Deno.test("an absent table says so, and says it is not a zero", () => {
  const line = renderMetric(
    { label: "Payments recorded", value: null, source: "payments.created_at", absent: "payments does not exist" },
    "https://example.com",
  );
  assertStringIncludes(line, "payments does not exist");
  assertStringIncludes(line, "not sourced, not zero");
  assert(!/Payments recorded: 0/.test(line), "an absent table must never render as 0");
});

Deno.test("NEGATIVE CONTROL - a genuine zero still prints as 0", () => {
  // user_subscriptions EXISTS with no rows. Reporting that as unavailable would
  // be the opposite error, and would make the guard above worthless.
  const line = renderMetric(
    { label: "Subscriptions", value: 0, source: "user_subscriptions" },
    "https://example.com",
  );
  assertStringIncludes(line, "Subscriptions: 0");
  assert(!/unavailable/i.test(line), "an empty table is not an unreadable one");
});

Deno.test("a delta needs both windows, or it reports that it could not compare", () => {
  assertEquals(renderDelta("d", 10, 4), "d: +6");
  assertEquals(renderDelta("d", 4, 10), "d: -6");
  for (const [now, prev] of [[null, 4], [4, null], [null, null]] as Array<[number | null, number | null]>) {
    const line = renderDelta("d", now, prev);
    assertStringIncludes(line.toLowerCase(), "unavailable");
    assert(!/[+-]\d/.test(line), "an uncomparable delta must not print a signed number");
  }
});

Deno.test("admin links are only added when a path is given", () => {
  assertStringIncludes(renderMetric({ ...base, adminPath: "/admin/content" }, "https://x.test"), "https://x.test/admin/content");
  assert(!renderMetric(base, "https://x.test").includes("https://x.test"));
});
