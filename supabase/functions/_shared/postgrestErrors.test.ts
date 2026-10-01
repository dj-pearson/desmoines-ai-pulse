/**
 * Unit tests for unknown-column detection (WEB-FEAT-024).
 * Run with: `deno test supabase/functions/_shared/postgrestErrors.test.ts`
 *
 * The important negative case is the last block: this must NOT swallow an
 * ordinary failure. A retry guard that treats every error as "column missing"
 * would silently drop the new fields on a permissions problem and nobody would
 * notice.
 */
import { isUnknownColumnError } from "./postgrestErrors.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

Deno.test("recognises the Postgres undefined_column code", () => {
  assert(isUnknownColumnError({ code: "42703" }), "42703");
});

Deno.test("recognises the PostgREST schema-cache miss code", () => {
  assert(isUnknownColumnError({ code: "PGRST204" }), "PGRST204");
});

Deno.test("recognises the Postgres message with no code", () => {
  assert(
    isUnknownColumnError({
      message: 'column "reservable" of relation "restaurants" does not exist',
    }),
    "postgres text",
  );
});

Deno.test("recognises the PostgREST message with no code", () => {
  assert(
    isUnknownColumnError({
      message:
        "Could not find the 'reservable' column of 'restaurants' in the schema cache",
    }),
    "postgrest text",
  );
});

Deno.test("matches regardless of case", () => {
  assert(
    isUnknownColumnError({ message: 'COLUMN "X" DOES NOT EXIST' }),
    "uppercase",
  );
});

Deno.test("reads the details field too", () => {
  assert(
    isUnknownColumnError({
      message: "Bad Request",
      details: 'column "google_maps_uri" does not exist',
    }),
    "details",
  );
});

Deno.test("does NOT match an ordinary failure", () => {
  const others = [
    { code: "42501", message: "permission denied for table restaurants" },
    { code: "23505", message: "duplicate key value violates unique constraint" },
    { code: "PGRST116", message: "JSON object requested, multiple rows returned" },
    { message: "relation \"restaurants\" does not exist" }, // a missing TABLE, not column
    { message: "network error" },
    {},
  ];
  for (const error of others) {
    assert(
      !isUnknownColumnError(error),
      `should not match ${JSON.stringify(error)}`,
    );
  }
});

Deno.test("tolerates junk input", () => {
  for (const input of [null, undefined, "string", 42, []]) {
    assert(!isUnknownColumnError(input), `should not match ${String(input)}`);
  }
});
