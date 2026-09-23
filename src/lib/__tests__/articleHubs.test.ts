import { describe, it, expect } from "vitest";
import { articleMatchesHub, hubsForArticle } from "@/lib/articleHubs";

describe("hubsForArticle", () => {
  it("sends the patio guide to restaurants", () => {
    const hrefs = hubsForArticle({ title: "The Ultimate Des Moines Patio Guide", category: "Food & Drink" }).map((h) => h.href);
    expect(hrefs).toContain("/restaurants");
    expect(hrefs).not.toContain("/events/kids");
  });

  it("sends the pumpkin patch guide to family and outdoors", () => {
    const hrefs = hubsForArticle({ title: "Best Pumpkin Patches Near Des Moines", tags: ["fall", "orchards"] }).map((h) => h.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/events/kids", "/outdoors"]));
  });

  it("always ends with the things-to-do hub, even when nothing matches", () => {
    expect(hubsForArticle({ title: "A Note From Us" })).toEqual([{ href: "/things-to-do", title: "Things to do in Des Moines" }]);
  });

  it("matches whole words only", () => {
    expect(articleMatchesHub({ title: "Barbershops of Beaverdale" }, "restaurants")).toBe(false);
    expect(articleMatchesHub({ title: "Parkview Heights history" }, "outdoors")).toBe(false);
  });
});
