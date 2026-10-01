import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isUnknownColumnError } from "@/lib/postgrestErrors";

describe("isUnknownColumnError", () => {
  it("recognises the Postgres code", () => {
    expect(isUnknownColumnError({ code: "42703" })).toBe(true);
  });

  it("recognises the PostgREST schema-cache code", () => {
    // PostgREST answers PGRST204 when its own cache catches the name before
    // Postgres does, which is the common case right after a deploy. Matching
    // only 42703 misses half of them.
    expect(isUnknownColumnError({ code: "PGRST204" })).toBe(true);
  });

  it("falls back to the message when supabase-js drops the code", () => {
    expect(
      isUnknownColumnError({
        message: 'column "slug" of relation "playgrounds" does not exist',
      }),
    ).toBe(true);
    expect(
      isUnknownColumnError({
        message: "Could not find the 'slug' column of 'attractions' in the schema cache",
      }),
    ).toBe(true);
  });

  it("does NOT swallow other failures", () => {
    // This is the half that matters. fetchBySlug falls back to a table scan on
    // a true answer, so a permission error or an outage answering true turns a
    // broken table into a slow empty page instead of a visible failure.
    expect(isUnknownColumnError({ code: "42P01", message: "relation does not exist" })).toBe(false);
    expect(isUnknownColumnError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isUnknownColumnError({ code: "PGRST116" })).toBe(false);
    expect(isUnknownColumnError({ message: "Failed to fetch" })).toBe(false);
    expect(isUnknownColumnError(null)).toBe(false);
    expect(isUnknownColumnError(undefined)).toBe(false);
    expect(isUnknownColumnError("42703")).toBe(false);
    expect(isUnknownColumnError({})).toBe(false);
  });
});

describe("the edge-function copy", () => {
  /**
   * src/lib/postgrestErrors.ts and supabase/functions/_shared/postgrestErrors.ts
   * are the same function on two sides of a module boundary the tsconfigs keep
   * apart (Deno vs the browser bundle). Two copies of a security-shaped
   * predicate drifting apart is the failure worth catching, so this compares
   * the code with the prose stripped.
   */
  const strip = (path: string) =>
    readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/(?<!:)\/\/.*$/, "").trimEnd())
      .filter((l) => l.trim().length > 0)
      .join("\n");

  it("has not drifted from the web copy", () => {
    expect(strip("src/lib/postgrestErrors.ts")).toBe(
      strip("supabase/functions/_shared/postgrestErrors.ts"),
    );
  });
});
