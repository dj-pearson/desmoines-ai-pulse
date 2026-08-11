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
});
