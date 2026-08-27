import { describe, it, expect } from "vitest";
import {
  canTransform,
  generateTransformedSrcSet,
  getTransformedUrl,
} from "@/components/OptimizedImage";

// WEB-PERF-004: only Supabase Storage URLs are server-side resizable; external
// URLs must serve unchanged (the image-transform edge function doesn't resize,
// so routing them through it would add a hop for zero byte savings).
describe("OptimizedImage transform helpers", () => {
  const storageUrl =
    "https://abc.supabase.co/storage/v1/object/public/images/photo.jpg";
  const externalUrl = "https://example.com/photo.jpg";

  describe("canTransform", () => {
    it("recognizes Supabase Storage URLs", () => {
      expect(canTransform(storageUrl)).toBe(true);
    });

    it("rejects external URLs", () => {
      expect(canTransform(externalUrl)).toBe(false);
    });
  });

  describe("getTransformedUrl", () => {
    it("rewrites storage URLs to the native render endpoint with sizing params", () => {
      const out = getTransformedUrl(storageUrl, {
        width: 640,
        format: "webp",
        quality: 80,
      });
      expect(out).toContain("/storage/v1/render/image/public/");
      expect(out).not.toContain("/storage/v1/object/public/");
      expect(out).toContain("width=640");
      expect(out).toContain("format=webp");
      expect(out).toContain("quality=80");
    });

    it("returns external URLs unchanged (no transform applied)", () => {
      expect(getTransformedUrl(externalUrl, { width: 640 })).toBe(externalUrl);
    });
  });

  describe("generateTransformedSrcSet", () => {
    it("offers one distinct rendition per requested width", () => {
      const srcSet = generateTransformedSrcSet(storageUrl, [320, 640], "webp", 80);
      const candidates = srcSet!.split(", ");

      expect(candidates).toHaveLength(2);
      // The descriptor has to match the width actually requested of the
      // renderer, or the browser sizes from a number the file does not honour.
      expect(candidates[0]).toContain("width=320");
      expect(candidates[0]).toMatch(/ 320w$/);
      expect(candidates[1]).toContain("width=640");
      expect(candidates[1]).toMatch(/ 640w$/);
      // The bug this replaces: seven candidates that were the same full-size
      // object URL under seven different `w` descriptors.
      expect(new Set(candidates.map((c) => c.split(" ")[0])).size).toBe(2);
    });

    it("emits nothing for a source that cannot be resized", () => {
      // Not a cosmetic choice. A srcset whose candidates are all the same file
      // tells the browser it has a choice of sizes it does not have, so it
      // picks the "smallest" and downloads the original anyway.
      expect(generateTransformedSrcSet(externalUrl, [320, 640])).toBeUndefined();
    });
  });
// WEB-PERF-004, round two. repoint-media-urls.ts moved 674 rows off
// supabase.co and onto our own /media/ route, and canTransform stopped
// recognising any of them - so every one served its full-size original again.
// Measured on a real object the day it happened: 1,011,030 B via /media/
// against 398,847 B for the same image at width=640. Same bytes as the bug this
// file was written for, reached by a different road.
describe("own /media/ route (WEB-PERF-004 round two)", () => {
  const mediaAbs = `${window.location.origin}/media/events/abc/hero.png`;
  const mediaRel = "/media/events/abc/hero.png";
  // A real site that happens to use /media/ as a path. Not ours, not resizable.
  const foreignMedia = "https://example.com/media/events/abc/hero.png";

  it("recognizes our own absolute /media/ URLs", () => {
    expect(canTransform(mediaAbs)).toBe(true);
  });

  it("recognizes relative /media/ URLs", () => {
    expect(canTransform(mediaRel)).toBe(true);
  });

  // The counter-assertion that makes the two above mean something: matching on
  // the path alone would call this transformable and emit a srcset of identical
  // URLs, which is worse than emitting none.
  it("rejects a /media/ path on someone else's origin", () => {
    expect(canTransform(foreignMedia)).toBe(false);
  });

  it("appends sizing params without touching the path", () => {
    const out = getTransformedUrl(mediaAbs, { width: 640, format: "webp", quality: 80 });
    expect(out).toContain("/media/events/abc/hero.png");
    expect(out).toContain("width=640");
    expect(out).toContain("format=webp");
    expect(out).toContain("quality=80");
    // The route decides between object/ and render/; the client must not guess.
    expect(out).not.toContain("/storage/v1/");
  });

  it("keeps a relative URL relative", () => {
    const out = getTransformedUrl(mediaRel, { width: 320 });
    expect(out.startsWith("/media/events/abc/hero.png?")).toBe(true);
    expect(out).toContain("width=320");
  });

  it("emits a real srcset with distinct widths, not seven identical URLs", () => {
    const set = generateTransformedSrcSet(mediaAbs, [320, 640, 1024], "webp", 80);
    expect(set).toBeDefined();
    const urls = set!.split(", ").map((c) => c.split(" ")[0]);
    expect(new Set(urls).size).toBe(3);
    expect(set).toContain("320w");
    expect(set).toContain("1024w");
  });

  it("returns no srcset for a foreign /media/ URL", () => {
    expect(generateTransformedSrcSet(foreignMedia, [320, 640])).toBeUndefined();
  });
});
});
