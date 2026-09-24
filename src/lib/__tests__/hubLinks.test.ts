import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import {
  HUB_ACTIVITIES,
  HUB_AREAS,
  HUB_AUDIENCES,
  HUB_EXPLORE_LINKS,
  HUB_MORE_GUIDES,
  HUB_PLAYGROUND_MAP_HREF,
  HUB_WHEN_FIXED,
  resolveFixedItem,
  resolveHubLink,
} from "@/lib/hubLinks";
import { SEASON_FALLBACK_HREF } from "@/lib/hubSeason";
import { navigationGroups } from "@/components/header/navigationConfig";

const published = new Set(["/things-to-do/budget", "/things-to-do/this-weekend"]);

describe("resolveHubLink", () => {
  it("links the pSEO page when it is published", () => {
    expect(resolveHubLink("/things-to-do/budget", published, { href: "/events/free" }, "Cheap eats")).toEqual({
      href: "/things-to-do/budget",
      description: "Cheap eats",
      published: true,
    });
  });

  it("falls back to the real page, with the fallback's own description", () => {
    expect(
      resolveHubLink("/things-to-do/families", published, { href: "/events/kids", description: "Kids events" }, "Stroller notes"),
    ).toEqual({ href: "/events/kids", description: "Kids events", published: false });
  });

  it("drops the card when there is neither a published page nor a fallback", () => {
    expect(resolveHubLink("/things-to-do/sherman-hill", published)).toBeNull();
  });

  it("never returns an unpublished /things-to-do path", () => {
    const out = resolveHubLink("/things-to-do/drake", published, undefined, "x");
    expect(out?.href ?? "").not.toMatch(/^\/things-to-do\//);
  });
});

const FIXED = [...HUB_AREAS, ...HUB_AUDIENCES, ...HUB_WHEN_FIXED, ...HUB_ACTIVITIES];

/** Every href the hub can render, fallback or pSEO. */
function allHubHrefs(): string[] {
  return [
    ...FIXED.map((i) => i.fallback.href),
    ...FIXED.filter((i) => i.pseoSlug).map((i) => `/things-to-do/${i.pseoSlug}`),
    ...HUB_EXPLORE_LINKS.map((l) => l.href),
    HUB_PLAYGROUND_MAP_HREF.split("?")[0],
    ...HUB_MORE_GUIDES.map((l) => l.href),
    ...Object.values(SEASON_FALLBACK_HREF),
  ];
}

describe("hub link data", () => {
  it("resolves every top-section item whatever the published set", () => {
    for (const set of [new Set<string>(), new Set(FIXED.map((i) => `/things-to-do/${i.pseoSlug}`))]) {
      for (const item of FIXED) expect(resolveFixedItem(item, set).href).toBeTruthy();
    }
  });

  it("links the visitor guide directly, never the redirected pSEO path", () => {
    const visitors = HUB_AUDIENCES.find((a) => a.key === "visitors");
    expect(visitors?.pseoSlug).toBeUndefined();
    expect(resolveFixedItem(visitors!, new Set(["/things-to-do/tourists"])).href).toBe("/visitors-guide");
  });

  it("has no duplicate href inside a section", () => {
    for (const section of [HUB_AREAS, HUB_AUDIENCES, HUB_WHEN_FIXED, HUB_ACTIVITIES]) {
      const hrefs = section.map((i) => i.fallback.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });

  it("covers every Explore nav destination", () => {
    const onPage = new Set(allHubHrefs());
    for (const item of navigationGroups.explore.items) {
      if (item.href === "/things-to-do") continue; // the hub itself
      expect(onPage.has(item.href), item.href).toBe(true);
    }
  });

  it("never links a public/_redirects source", () => {
    const redirects = readFileSync(resolvePath(__dirname, "../../../public/_redirects"), "utf8");
    const sources = new Set(
      redirects
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => line.split(/\s+/)[0]),
    );
    expect(sources.has("/things-to-do/tourists")).toBe(true); // the case that motivated this
    for (const href of allHubHrefs()) expect(sources.has(href), href).toBe(false);
  });
});
