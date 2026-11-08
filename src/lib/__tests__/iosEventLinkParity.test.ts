import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { EVENT_SERIES, seriesPath } from "../eventSeries";

/**
 * IOS-AUDIT-FEAT-045. The iOS app claims /events/* (apple-app-site-association)
 * and reads the segment after /events as an event slug unless it is in
 * EventSlug.landingSegments. /events/series/<slug> was missing from that set,
 * so every annual-event series link (sitemap, AnnualEventLinks, the edition
 * pages) opened an event detail for the slug "series" and found nothing.
 *
 * Swift cannot import TypeScript and there is no compiler in cloud sessions,
 * so this reads the Swift source. It parses only the shapes written today; if
 * either side is rewritten the parse finds nothing and the test fails.
 */

const APP = "src/App.tsx";
const EVENT_SLUG = "ios/DesMoinesInsider/Services/EventSlug.swift";
const DEEP_LINK = "ios/DesMoinesInsider/Services/DeepLinkHandler.swift";

/** The literal first segment of every `/events/<segment>...` route. */
function webEventSegments(): Set<string> {
  const src = readFileSync(APP, "utf8");
  const segments = [...src.matchAll(/path="\/events\/([^"/:]+)[^"]*"/g)].map((m) => m[1]);
  expect(segments.length, `no literal /events/<segment> routes found in ${APP}`).toBeGreaterThan(5);
  return new Set(segments);
}

/** `static let landingSegments: Set<String> = [ "a", "b", ... ]` */
function iosLandingSegments(): Set<string> {
  const src = readFileSync(EVENT_SLUG, "utf8");
  const block = src.match(/static let landingSegments: Set<String> = \[([\s\S]*?)\]/);
  expect(block, `landingSegments literal not found in ${EVENT_SLUG}`).not.toBeNull();
  return new Set([...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

describe("iOS event links know the web's /events pages (IOS-AUDIT-FEAT-045)", () => {
  it("every literal /events/<segment> route is an iOS landing segment, not an event slug", () => {
    const ios = iosLandingSegments();
    const missing = [...webEventSegments()].filter((s) => !ios.has(s));
    expect(missing).toEqual([]);
  });

  it("every iOS landing segment is still a web route", () => {
    const web = webEventSegments();
    const stale = [...iosLandingSegments()].filter((s) => !web.has(s));
    expect(stale).toEqual([]);
  });

  it("every series URL has the slug shape DeepLinkHandler opens on the web", () => {
    const src = readFileSync(DEEP_LINK, "utf8");
    const fn = src.slice(src.indexOf("static func eventSeriesDestination"));
    const guard = fn.match(/path\[2\]\.count <= (\d+),\s*path\[2\]\.range\(of: "([^"]+)"/);
    expect(guard, `eventSeriesDestination guard not found in ${DEEP_LINK}`).not.toBeNull();
    const maxLength = Number(guard![1]);
    const shape = new RegExp(guard![2].replace(/\\\\/g, "\\"));
    for (const def of EVENT_SERIES) {
      expect(seriesPath(def), def.slug).toBe(`/events/series/${def.slug}`);
      expect(def.slug.length, def.slug).toBeLessThanOrEqual(maxLength);
      expect(shape.test(def.slug), def.slug).toBe(true);
    }
  });

  it("a known series opens the native screen, and every place that routes a link handles it (IOS-AUDIT-FEAT-046)", () => {
    const src = readFileSync(DEEP_LINK, "utf8");
    const fn = src.slice(src.indexOf("static func eventSeriesDestination"));
    const body = fn.slice(0, fn.indexOf("\n    }\n"));
    expect(body).toMatch(/if let def = EventSeries\.series\(slug: path\[2\]\) \{ return \.eventSeries\(slug: def\.slug\) \}/);
    expect(body).toMatch(/return \.web\(url\)/);
    // The resolver sheet renders it, the router presents it, and an article
    // link maps it; a case missing from any of them would not compile, but
    // one routed to nil would silently open the web page instead.
    const tab = readFileSync("ios/DesMoinesInsider/Views/MainTabView.swift", "utf8");
    expect(tab).toMatch(/case \.eventSeries\(let def\):\s*EventSeriesView\(def: def\)/);
    expect(tab).toMatch(/case \.eventSeries\(let slug\):[\s\S]{0,300}present\(\.eventSeries\(def\)\)/);
    const article = readFileSync("ios/DesMoinesInsider/Views/Articles/ArticleDetailView.swift", "utf8");
    expect(article).toMatch(/case \.eventSeries\(let slug\):[\s\S]{0,200}return \.eventSeries\(def\)/);
  });
});
