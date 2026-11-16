import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * IOS-AUDIT-PERF-029. CachedAsyncImage renders a 12x12 blur-up thumbnail for
 * every image it loads from the network. In a list row of 80 pt or less that
 * blur is on screen for the length of a disk write and cannot be seen, but the
 * UIGraphicsImageRenderer pass still runs once per row on a cold cache. Those
 * call sites pass `blurUp: false`; hero and card images keep the effect.
 *
 * This fails when a CachedAsyncImage with a fixed frame of 80 pt or less on
 * both sides renders the blur, or when one without such a frame opts out (a
 * hero losing its effect). Swift has no compiler in cloud sessions, so this
 * reads the source.
 */

const APP_DIR = "ios/DesMoinesInsider";
const COMPONENT = "Views/Components/CachedAsyncImage.swift";
const MAX_SIDE = 80;

function swiftFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return swiftFiles(path);
    return name.endsWith(".swift") ? [path] : [];
  });
}

interface CallSite {
  where: string;
  optsOut: boolean;
  /** Larger side of the first fixed `.frame(width:height:)` on the view, if any. */
  side: number | null;
}

/**
 * Each `CachedAsyncImage(` call with the first modifier chain after it. The
 * chain is read up to the next blank line, the next CachedAsyncImage, or 15
 * lines, whichever comes first; a `.frame` past that is not this image's.
 */
function callSites(file: string, src: string): CallSite[] {
  const lines = src.split("\n");
  const sites: CallSite[] = [];
  lines.forEach((line, i) => {
    if (!/\bCachedAsyncImage\(/.test(line)) return;
    let side: number | null = null;
    for (let j = i + 1; j < Math.min(lines.length, i + 16); j++) {
      const next = lines[j];
      if (next.trim() === "" || /\bCachedAsyncImage\(/.test(next)) break;
      const frame = next.match(/\.frame\(width:\s*(\d+),\s*height:\s*(\d+)\)/);
      if (frame) {
        side = Math.max(Number(frame[1]), Number(frame[2]));
        break;
      }
    }
    sites.push({ where: `${file}:${i + 1}`, optsOut: /blurUp:\s*false/.test(line), side });
  });
  return sites;
}

describe("iOS list thumbnails skip the blur-up render (IOS-AUDIT-PERF-029)", () => {
  const sites = swiftFiles(APP_DIR)
    .filter((f) => !f.endsWith(COMPONENT))
    .flatMap((f) => callSites(f.slice(APP_DIR.length + 1), readFileSync(f, "utf8")));

  it("reads the call sites", () => {
    expect(sites.length).toBeGreaterThan(15);
    expect(sites.filter((s) => s.optsOut).length).toBeGreaterThan(0);
  });

  it("every CachedAsyncImage framed at 80 pt or less passes blurUp: false", () => {
    const small = sites.filter((s) => s.side !== null && s.side <= MAX_SIDE);
    expect(small.filter((s) => !s.optsOut).map((s) => s.where)).toEqual([]);
  });

  it("no larger or unframed image opts out, so heroes keep the effect", () => {
    const large = sites.filter((s) => s.side === null || s.side > MAX_SIDE);
    expect(large.filter((s) => s.optsOut).map((s) => s.where)).toEqual([]);
  });

  it("the component skips the render when blurUp is false and keeps 80 pt as the rule", () => {
    const src = readFileSync(`${APP_DIR}/${COMPONENT}`, "utf8");
    expect(src).toMatch(/var blurUp: Bool = true/);
    expect(src).toMatch(/static let listThumbnailMaxSide: CGFloat = 80\b/);
    expect(src).toMatch(/enabled \? make\(from: image\) : nil/);
    // The opt-out reaches the detached decode task, where the render happens.
    expect(src).toMatch(/let wantsBlurUp = blurUp/);
    expect(src).toMatch(/BlurUpThumbnail\.make\(from: decoded, enabled: wantsBlurUp\)/);
  });

  it("reads frames the way the call sites write them", () => {
    const src = [
      "CachedAsyncImage(url: a, blurUp: false) {",
      "    Color.red",
      "}",
      ".frame(width: 56, height: 56)",
      "",
      "CachedAsyncImage(url: b) {",
      "}",
      ".frame(width: 200, height: 120)",
      "",
      "CachedAsyncImage(url: c)",
      "    .scaledToFill()",
    ].join("\n");
    expect(callSites("x", src)).toEqual([
      { where: "x:1", optsOut: true, side: 56 },
      { where: "x:6", optsOut: false, side: 200 },
      { where: "x:10", optsOut: false, side: null },
    ]);
  });
});
