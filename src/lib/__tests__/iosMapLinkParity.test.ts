import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * IOS-AUDIT-007. A /map link (the site's bottom nav, header, footer, and
 * /map?layers=attraction from the attraction pages) opens the iOS Map tab
 * showing the kinds the link names, instead of the web map in a sheet over
 * the app's own map. `MapLinkLayers` in DeepLinkHandler.swift reads the web's
 * `layers` parameter with DiscoverMap.tsx's parseLayers rules, so it has to
 * know the web's layer keys: `nativeKeys` (the kinds the native map draws,
 * which are also the web's defaults) and `webOnlyKeys` (layers that send the
 * link to the web map instead). This fails when the web adds, drops or
 * re-defaults a layer and the Swift lists are not updated.
 *
 * Swift cannot import TypeScript and there is no compiler in cloud sessions,
 * so this reads the Swift source. It parses only the shapes written today; if
 * either side is rewritten the parse finds nothing and the test fails.
 */

const WEB_MAP = "src/pages/DiscoverMap.tsx";
const DEEP_LINK = "ios/DesMoinesInsider/Services/DeepLinkHandler.swift";
const AASA = "public/.well-known/apple-app-site-association";

function webLayerKeys(): string[] {
  const src = readFileSync(WEB_MAP, "utf8");
  const start = src.indexOf("const LAYER_CONFIG");
  expect(start, "LAYER_CONFIG not found").toBeGreaterThan(-1);
  const block = src.slice(start, src.indexOf("];", start));
  return [...block.matchAll(/key: '([a-z]+)'/g)].map((m) => m[1]);
}

function webDefaultLayers(): string[] {
  const src = readFileSync(WEB_MAP, "utf8");
  const m = src.match(/const DEFAULT_LAYERS: ReadonlyArray<MapEntityType> = \[([^\]]*)\]/);
  expect(m, "DEFAULT_LAYERS not found").not.toBeNull();
  return [...m![1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
}

function swiftList(name: string): string[] {
  const src = readFileSync(DEEP_LINK, "utf8");
  const m = src.match(new RegExp(`static let ${name}: \\[String\\] = \\[([^\\]]*)\\]`));
  expect(m, `${name} literal not found`).not.toBeNull();
  return [...m![1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
}

describe("iOS opens /map links on the Map tab with the web's layers (IOS-AUDIT-007)", () => {
  it("the parse still finds both sides", () => {
    expect(webLayerKeys()).toEqual(expect.arrayContaining(["event", "playground"]));
    expect(swiftList("nativeKeys")).toContain("attraction");
    expect(swiftList("webOnlyKeys")).toContain("trail");
  });

  it("the native kinds are exactly the web's default layers", () => {
    expect([...swiftList("nativeKeys")].sort()).toEqual([...webDefaultLayers()].sort());
  });

  it("every web layer key is either drawn natively or sent to the web, and nothing stale is listed", () => {
    const ios = [...swiftList("nativeKeys"), ...swiftList("webOnlyKeys")];
    const web = webLayerKeys();
    expect(web.filter((k) => !ios.includes(k)), "web layers iOS would silently ignore").toEqual([]);
    expect(ios.filter((k) => !web.includes(k)), "iOS lists layers the web no longer has").toEqual([]);
  });

  it("/map is routed to mapDestination and claimed by the app", () => {
    const src = readFileSync(DEEP_LINK, "utf8");
    expect(src).toContain('if first == "map" { return Self.mapDestination(url) }');
    const aasa = JSON.parse(readFileSync(AASA, "utf8"));
    const paths: string[] = aasa.applinks.details.flatMap((d: { paths: string[] }) => d.paths);
    expect(paths).toContain("/map");
  });
});
