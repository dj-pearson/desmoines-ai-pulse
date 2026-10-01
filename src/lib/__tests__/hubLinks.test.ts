import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import {
  HUB_ACTIVITIES,
  HUB_ALL_AREAS_HREF,
  HUB_AREAS,
  HUB_AUDIENCES,
  HUB_DATE_NIGHT,
  HUB_DEALS_NOW_HREF,
  HUB_EXPLORE_LINKS,
  HUB_MORE_GUIDES,
  HUB_OPEN_NOW_HREF,
  HUB_PLAYGROUND_MAP_HREF,
  HUB_WEEKEND_FREE_HREF,
  HUB_WEEKEND_LANDING,
  HUB_WHEN_FIXED,
  resolveFixedItem,
  resolveHubLink,
} from "@/lib/hubLinks";
import { SEASON_FALLBACK_HREF } from "@/lib/hubSeason";
import { NEIGHBORHOODS } from "@/lib/neighborhoods";
import { LANDING_LIGHT_COLUMNS } from "@/hooks/useEventLanding";
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

const FIXED = [...HUB_AREAS, ...HUB_AUDIENCES, ...HUB_WHEN_FIXED, HUB_DATE_NIGHT, ...HUB_ACTIVITIES];

const pathOf = (href: string) => href.split("?")[0];

/** Every href the hub can render, fallback or pSEO. */
function allHubHrefs(): string[] {
  return [
    ...FIXED.map((i) => i.fallback.href),
    ...FIXED.filter((i) => i.pseoSlug).map((i) => `/things-to-do/${i.pseoSlug}`),
    ...HUB_EXPLORE_LINKS.map((l) => l.href),
    pathOf(HUB_PLAYGROUND_MAP_HREF),
    pathOf(HUB_OPEN_NOW_HREF),
    pathOf(HUB_DEALS_NOW_HREF),
    pathOf(HUB_WEEKEND_FREE_HREF),
    HUB_ALL_AREAS_HREF,
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

  it("puts no destination in two sections", () => {
    const sections = [HUB_AREAS, HUB_AUDIENCES, HUB_WHEN_FIXED, [HUB_DATE_NIGHT], HUB_ACTIVITIES];
    const seen = new Map<string, number>();
    sections.forEach((section, i) => {
      for (const item of section) {
        const prior = seen.get(item.fallback.href);
        expect(prior === undefined || prior === i, item.fallback.href).toBe(true);
        seen.set(item.fallback.href, i);
      }
    });
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

/** Every literal path="/..." in src/App.tsx, without params. */
function appRoutes(): Set<string> {
  const app = readFileSync(resolvePath(__dirname, "../../App.tsx"), "utf8");
  const out = new Set<string>();
  for (const m of app.matchAll(/path="(\/[^"]*)"/g)) if (!m[1].includes(":") && !m[1].includes("*")) out.add(m[1]);
  return out;
}

describe("one URL per intent (explore pass 2 WP1 item 3)", () => {
  it("reads App.tsx routes", () => {
    const routes = appRoutes();
    expect(routes.has("/events/today")).toBe(true);
    expect(routes.has("/music")).toBe(true);
  });

  it("an item whose fallback is a first-party route carries no pseoSlug", () => {
    const routes = appRoutes();
    for (const item of FIXED) {
      if (routes.has(item.fallback.href)) expect(item.pseoSlug, item.key).toBeUndefined();
    }
  });

  it("never links /things-to-do/today, /this-weekend or /live-music, even when all are published", () => {
    const everything = new Set(
      ["today", "this-weekend", "live-music", ...FIXED.map((i) => i.pseoSlug ?? i.key)].map((s) => `/things-to-do/${s}`),
    );
    const hrefs = FIXED.map((i) => resolveFixedItem(i, everything).href);
    for (const bad of ["/things-to-do/today", "/things-to-do/this-weekend", "/things-to-do/live-music"]) {
      expect(hrefs).not.toContain(bad);
    }
  });

  it("no activity goes where the Explore row already goes", () => {
    const explore = new Set(HUB_EXPLORE_LINKS.map((l) => l.href));
    const all = new Set(FIXED.map((i) => `/things-to-do/${i.pseoSlug}`));
    for (const item of HUB_ACTIVITIES) {
      expect(explore.has(item.fallback.href), item.key).toBe(false);
      expect(explore.has(resolveFixedItem(item, all).href), item.key).toBe(false);
    }
  });

  it("Brunch opens the Brunch preset's cuisines", () => {
    const brunch = HUB_ACTIVITIES.find((a) => a.key === "brunch");
    expect(brunch?.fallback.href).toBe("/restaurants?cuisine=Cafe,Brunch,Breakfast");
  });
});

describe("areas (WP1 item 7)", () => {
  it("lists every neighborhood with its own description", () => {
    expect(HUB_AREAS.map((a) => a.key)).toEqual(NEIGHBORHOODS.map((n) => n.slug));
    for (const area of HUB_AREAS) {
      const n = NEIGHBORHOODS.find((x) => x.slug === area.key)!;
      const link = resolveFixedItem(area, new Set());
      expect(link.href).toBe(`/neighborhoods/${n.slug}`);
      expect(link.description).toBe(n.description);
    }
  });
});

describe("weekend line options (WP1 item 1)", () => {
  it("are the options /events/this-weekend passes, so the two share one cache entry", () => {
    expect(HUB_WEEKEND_LANDING).toEqual({
      key: { landing: "this-weekend" },
      window: "this-weekend",
      limit: 500,
      includeOngoing: true,
      columns: LANDING_LIGHT_COLUMNS,
    });
    // The landing passes its options inline; pin each one in its source so a
    // change there fails here instead of silently splitting the cache.
    const src = readFileSync(resolvePath(__dirname, "../../pages/EventsThisWeekend.tsx"), "utf8");
    const call = src.slice(src.indexOf("useEventLanding({"), src.indexOf("});", src.indexOf("useEventLanding({")));
    expect(call).toMatch(/key:\s*\{\s*landing:\s*["']this-weekend["']\s*\}/);
    expect(call).toMatch(/window:\s*["']this-weekend["']/);
    expect(call).toMatch(/limit:\s*FETCH_LIMIT/);
    expect(src).toMatch(/const FETCH_LIMIT = 500;/);
    expect(call).toMatch(/includeOngoing:\s*true/);
    expect(call).toMatch(/columns:\s*LANDING_LIGHT_COLUMNS/);
    // Nothing else in the call that the hub does not also pass.
    const keys = [...call.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]).filter((k) => k !== "landing");
    expect(keys.sort()).toEqual(Object.keys(HUB_WEEKEND_LANDING).sort());
  });

  it("links free events through the weekend preset and the free filter", () => {
    const url = new URL(HUB_WEEKEND_FREE_HREF, "https://example.com");
    expect(url.pathname).toBe("/events");
    expect(url.searchParams.get("preset")).toBe("this-weekend");
    expect(url.searchParams.get("price")).toBe("free");
  });
});
