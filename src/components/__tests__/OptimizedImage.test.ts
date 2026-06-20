import { describe, it, expect } from "vitest";
import { canTransform, getTransformedUrl } from "@/components/OptimizedImage";

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
});
