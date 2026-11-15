// Run with:
//   deno test --allow-read supabase/functions/_shared/socialEventPick.test.ts
//
// The social posters' event pick (WEB-FEAT-096). The stub applies the sent
// filters to rows, so a missing end_date arm shows up as the State Fair not
// being picked, not as a different call list.

import { strict as assert } from "node:assert";
import {
  applyPostableEventFilters,
  isPostableAt,
  type PostableFilterBuilder,
  socialEventDateLine,
} from "./socialEventPick.ts";

type Row = Record<string, string | boolean | null>;
type Pred = (r: Row) => boolean;

function gte(col: string, iso: string): Pred {
  return (r) => typeof r[col] === "string" && Date.parse(r[col] as string) >= Date.parse(iso);
}

class Stub implements PostableFilterBuilder<Stub> {
  preds: Pred[] = [];
  ors: string[] = [];
  neq(c: string, v: boolean): Stub {
    // SQL <>: a NULL flag passes neither way.
    this.preds.push((r) => r[c] !== null && r[c] !== undefined && r[c] !== v);
    return this;
  }
  is(c: string, _v: null): Stub {
    this.preds.push((r) => r[c] === null || r[c] === undefined);
    return this;
  }
  or(expr: string): Stub {
    this.ors.push(expr);
    const arms = expr.split(",").map((term) => {
      const [col, op, ...rest] = term.split(".");
      if (op !== "gte") throw new Error(`stub: ${op}`);
      return gte(col, rest.join("."));
    });
    this.preds.push((r) => arms.some((a) => a(r)));
    return this;
  }
}

// Saturday Aug 15 2026, 10:00 Central.
const NOW = new Date("2026-08-15T15:00:00Z");
const h = (n: number) => new Date(NOW.getTime() + n * 3_600_000).toISOString();
const base = { is_hidden: false, is_merged: false, archived_at: null, end_date: null };

const ROWS: (Row & { id: string })[] = [
  // Opened Thursday Aug 13, closes Sunday Aug 23.
  { id: "fair", ...base, date: "2026-08-13T14:00:00Z", end_date: "2026-08-24T03:00:00Z" },
  { id: "closed-run", ...base, date: h(-72), end_date: h(-2) },
  { id: "started-hour-ago", ...base, date: h(-1) },
  { id: "tonight", ...base, date: h(9) },
  { id: "hidden", ...base, date: h(5), is_hidden: true },
  { id: "merged", ...base, date: h(5), is_merged: true },
  { id: "archived", ...base, date: h(5), archived_at: "2026-08-01T00:00:00Z" },
];

function picked(): string[] {
  const q = applyPostableEventFilters(new Stub(), NOW);
  return ROWS.filter((r) => q.preds.every((p) => p(r))).map((r) => r.id);
}

Deno.test("the pick keeps a running festival and upcoming events, nothing past or unpublished", () => {
  assert.deepEqual(picked(), ["fair", "tonight"]);
});

Deno.test("the pick sends one or= group with the end_date arm", () => {
  const q = applyPostableEventFilters(new Stub(), NOW);
  assert.deepEqual(q.ors, [`date.gte.${NOW.toISOString()},end_date.gte.${NOW.toISOString()}`]);
});

Deno.test("isPostableAt agrees with the read for every fixture row", () => {
  const visible = ROWS.filter((r) => !r.is_hidden && !r.is_merged && !r.archived_at);
  const kept = visible.filter((r) =>
    isPostableAt({ date: r.date as string, end_date: r.end_date as string | null }, NOW)
  ).map((r) => r.id);
  assert.deepEqual(kept, ["fair", "tonight"]);
});

Deno.test("a running event's date line names its Central end day, not the start it passed", () => {
  const fair = ROWS[0];
  assert.equal(
    socialEventDateLine({ date: fair.date as string, end_date: fair.end_date as string }, NOW),
    "On now, running through Sun, Aug 23, 2026 (Central Time)",
  );
});

Deno.test("an upcoming event's date line is its Central start", () => {
  assert.equal(
    socialEventDateLine({ date: "2026-08-16T00:30:00Z", end_date: null }, NOW),
    "Sat, Aug 15, 2026, 7:30 PM (Central Time)",
  );
  assert.equal(socialEventDateLine({ date: null }, NOW), "");
});

// The two posters must use the shared pick, not their own `date >= now`.
Deno.test("social-daily-poster and social-media-manager read through applyPostableEventFilters", async () => {
  for (const rel of ["../social-daily-poster/index.ts", "../social-media-manager/index.ts"]) {
    const src = await Deno.readTextFile(new URL(rel, import.meta.url));
    assert.ok(src.includes('from "../_shared/socialEventPick.ts"'), `${rel} imports socialEventPick.ts`);
    assert.ok(!/\.gte\("date"/.test(src), `${rel} still has a bare .gte("date") floor`);
  }
});
