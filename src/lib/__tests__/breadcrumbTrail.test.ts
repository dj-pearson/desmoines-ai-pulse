import { describe, it, expect } from "vitest";
import { breadcrumbListItems, withHome } from "@/lib/breadcrumbTrail";
import { BRAND } from "@/lib/brandConfig";

describe("breadcrumbTrail (WEB-SEO-048)", () => {
  it("puts Home first when the caller leaves it out", () => {
    expect(withHome([{ name: "Music", path: "/music" }]).map((c) => c.path)).toEqual(["/", "/music"]);
  });

  it("does not add a second Home", () => {
    const trail = withHome([
      { name: "Home", path: "/" },
      { name: "Sports", path: "/sports" },
    ]);
    expect(trail.filter((c) => c.path === "/")).toHaveLength(1);
  });

  it("numbers items from 1 and gives each an absolute brand URL", () => {
    const items = breadcrumbListItems([
      { name: "Stay", path: "/stay" },
      { name: "Casey's Center", path: "/music/venues/wells-fargo-arena" },
      { name: "Hotels nearby", path: "/stay/near/wells-fargo-arena" },
    ]);
    expect(items.map((i) => i.position)).toEqual([1, 2, 3, 4]);
    expect(items[0]).toEqual({ "@type": "ListItem", position: 1, name: "Home", item: `${BRAND.baseUrl}/` });
    expect(items[3].item).toBe(`${BRAND.baseUrl}/stay/near/wells-fargo-arena`);
    for (const item of items) expect(item.item.startsWith(`${BRAND.baseUrl}/`)).toBe(true);
  });
});
