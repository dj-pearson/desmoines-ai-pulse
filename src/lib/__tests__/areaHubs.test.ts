import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  AREA_HUBS,
  areaHubForPageDimensions,
  areaHubsForArticle,
  articleMatchesArea,
  findAreaHub,
} from "@/lib/areaHubs";

describe("areaHubsForArticle", () => {
  it("links an article to the area pages its tags name", () => {
    expect(
      areaHubsForArticle({
        title: "The Ultimate Des Moines Patio Guide",
        category: "Food & Drink",
        tags: ["patios", "rooftop bars", "East Village", "Ingersoll"],
      }),
    ).toEqual([{ href: "/things-to-do/east-village", title: "East Village" }]);
  });

  it("files Valley Junction under West Des Moines", () => {
    expect(
      areaHubsForArticle({ title: "Valley Junction's Artisan Trail", category: "Shopping", tags: ["local makers"] }),
    ).toEqual([{ href: "/neighborhoods/west-des-moines", title: "West Des Moines" }]);
  });

  it("sends a downtown article to the Downtown page and not also to East Village", () => {
    const soups = { title: "Soup's On", category: "Food & Drink", tags: ["soup", "downtown"] };
    expect(areaHubsForArticle(soups)).toEqual([{ href: "/things-to-do/downtown", title: "Downtown Des Moines" }]);
    expect(articleMatchesArea(soups, "east-village")).toBe(false);
  });

  it("matches whole words only, and links nowhere for an area with no page", () => {
    expect(areaHubsForArticle({ title: "Cliveden teas", tags: [] })).toEqual([]);
    expect(areaHubsForArticle({ title: "Drake neighborhood food guide", tags: ["Drake", "Highland Park"] })).toEqual([]);
  });
});

describe("findAreaHub", () => {
  it("takes a slug or a name, and follows the Valley Junction alias", () => {
    expect(findAreaHub("east-village")?.href).toBe("/things-to-do/east-village");
    expect(findAreaHub("East Village")?.href).toBe("/things-to-do/east-village");
    expect(findAreaHub("valley-junction")?.href).toBe("/neighborhoods/west-des-moines");
    expect(findAreaHub("Ankeny")?.href).toBe("/neighborhoods/ankeny");
    expect(findAreaHub("sherman-hill")).toBeUndefined();
    expect(findAreaHub("Des Moines")).toBeUndefined();
    expect(findAreaHub(null)).toBeUndefined();
  });
});

describe("areaHubForPageDimensions", () => {
  const loc = (slug: string) => ({ dimension: "location", slug });
  it("finds the area of a things-to-do area page or a location guide", () => {
    expect(areaHubForPageDimensions([{ dimension: "content_type", slug: "things-to-do" }, loc("east-village")])?.key).toBe(
      "east-village",
    );
    expect(areaHubForPageDimensions([loc("ankeny")])?.key).toBe("ankeny");
    expect(areaHubForPageDimensions([loc("downtown")])?.href).toBe("/things-to-do/downtown");
  });

  it("leaves out pages that narrow the area, and areas with no page", () => {
    expect(areaHubForPageDimensions([{ dimension: "cuisine", slug: "mexican" }, loc("ankeny")])).toBeUndefined();
    expect(areaHubForPageDimensions([{ dimension: "season", slug: "fall" }, loc("ankeny")])).toBeUndefined();
    expect(areaHubForPageDimensions([{ dimension: "cuisine", slug: "asian" }])).toBeUndefined();
    expect(areaHubForPageDimensions([loc("sherman-hill")])).toBeUndefined();
  });
});

describe("AREA_HUBS hrefs", () => {
  // A link here renders on every article and restaurant page that names the
  // area, so a dead or redirecting href would repeat across hundreds of pages.
  it("every href is a page we serve: a prerendered neighbourhood or a sitemapped pSEO page, never a 301", () => {
    const redirects = readFileSync("public/_redirects", "utf8");
    const pseoSitemap = readFileSync("public/sitemap-pseo.xml", "utf8");
    const staticSitemap = readFileSync("public/sitemap-static.xml", "utf8");
    for (const hub of AREA_HUBS) {
      const redirected = new RegExp(`^${hub.href.replace(/[/-]/g, "\\$&")}\\s`, "m").test(redirects);
      expect(redirected, `${hub.href} is the source of a redirect`).toBe(false);
      const listed =
        pseoSitemap.includes(`desmoinesinsider.com${hub.href}<`) ||
        staticSitemap.includes(`desmoinesinsider.com${hub.href}<`);
      expect(listed, `${hub.href} is in no sitemap`).toBe(true);
    }
  });
});
