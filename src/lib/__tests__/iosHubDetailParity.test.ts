import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * IOS-AUDIT-006. DeepLinkHandler sends any path whose first segment is a
 * Discover hub slug (/music, /sports, /outdoors, /deals ...) to that hub, so
 * a web detail page under one (/sports/iowa-cubs, /outdoors/high-trestle-trail,
 * /music/venues/<slug>) opened the whole hub and lost the team or trail.
 * `hubDetailPrefixes` lists the detail routes that open on the web instead.
 * This fails when the web adds a detail route under a hub the app routes by
 * its first segment, or drops one iOS still lists.
 *
 * Swift cannot import TypeScript and there is no compiler in cloud sessions,
 * so this reads the Swift source. It parses only the shapes written today; if
 * either side is rewritten the parse finds nothing and the test fails.
 */

const APP = "src/App.tsx";
const DEEP_LINK = "ios/DesMoinesInsider/Services/DeepLinkHandler.swift";
const DISCOVER = "ios/DesMoinesInsider/Views/Discover/DiscoverHubView.swift";

/** Every DiscoverDestination slug, from its `var slug` switch. */
function discoverSlugs(): string[] {
  const src = readFileSync(DISCOVER, "utf8");
  const start = src.indexOf("var slug: String {");
  expect(start, "DiscoverDestination.slug not found").toBeGreaterThan(-1);
  const block = src.slice(start, src.indexOf("\n    }\n", start));
  return [...block.matchAll(/return "([^"]+)"/g)].map((m) => m[1]);
}

/** First segments parseUniversalLink handles with their own case. */
function explicitCases(): Set<string> {
  const src = readFileSync(DEEP_LINK, "utf8");
  const start = src.indexOf("private func parseUniversalLink(");
  const body = src.slice(start, src.indexOf("private func parseCustomScheme(", start));
  return new Set([...body.matchAll(/^\s*case "([^"]+)":/gm)].map((m) => m[1]));
}

function hubDetailPrefixes(): Set<string> {
  const src = readFileSync(DEEP_LINK, "utf8");
  const block = src.match(/static let hubDetailPrefixes: Set<String> = \[([^\]]*)\]/);
  expect(block, "hubDetailPrefixes literal not found").not.toBeNull();
  return new Set([...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

/** `/<hub>/.../:param` routes, as the path before the final param. */
function webDetailPrefixes(hubs: string[]): Set<string> {
  const src = readFileSync(APP, "utf8");
  const out = new Set<string>();
  for (const m of src.matchAll(/path="\/([^"]+)"/g)) {
    const parts = m[1].split("/");
    if (parts.length < 2 || !hubs.includes(parts[0]) || !parts[parts.length - 1].startsWith(":")) continue;
    out.add(parts.slice(0, -1).join("/"));
  }
  return out;
}

describe("iOS opens hub detail pages on the web, not as the hub (IOS-AUDIT-006)", () => {
  const routedByFirstSegment = discoverSlugs().filter((s) => !explicitCases().has(s));

  it("the parse still finds the hubs and routes it guards", () => {
    expect(discoverSlugs()).toEqual(expect.arrayContaining(["music", "sports", "outdoors", "articles"]));
    expect(explicitCases()).toContain("articles");
    expect(routedByFirstSegment).toEqual(expect.arrayContaining(["music", "sports", "outdoors"]));
    expect(webDetailPrefixes(["sports"])).toContain("sports");
  });

  it("every web detail route under a first-segment hub is in hubDetailPrefixes, and nothing stale is", () => {
    const web = webDetailPrefixes(routedByFirstSegment);
    const ios = hubDetailPrefixes();
    expect([...web].filter((p) => !ios.has(p)), "web detail pages iOS opens as the whole hub").toEqual([]);
    expect([...ios].filter((p) => !web.has(p)), "iOS lists detail routes the web no longer has").toEqual([]);
  });

  it("the detail check runs before the hub fallback in parseUniversalLink", () => {
    const src = readFileSync(DEEP_LINK, "utf8");
    expect(src).toMatch(
      /default:\s*if let detail = Self\.hubDetailDestination\(path, url: url\) \{ return detail \}\s*(\/\/[^\n]*\n\s*)*if let discover = DiscoverDestination\(slug: type\)/,
    );
    const fn = src.slice(src.indexOf("static func hubDetailDestination("));
    const body = fn.slice(0, fn.indexOf("\n    }\n"));
    expect(body).toMatch(/hubDetailPrefixes\.contains/);
    expect(body).toMatch(/return \.web\(url\)/);
    expect(body).not.toMatch(/\.discover\(/);
  });
});
