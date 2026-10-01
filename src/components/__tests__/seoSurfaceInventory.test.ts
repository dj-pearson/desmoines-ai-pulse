import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * WEB-SEO-039. Thirteen SEO and schema components had zero importers.
 *
 * The reason the count got that high is `src/components/schema/index.ts`: a
 * barrel that re-exported eleven components and was itself imported by nobody.
 * A grep for any name it listed came back with hits, so every dead component
 * in it looked alive. Deleting the members without deleting the barrel would
 * have left the same trap for the next audit, so the barrel is gone and this
 * test keeps it gone.
 *
 * SEO_IMPLEMENTATION_GUIDE.md carries the surviving inventory and the two
 * judgement calls (RestaurantSchema's aggregateRating had no review corpus;
 * TouristAttractionSchema had no inline node to replace).
 */

const DELETED = [
  "src/components/EventSchema.tsx",
  "src/components/SEOOptimizedHead.tsx",
  "src/components/seo/Breadcrumbs.tsx",
  "src/components/seo/index.ts",
  "src/components/schema/index.ts",
  "src/components/schema/ArticleSchema.tsx",
  "src/components/schema/BreadcrumbSchema.tsx",
  "src/components/schema/EventSchema.tsx",
  "src/components/schema/HowToSchema.tsx",
  "src/components/schema/OrganizationSchema.tsx",
  "src/components/schema/ProductSchema.tsx",
  "src/components/schema/RestaurantSchema.tsx",
  "src/components/schema/TouristAttractionSchema.tsx",
  "src/components/schema/WebSiteSchema.tsx",
];

const SURVIVORS = [
  "src/components/SEOHead.tsx",
  "src/components/EnhancedLocalSEO.tsx",
  "src/components/LocalSEO.tsx",
  "src/components/EnhancedEventSEO.tsx",
  "src/components/EnhancedAttractionSEO.tsx",
  "src/components/EnhancedPlaygroundSEO.tsx",
  "src/components/schema/BreadcrumbListSchema.tsx",
  "src/components/schema/EventListJsonLd.tsx",
  "src/components/schema/FAQSchema.tsx",
  "src/components/schema/HotelSchema.tsx",
  "src/components/schema/ItemListSchema.tsx",
  "src/components/schema/MenuSchema.tsx",
  "src/components/schema/NoIndexMeta.tsx",
  "src/components/schema/SpeakableSchema.tsx",
  "src/components/schema/TouristTripSchema.tsx",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const SOURCES = walk("src");

/**
 * Strip comments before matching. The eighth time in this codebase that an
 * assertion fired on the sentence explaining it: EnhancedAttractionSEO's
 * WEB-SEO-027 comment lists the tags it no longer emits, `<title>` included.
 */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");
}

/** Import specifiers only, so prose about a deleted component never counts. */
function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  const re = /\bfrom\s+["']([^"']+)["']/g;
  const code = codeOnly(source);
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) out.push(m[1]);
  return out;
}

describe("the SEO component inventory", () => {
  it.each(DELETED)("%s stays deleted", (path) => {
    expect(existsSync(path)).toBe(false);
  });

  it.each(SURVIVORS)("%s is still here", (path) => {
    expect(existsSync(path)).toBe(true);
  });

  it("every surviving schema component has a real importer", () => {
    // A JSON-LD emitter nothing renders publishes nothing. Checking imports
    // rather than name mentions is the whole point: the deleted barrel made
    // name mentions worthless as evidence, and several live pages carry
    // comments naming components that were removed in WEB-SEO-027.
    const orphans = SURVIVORS.filter((path) => {
      const stem = path.replace(/^src\//, "").replace(/\.tsx?$/, "");
      const alias = `@/${stem}`;
      const base = stem.split("/").pop() as string;
      return !SOURCES.some(
        (file) =>
          file !== path &&
          importSpecifiers(readFileSync(file, "utf8")).some(
            (spec) => spec === alias || spec.endsWith(`/${base}`) || spec === `./${base}`,
          ),
      );
    });
    expect(orphans).toEqual([]);
  });

  it("no barrel re-exports the schema or seo directories", () => {
    // Importing the directory instead of the file is what let eleven dead
    // components look reachable. Keep imports pointing at files.
    const viaBarrel = SOURCES.filter((file) =>
      importSpecifiers(readFileSync(file, "utf8")).some((spec) =>
        /(^|\/)(components\/)?(schema|seo)$/.test(spec.replace(/^@\//, "components/")),
      ),
    );
    expect(viaBarrel).toEqual([]);
  });

  it("AttractionDetails keeps one head manager", () => {
    // EnhancedAttractionSEO sits alongside SEOHead on purpose: WEB-SEO-027
    // stripped its title/description/canonical/OG/Twitter, leaving place meta
    // and three JSON-LD blocks. Putting a title back restores the collision,
    // where mount order rather than anyone's decision picks the title.
    const attraction = codeOnly(readFileSync("src/components/EnhancedAttractionSEO.tsx", "utf8"));
    expect(attraction).not.toMatch(/<title>/);
    expect(attraction).not.toMatch(/rel=["']canonical["']/);
    expect(attraction).toContain("TouristAttraction");
  });

  it("InternalLinks is dead on purpose and the comments citing it still resolve", () => {
    // Not named by WEB-SEO-039, and deliberately kept: two files point at it
    // as the predecessor they replaced. Deleting it dangles those references.
    expect(existsSync("src/components/seo/InternalLinks.tsx")).toBe(true);
    for (const citing of ["src/components/Footer.tsx", "src/components/seo/SiteDirectory.tsx"]) {
      expect(readFileSync(citing, "utf8")).toContain("InternalLinks.tsx");
    }
  });
});
