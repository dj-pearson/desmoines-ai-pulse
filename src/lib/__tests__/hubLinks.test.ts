import { describe, it, expect } from "vitest";
import { resolveHubLink } from "@/lib/hubLinks";

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
