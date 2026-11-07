import { strict as assert } from "node:assert";
import { buildWeeklyReport, weekChange, weekLabel, type WeeklyReportRow } from "../_shared/businessProReport.ts";

/**
 * Business Pro weekly email (growth roadmap #3, part 3). What this suite
 * guards: the email repeats the numbers it was given and never invents a
 * percentage, the owner's listing name cannot inject markup, and the function
 * claims a send slot before it mails, so a rerun cannot mail twice.
 */

const ROW: WeeklyReportRow = {
  user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: "owner@example.test",
  listing_type: "restaurant",
  listing_id: "11111111-1111-4111-8111-111111111111",
  listing_name: "Taco Spot",
  week_start: "2026-10-26",
  week_end: "2026-11-01",
  views: 1500,
  shares: 0,
  clicks: 2,
  prev_views: 1000,
  prev_shares: 0,
  prev_clicks: 0,
};

Deno.test("week-on-week change never divides by zero", () => {
  assert.equal(weekChange(15, 10), "up 50% on the week before");
  assert.equal(weekChange(5, 10), "down 50% on the week before");
  assert.equal(weekChange(3, 3), "the same as the week before");
  assert.equal(weekChange(0, 0), "the same as the week before");
  assert.equal(weekChange(2, 0), "none the week before");
  assert.equal(weekChange(1001, 1000), "about the same as the week before");
});

Deno.test("the week reads as calendar days", () => {
  assert.equal(weekLabel("2026-10-26", "2026-11-01"), "Oct 26 to Nov 1");
  assert.equal(weekLabel("2026-12-28", "2027-01-03"), "Dec 28 to Jan 3");
});

Deno.test("the email carries the row's numbers and links the dashboard", () => {
  const r = buildWeeklyReport(ROW, "https://example.test/");
  assert.equal(r.subject, "Taco Spot: 1,500 page views last week");
  assert.match(r.bodyText, /Page views: 1,500, up 50% on the week before/);
  assert.match(r.bodyText, /Contact and website clicks: 2, none the week before/);
  assert.match(r.bodyText, /Shares: 0, the same as the week before/);
  assert.match(r.bodyText, /https:\/\/example\.test\/business/);
  assert.match(r.bodyHtml, /href="https:\/\/example\.test\/business"/);
  assert.match(r.bodyText, /Oct 26 to Nov 1/);
});

Deno.test("a listing name cannot inject markup", () => {
  const r = buildWeeklyReport({ ...ROW, listing_name: '<img src=x onerror="a()">' }, "https://example.test");
  assert.doesNotMatch(r.bodyHtml, /<img/);
  assert.match(r.bodyHtml, /&lt;img/);
});

Deno.test("a missing name falls back to words, not 'null'", () => {
  const r = buildWeeklyReport({ ...ROW, listing_name: null }, "https://example.test");
  assert.match(r.subject, /^your listing:/);
  assert.doesNotMatch(r.bodyText, /null/);
});

// Source contract: order matters, so read the function. Counter-assertions
// check each anchor exists, so a rename cannot make this pass on nothing.
const REPO = new URL("../../../", import.meta.url);

Deno.test("the send slot is claimed before mail goes out, and released on failure", async () => {
  const src = await Deno.readTextFile(new URL("supabase/functions/business-pro-weekly-report/index.ts", REPO));
  const claim = src.indexOf('.from("business_pro_report_sends")');
  const skip = src.indexOf("if (!claimed || claimed.length === 0)");
  const send = src.indexOf("await sendEmail(");
  const release = src.indexOf(".delete()");
  assert.ok(claim > 0 && skip > 0 && send > 0 && release > 0, "all four steps exist");
  assert.ok(claim < skip && skip < send, "a duplicate is skipped before any send");
  assert.ok(send < release, "the slot is released only after a failed send");
  assert.match(src, /ignoreDuplicates: true/);
  assert.match(src, /category: "transactional"/);
});
