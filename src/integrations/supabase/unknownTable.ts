import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";

/**
 * A query builder for a relation the generated types do not know about
 * (WEB-CI-031 AC2).
 *
 * WHY THIS COSTS 21 MINUTES OF CI. `supabase.from()` is overloaded once per
 * relation in the generated `Database` type - 252 tables plus 18 views. Pass a
 * string literal it knows and one overload matches, so the chain instantiates
 * once. Pass a name it does NOT know and nothing matches: overload resolution
 * falls back across all 270, and every downstream .select()/.eq()/.order() is
 * re-instantiated over a 270-member
 * `SelectQueryError<"column 'id' does not exist on 'events'."> | ...` union.
 *
 * MEASURED on src/components/cms/EnhancedArticleEditor.tsx, which has three
 * such names: 89.21s and 7,846,409 instantiations as committed, 2.30s and
 * 361,004 after casting only those three. A 39x reduction with nothing else in
 * the graph touched. Nine files are 91% of the app project's whole type-check,
 * and every one of them queries a relation that is not in types.ts.
 *
 * WHAT IT COSTS. The builder is untyped, so the row shape is `any` and nothing
 * checks the column names. That is not a loss: every relation reached through
 * this helper is already in schema-baseline.json as a WEB-QA-017 known-dead
 * query - the request 400s with 42P01 or 42703 at runtime, and no amount of
 * compile-time checking against a type that does not describe the database
 * would have caught that. The checking that matters here is
 * scripts/check-unknown-tables.mjs, which fails if this helper is used for a
 * relation types.ts DOES know, because that would silence real checking.
 *
 * NOT A PLACE TO PUT NEW QUERIES. When a relation gets a migration and the
 * types are regenerated, move its callers back to `supabase.from()` - the
 * guard will tell you, by failing on the name.
 */
export function fromUnknownTable(table: string) {
  return (supabase as unknown as SupabaseClient).from(table);
}
