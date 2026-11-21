// Run with:
//   deno test --allow-read supabase/functions/_shared/restaurantPromotion.test.ts
//
// WEB-BE-063: which restaurants the nightly social post and the weekly digest
// may promote. The stub applies the filters the read sends to fixture rows, so
// a dropped arm shows up as a closed place being picked, not as a different
// call list.

import { strict as assert } from "node:assert";
import {
  applyPromotableRestaurantFilters,
  isRestaurantPromotable,
  type PromotableFilterBuilder,
  type PromotableRestaurantRow,
  restaurantPromotionRefusal,
} from "./sponsoredPickFilters.ts";

type Row = Record<string, unknown> & PromotableRestaurantRow & { id: string };
type Pred = (r: Row) => boolean;

function column(r: Row, col: string): unknown {
  const arrow = col.indexOf("->>");
  if (arrow === -1) return r[col];
  const obj = r[col.slice(0, arrow)] as Record<string, unknown> | null | undefined;
  const v = obj?.[col.slice(arrow + 3)];
  return v === undefined || v === null ? null : String(v);
}

/** One PostgREST term like `hours_checked_at.gte.2026-...` or `and(...)`. */
function term(expr: string): Pred {
  if (expr.startsWith("and(") && expr.endsWith(")")) {
    const parts = splitTop(expr.slice(4, -1)).map(term);
    return (r) => parts.every((p) => p(r));
  }
  const [col, op, ...rest] = expr.split(".");
  const value = rest.join(".");
  if (op === "gte") {
    return (r) => {
      const v = column(r, col);
      return typeof v === "string" && v >= value;
    };
  }
  if (op === "is" && value === "null") return (r) => column(r, col) == null;
  throw new Error(`stub: ${op}`);
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

class Stub implements PromotableFilterBuilder<Stub> {
  preds: Pred[] = [];
  eq(c: string, v: string): Stub {
    this.preds.push((r) => r[c] === v);
    return this;
  }
  not(c: string, op: string, v: unknown): Stub {
    if (op === "is" && v === true) {
      // IS NOT TRUE: NULL passes.
      this.preds.push((r) => r[c] !== true);
    } else if (op === "in" && typeof v === "string") {
      const list = v.slice(1, -1).split(",");
      // SQL NOT IN: a NULL value is unknown, so the row is dropped.
      this.preds.push((r) => r[c] != null && !list.includes(r[c] as string));
    } else throw new Error(`stub: not ${op}`);
    return this;
  }
  or(expr: string): Stub {
    const arms = splitTop(expr).map(term);
    this.preds.push((r) => arms.some((a) => a(r)));
    return this;
  }
}

const NOW = new Date("2026-11-21T18:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const ok = {
  is_merged: false,
  business_status: "OPERATIONAL",
  status: "open",
  hours_checked_at: days(3),
  hours_json: null,
};

const ROWS: Row[] = [
  { id: "open-checked", ...ok },
  { id: "newly-opened", ...ok, status: "newly_opened" },
  { id: "legacy-fetchedAt", ...ok, hours_checked_at: null, hours_json: { fetchedAt: days(10) } },
  { id: "merged-null-flag", ...ok, is_merged: null },
  // Refused:
  { id: "google-null", ...ok, business_status: null },
  { id: "google-temp", ...ok, business_status: "CLOSED_TEMPORARILY" },
  { id: "google-perm", ...ok, business_status: "CLOSED_PERMANENTLY" },
  { id: "status-closed", ...ok, status: "closed" },
  { id: "status-perm", ...ok, status: "permanently_closed" },
  { id: "status-soon", ...ok, status: "opening_soon" },
  { id: "status-announced", ...ok, status: "announced" },
  { id: "status-null", ...ok, status: null },
  { id: "merged", ...ok, is_merged: true },
  { id: "check-31-days", ...ok, hours_checked_at: days(31) },
  { id: "never-checked", ...ok, hours_checked_at: null, hours_json: null },
  { id: "legacy-old", ...ok, hours_checked_at: null, hours_json: { fetchedAt: days(40) } },
  // A stale check is not rescued by a fresher fetchedAt: hours_checked_at wins.
  { id: "stale-check-fresh-fetch", ...ok, hours_checked_at: days(45), hours_json: { fetchedAt: days(2) } },
];

const PROMOTABLE = ["open-checked", "newly-opened", "legacy-fetchedAt", "merged-null-flag"];

function picked(): string[] {
  const q = applyPromotableRestaurantFilters(new Stub(), NOW);
  return ROWS.filter((r) => q.preds.every((p) => p(r))).map((r) => r.id);
}

Deno.test("the read promotes only confirmed-operational, recently checked, open rows", () => {
  assert.deepEqual(picked(), PROMOTABLE);
});

Deno.test("isRestaurantPromotable agrees with the read for every fixture row", () => {
  assert.deepEqual(ROWS.filter((r) => isRestaurantPromotable(r, NOW)).map((r) => r.id), PROMOTABLE);
});

Deno.test("each refusal names its reason", () => {
  const reason = (id: string) => restaurantPromotionRefusal(ROWS.find((r) => r.id === id)!, NOW);
  assert.equal(reason("google-null"), "not_operational");
  assert.equal(reason("google-perm"), "not_operational");
  assert.equal(reason("status-closed"), "status_not_open");
  assert.equal(reason("status-announced"), "status_not_open");
  assert.equal(reason("merged"), "merged");
  assert.equal(reason("never-checked"), "never_checked");
  assert.equal(reason("check-31-days"), "check_too_old");
  assert.equal(reason("legacy-old"), "check_too_old");
  assert.equal(reason("open-checked"), null);
});

// Every promotion path must read through the shared filter. Removing it from
// any one caller turns this red.
Deno.test("social-daily-poster, social-media-manager and assemble-weekly-digest use the promotion filter", async () => {
  for (const rel of [
    "../social-daily-poster/index.ts",
    "../social-media-manager/index.ts",
    "../assemble-weekly-digest/index.ts",
  ]) {
    const src = await Deno.readTextFile(new URL(rel, import.meta.url));
    const reads = src.match(/\.from\(["']restaurants["']\)/g) ?? [];
    const filtered = src.match(/applyPromotableRestaurantFilters\(\s*supabase\.from\(["']restaurants["']\)/g) ?? [];
    assert.ok(filtered.length > 0, `${rel} reads restaurants without applyPromotableRestaurantFilters`);
    if (rel.includes("social-daily-poster") || rel.includes("assemble-weekly-digest")) {
      assert.equal(filtered.length, reads.length, `${rel} has an unfiltered restaurants read`);
    }
  }
});

Deno.test("social-media-manager refuses a targeted restaurant that fails the rule", async () => {
  const src = await Deno.readTextFile(new URL("../social-media-manager/index.ts", import.meta.url));
  assert.ok(/restaurantPromotionRefusal\(target\)/.test(src), "targetContentId is not checked");
  assert.ok(/is not promotable: \$\{refusal\}/.test(src), "refusal does not name its reason");
});
