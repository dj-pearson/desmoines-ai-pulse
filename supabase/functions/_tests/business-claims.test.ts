// Run with:
//   deno test --allow-read supabase/functions/_tests/business-claims.test.ts
//
// WEB-ADS-047: the email a claimant gets after an admin decision, the rule
// that a decision mail must match the claim's state, and the 3-day pending
// alert.

import { strict as assert } from "node:assert";
import {
  buildClaimDecisionEmail,
  decisionMatchesClaim,
  overdueClaims,
  pendingClaimsAlert,
} from "../_shared/businessClaims.ts";

const SITE = "https://desmoinesinsider.com/";

Deno.test("approved mail names the listing and points at the workspace", () => {
  const m = buildClaimDecisionEmail({ decision: "approved", listingName: "Zombie Burger", listingType: "restaurant", siteUrl: SITE });
  assert.equal(m.subject, "Your claim on Zombie Burger is approved");
  assert.match(m.text, /Next step: sign in .* https:\/\/desmoinesinsider\.com\/business\b/);
  assert.match(m.html, /href="https:\/\/desmoinesinsider\.com\/business"/);
});

Deno.test("rejected mail gives a way through, not just a no", () => {
  const m = buildClaimDecisionEmail({ decision: "rejected", listingName: "Zombie Burger", listingType: "restaurant", siteUrl: SITE });
  assert.match(m.subject, /could not verify/);
  assert.match(m.text, /Next step: .*claim again .*website domain/);
  assert.match(m.text, /reply to this email/);
});

Deno.test("revoked mail says edit access is gone and how to dispute it", () => {
  const m = buildClaimDecisionEmail({ decision: "revoked", listingName: "Hoyt Sherman Place", listingType: "venue", siteUrl: SITE });
  assert.equal(m.subject, "You are no longer the verified owner of Hoyt Sherman Place");
  assert.match(m.text, /can no longer edit the listing/);
  assert.match(m.text, /Next step: if you still run Hoyt Sherman Place, reply/);
});

Deno.test("the listing name is escaped in html and kept off the header line", () => {
  const m = buildClaimDecisionEmail({
    decision: "approved",
    listingName: "Fong's <b>Pizza</b>\r\nBcc: x@example.com",
    listingType: "restaurant",
    siteUrl: SITE,
  });
  assert.ok(!/[\r\n]/.test(m.subject), m.subject);
  assert.ok(!m.html.includes("<b>Pizza</b>"));
  assert.match(m.html, /&lt;b&gt;Pizza&lt;\/b&gt;/);
});

Deno.test("an empty listing name falls back to the listing kind", () => {
  const m = buildClaimDecisionEmail({ decision: "approved", listingName: "  ", listingType: "attraction", siteUrl: SITE });
  assert.equal(m.subject, "Your claim on your attraction is approved");
});

Deno.test("a decision mail must match the claim's current state", () => {
  const verified = { status: "verified", revoked_at: null };
  const pending = { status: "pending", revoked_at: null };
  const rejected = { status: "rejected", revoked_at: null };
  const revoked = { status: "rejected", revoked_at: "2026-11-21T00:00:00Z" };
  assert.equal(decisionMatchesClaim("approved", verified), true);
  assert.equal(decisionMatchesClaim("approved", pending), false);
  assert.equal(decisionMatchesClaim("rejected", rejected), true);
  assert.equal(decisionMatchesClaim("rejected", revoked), false);
  assert.equal(decisionMatchesClaim("rejected", pending), false);
  assert.equal(decisionMatchesClaim("revoked", revoked), true);
  assert.equal(decisionMatchesClaim("revoked", rejected), false);
  assert.equal(decisionMatchesClaim("revoked", verified), false);
});

const NOW = new Date("2026-11-21T12:00:00Z");
const row = (id: string, created_at: string) => ({ id, listing_type: "restaurant", listing_id: id, created_at });

Deno.test("a claim pending over 3 days alerts; under 3 days does not", () => {
  const fresh = row("a", "2026-11-19T12:00:00Z"); // 2 days
  const edge = row("b", "2026-11-18T12:00:01Z"); // just under 3 days
  const old = row("c", "2026-11-14T12:00:00Z"); // 7 days
  assert.deepEqual(overdueClaims([fresh, edge], NOW), []);
  assert.equal(pendingClaimsAlert(2, [], NOW, SITE), null);

  const overdue = overdueClaims([fresh, old, edge], NOW);
  assert.deepEqual(overdue.map((r) => r.id), ["c"]);
  const alert = pendingClaimsAlert(3, overdue, NOW, SITE);
  assert.ok(alert);
  assert.match(alert, /^1 business claim has been pending more than 3 days \(3 pending in all; the oldest has waited 7 days\)/);
  assert.match(alert, /restaurant c, waiting 7 days/);
  assert.match(alert, /https:\/\/desmoinesinsider\.com\/admin\/business-claims$/);
});

Deno.test("overdue claims are oldest first and the list is capped", () => {
  const rows = Array.from({ length: 12 }, (_, i) => row(`r${i}`, new Date(NOW.getTime() - (5 + i) * 86400000).toISOString()));
  const overdue = overdueClaims(rows, NOW);
  assert.equal(overdue[0].id, "r11");
  const alert = pendingClaimsAlert(12, overdue, NOW, SITE)!;
  assert.match(alert, /^12 business claims have been/);
  assert.match(alert, /and 2 more/);
});

Deno.test("an unparseable date is not counted as overdue", () => {
  assert.deepEqual(overdueClaims([row("x", "not a date")], NOW), []);
});
