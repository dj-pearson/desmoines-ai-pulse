import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createSlug, slugToTitlePattern } from "@/lib/slug";

/**
 * The slug is computed in four places and they all have to agree, or a URL one
 * of them builds is a 404 in another:
 *   - src/lib/slug.ts (the app)
 *   - scripts/generate-dynamic-sitemaps.ts (the sitemap, its own copy because
 *     scripts do not share the app's module graph)
 *   - public.content_slug() in migration 20260919000008 (the stored column)
 *   - the two BEFORE triggers that call it
 * These tests pin the TypeScript behaviour and assert the SQL still says the
 * same thing. They cannot run the SQL - there is no Postgres in CI here - so
 * the SQL assertion is textual and deliberately narrow.
 */
describe("createSlug", () => {
  const cases: Array<[string, string]> = [
    ["Gray's Lake Park", "gray-s-lake-park"],
    ["Raccoon River Park", "raccoon-river-park"],
    ["  Leading and trailing  ", "leading-and-trailing"],
    ["Multiple   spaces", "multiple-spaces"],
    ["Punctuation!!! Everywhere???", "punctuation-everywhere"],
    ["MiXeD CaSe", "mixed-case"],
    ["Numbers 515 and 2026", "numbers-515-and-2026"],
    ["---already-hyphenated---", "already-hyphenated"],
    ["Café Diem", "caf-diem"],
    ["!!!", ""],
  ];

  for (const [name, expected] of cases) {
    it(`slugs ${JSON.stringify(name)}`, () => {
      expect(createSlug(name)).toBe(expected);
    });
  }

  it("is idempotent on its own output", () => {
    for (const [name] of cases) {
      const once = createSlug(name);
      expect(createSlug(once)).toBe(once);
    }
  });
});

describe("the SQL copy of createSlug", () => {
  const migration = readFileSync(
    "supabase/migrations/20260919000008_content_slugs.sql",
    "utf8",
  );

  it("pins BOTH sides, because the SQL assertion alone only watches one", () => {
    // Found by a negative control: widening the TypeScript character class to
    // [^a-z0-9_] left the SQL assertion below green, since nothing had touched
    // the migration. A parity test that reads only one of the two files is not
    // a parity test.
    const ts = readFileSync("src/lib/slug.ts", "utf8");
    expect(ts).toContain('.toLowerCase()');
    expect(ts).toContain('.replace(/[^a-z0-9]+/g, "-")');
    expect(ts).toContain('.replace(/(^-|-$)/g, "")');
  });

  it("still lowercases, collapses non-alphanumerics and trims hyphens", () => {
    // lower() matches .toLowerCase(); '[^a-z0-9]+' -> '-' with the 'g' flag
    // matches .replace(/[^a-z0-9]+/g, "-"); btrim(..., '-') matches
    // .replace(/(^-|-$)/g, ""). Change either side and this fails.
    expect(migration).toContain(
      "btrim(regexp_replace(lower(coalesce(source, '')), '[^a-z0-9]+', '-', 'g'), '-')",
    );
  });

  it("gives a name with no alphanumerics a stable slug rather than an empty one", () => {
    // createSlug("!!!") is "", and a table full of empty slugs cannot carry a
    // unique index. The migration substitutes an id-derived value.
    expect(createSlug("!!!")).toBe("");
    expect(migration).toContain("'item-' || left(id::text, 8)");
  });

  it("keeps the unique index the lookup depends on", () => {
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_playgrounds_slug");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_attractions_slug");
  });
});

describe("slugToTitlePattern", () => {
  it("turns each hyphen into a wildcard so the original title matches", () => {
    expect(slugToTitlePattern("jazz-in-july")).toBe("%jazz%in%july%");
  });

  it("matches the title its slug came from", () => {
    // What the bound query actually has to satisfy: the pattern built from a
    // slug must match the title that produced it, whatever punctuation the
    // slugging ate.
    const titles = [
      "Jazz in July: Night 2",
      "Farmers' Market - Downtown",
      "80/35 Music Festival",
      "Winter Lights @ Water Works",
    ];
    for (const title of titles) {
      const pattern = slugToTitlePattern(createSlug(title));
      expect(pattern).not.toBeNull();
      const re = new RegExp(
        `^${pattern!.split("%").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`,
        "i",
      );
      expect(re.test(title)).toBe(true);
    }
  });

  it("returns null when there is nothing to match on", () => {
    expect(slugToTitlePattern("")).toBeNull();
    expect(slugToTitlePattern("---")).toBeNull();
  });

  it("cannot emit a LIKE wildcard the caller did not intend", () => {
    // A slug is [a-z0-9-] by construction, so there is no % or _ to escape.
    // This pins that: if createSlug ever stops stripping them, the pattern
    // would silently widen and this fails.
    expect(createSlug("100% free_entry")).toBe("100-free-entry");
    expect(slugToTitlePattern(createSlug("100% free_entry"))).toBe("%100%free%entry%");
  });
});
