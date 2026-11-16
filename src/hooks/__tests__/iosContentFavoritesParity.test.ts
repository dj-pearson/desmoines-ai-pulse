import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * XPLAT-013. iOS saves restaurants, attractions and articles to
 * content_favorites, and the table's content_type CHECK decides which of those
 * the server keeps. A kind the CHECK refuses never errors visibly: iOS reads
 * 23514 on an article as "not available yet" and keeps the save on the device,
 * so drift here is silent loss of cross-device sync, not a crash.
 *
 * Swift cannot import TypeScript and cloud sessions have no compiler, so this
 * reads the Swift enum and the newest migration that sets the CHECK. If either
 * is rewritten into another shape the parse finds nothing and the test fails.
 */

const SERVICE = "ios/DesMoinesInsider/Services/FavoritesService.swift";
const MIGRATIONS = "supabase/migrations";

function iosContentKinds(): string[] {
  const src = readFileSync(SERVICE, "utf8");
  const block = src.match(/enum ContentKind: String[^{]*\{\s*case ([a-z, ]+)\n/);
  expect(block, `ContentKind not found in ${SERVICE}`).not.toBeNull();
  return block![1].split(",").map((s) => s.trim());
}

/** The content_type list from the newest migration that declares one. */
function newestContentTypeCheck(): { file: string; types: string[]; sql: string } {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files.reverse()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8").replace(/--[^\n]*/g, "");
    if (!/content_favorites/.test(sql)) continue;
    const m = sql.match(/CHECK \(content_type IN \(([^)]*)\)\)/);
    if (!m) continue;
    return { file, types: [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]), sql };
  }
  throw new Error("no content_type CHECK found in any migration");
}

describe("iOS content_favorites kinds (XPLAT-013)", () => {
  it("reads the three kinds iOS stores there", () => {
    expect(iosContentKinds()).toEqual(["restaurant", "attraction", "article"]);
  });

  it("every iOS kind is allowed by the newest content_type CHECK", () => {
    const { file, types } = newestContentTypeCheck();
    for (const kind of iosContentKinds()) {
      expect(types, `${file} refuses content_type '${kind}'`).toContain(kind);
    }
  });

  it("the newest CHECK still accepts every value an older client sends", () => {
    // 20260620000001's list. A narrower CHECK would break shipped web builds.
    const { types } = newestContentTypeCheck();
    for (const t of ["restaurant", "attraction", "hotel", "playground"]) {
      expect(types).toContain(t);
    }
  });

  it("articles stay outside the favourites cap, as iOS has always kept them", () => {
    const { file, sql } = newestContentTypeCheck();
    expect(sql, `${file}: the insert trigger must skip articles`).toMatch(
      /CREATE TRIGGER trg_content_favorites_limit\s+BEFORE INSERT ON public\.content_favorites\s+FOR EACH ROW\s+WHEN \(NEW\.content_type <> 'article'\)/,
    );
    expect(sql, `${file}: the cap count must leave article rows out`).toMatch(
      /FROM public\.content_favorites\s+WHERE user_id = v_uid AND content_type <> 'article'/,
    );
  });
});
