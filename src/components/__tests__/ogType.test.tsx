/**
 * WEB-SEO-068: og:type must be on the Open Graph list (https://ogp.me/#types).
 *
 * EnhancedEventSEO wrote "event", EnhancedPlaygroundSEO "place", and SEOHead,
 * LocalSEO and EnhancedLocalSEO copied their descriptive `type`/`pageType`
 * props ("event", "restaurant", "business", "local_business", "attraction")
 * straight into the tag. None of those is an OG type.
 *
 * Three layers: toOgType's mapping, the rendered tag for the components that
 * take a type prop, and a source scan so a new emitter cannot write a raw word.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import SEOHead from "@/components/SEOHead";
import LocalSEO from "@/components/LocalSEO";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { OG_TYPES, isOgType, toOgType } from "@/lib/ogType";

const SRC = join(__dirname, "..", "..");

function ogType(): string | null {
  const el = document.head.querySelector<HTMLMetaElement>('meta[property="og:type"]');
  return el ? el.getAttribute("content") : null;
}

async function committed(): Promise<string | null> {
  await waitFor(() => {
    if (ogType() === null) throw new Error("Helmet not committed yet");
  });
  return ogType();
}

afterEach(() => {
  cleanup();
});

describe("toOgType", () => {
  it("passes Open Graph types through", () => {
    for (const t of OG_TYPES) expect(toOgType(t)).toBe(t);
  });

  it("maps descriptive page types to website", () => {
    for (const t of ["event", "restaurant", "business", "local_business", "attraction", "place", ""]) {
      expect(toOgType(t)).toBe("website");
    }
    expect(toOgType(undefined)).toBe("website");
    expect(toOgType(null)).toBe("website");
  });

  it("is case-sensitive, as the protocol is", () => {
    expect(isOgType("Article")).toBe(false);
    expect(toOgType("Article")).toBe("website");
  });
});

describe("rendered og:type", () => {
  it.each(["event", "restaurant", "business"] as const)(
    "SEOHead type=%s emits website",
    async (type) => {
      render(
        <HelmetProvider>
          <SEOHead title="T" description="D" type={type} url="/x" />
        </HelmetProvider>,
      );
      expect(await committed()).toBe("website");
    },
  );

  it("SEOHead type=article still emits article", async () => {
    render(
      <HelmetProvider>
        <SEOHead title="T" description="D" type="article" url="/x" />
      </HelmetProvider>,
    );
    expect(await committed()).toBe("article");
  });

  it("LocalSEO pageType=local_business emits website", async () => {
    render(
      <HelmetProvider>
        <LocalSEO pageTitle="T" pageDescription="D" pageType="local_business" />
      </HelmetProvider>,
    );
    expect(await committed()).toBe("website");
  });

  it.each(["event", "restaurant", "attraction"] as const)(
    "EnhancedLocalSEO pageType=%s emits website",
    async (pageType) => {
      render(
        <HelmetProvider>
          <EnhancedLocalSEO
            pageTitle="T"
            pageDescription="D"
            canonicalUrl="https://example.com/x"
            pageType={pageType}
          />
        </HelmetProvider>,
      );
      expect(await committed()).toBe("website");
    },
  );
});

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      sourceFiles(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe("og:type emitters in src", () => {
  // Matches the JSX meta tag. SEOTools builds a copy-paste snippet as a
  // string; its value is checked by the same rule because it is the same tag.
  const TAG = /property=["']og:type["']\s+content=(?:"([^"]*)"|'([^']*)'|\{([^}]*\}?)\})/g;

  const found: Array<{ file: string; value: string; literal: boolean }> = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(TAG)) {
      const literal = m[1] ?? m[2];
      found.push({
        file: relative(SRC, file),
        value: literal ?? m[3],
        literal: literal !== undefined,
      });
    }
  }

  it("finds the emitters (the scan is not vacuous)", () => {
    const files = new Set(found.map((f) => f.file));
    expect(files).toContain(join("components", "SEOHead.tsx"));
    expect(files).toContain(join("components", "EnhancedEventSEO.tsx"));
  });

  it("every literal og:type is on the Open Graph list", () => {
    const bad = found.filter((f) => f.literal && !isOgType(f.value));
    expect(bad).toEqual([]);
  });

  it("every computed og:type goes through toOgType()", () => {
    const bad = found.filter((f) => !f.literal && !/^toOgType\(/.test(f.value.trim()));
    expect(bad).toEqual([]);
  });
});
