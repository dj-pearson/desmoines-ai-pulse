import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * IOS-AUDIT-004. The iOS app claims /stay/*, /restaurants/*,
 * /attractions/*, /articles/*, /neighborhoods/* and /best-of/*
 * (apple-app-site-association) and reads the segment after the prefix as a
 * slug. A literal web page under one of those prefixes is not a slug:
 * /stay/near/<venue> (SEO-045, in the sitemap) opened a hotel detail for the
 * slug "near" and found nothing, the same shape as /events/series in
 * IOS-AUDIT-FEAT-045. /events has its own guard in iosEventLinkParity.
 *
 * Swift cannot import TypeScript and there is no compiler in cloud sessions,
 * so this reads the Swift source. It parses only the shapes written today; if
 * either side is rewritten the parse finds nothing and the test fails.
 */

const APP = "src/App.tsx";
const AASA = "public/.well-known/apple-app-site-association";
const DEEP_LINK = "ios/DesMoinesInsider/Services/DeepLinkHandler.swift";

/** The literal second segment of every `/<prefix>/<segment>...` route. */
function webSegments(prefix: string): Set<string> {
  const src = readFileSync(APP, "utf8");
  const re = new RegExp(`path="/${prefix}/([^"/:]+)[^"]*"`, "g");
  return new Set([...src.matchAll(re)].map((m) => m[1]));
}

/** `static let <name>: Set<String> = [ "a", "b", ... ]` in DeepLinkHandler. */
function swiftSet(name: string): Set<string> {
  const src = readFileSync(DEEP_LINK, "utf8");
  const block = src.match(new RegExp(`static let ${name}: Set<String> = \\[([^\\]]*)\\]`));
  expect(block, `${name} literal not found in ${DEEP_LINK}`).not.toBeNull();
  return new Set([...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

/**
 * Prefixes the app reads as `/<prefix>/<slug>`, and the Swift set of
 * segments it treats as pages instead. A prefix mapped to null has no such
 * set yet, so the web must have no literal page under it.
 */
const SLUG_PREFIXES: Record<string, string | null> = {
  stay: "reservedStaySegments",
  restaurants: "reservedRestaurantSegments",
  attractions: null,
  articles: null,
  neighborhoods: null,
  "best-of": null,
};

describe("iOS reads only slugs as slugs under claimed prefixes (IOS-AUDIT-004)", () => {
  it("every prefix checked here is claimed by the app", () => {
    const aasa = JSON.parse(readFileSync(AASA, "utf8"));
    const paths: string[] = aasa.applinks.details.flatMap((d: { paths: string[] }) => d.paths);
    for (const prefix of Object.keys(SLUG_PREFIXES)) {
      expect(paths, prefix).toContain(`/${prefix}/*`);
    }
  });

  it("the route parse still finds the pages it guards", () => {
    expect(webSegments("stay")).toContain("near");
    expect(webSegments("restaurants")).toContain("open-now");
  });

  for (const [prefix, setName] of Object.entries(SLUG_PREFIXES)) {
    it(`every literal /${prefix}/<segment> route is reserved on iOS, and nothing stale is`, () => {
      const web = webSegments(prefix);
      const ios = setName ? swiftSet(setName) : new Set<string>();
      expect([...web].filter((s) => !ios.has(s)), `web pages iOS would read as a ${prefix} slug`).toEqual([]);
      expect([...ios].filter((s) => !web.has(s)), `iOS reserves segments the web no longer has`).toEqual([]);
    });
  }

  it("/stay/near/<venue> is routed before the hotel slug read, and opens the web", () => {
    const src = readFileSync(DEEP_LINK, "utf8");
    expect(src).toMatch(
      /case "stay":\s*if let near = Self\.stayNearDestination\(path, url: url\) \{ return near \}\s*\/\/[^\n]*\n\s*if let id = Self\.slugOrUUID\(rawId\) \{ return \.hotel\(id: id\) \}/,
    );
    const fn = src.slice(src.indexOf("static func stayNearDestination("));
    const body = fn.slice(0, fn.indexOf("\n    }\n"));
    expect(body).toMatch(/reservedStaySegments\.contains\(path\[1\]\)/);
    expect(body).toMatch(/return \.web\(url\)/);
    expect(body).not.toMatch(/\.hotel\(/);
  });
});
