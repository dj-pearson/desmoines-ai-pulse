import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * WEB-PERF-038. main.tsx uses createRoot on purpose, against the obvious
 * instinct that a prerendered page should be hydrated.
 *
 * hydrateRoot was measured and was worse: same LCP and FCP, +156ms TBT, and it
 * discarded the prerendered tree anyway after eight React #418 mismatches. The
 * numbers and the two causes are written at the call site.
 *
 * This test exists because the change is a one-word edit that looks like a free
 * win, and the evidence that it is not lives in a comment. A comment does not
 * fail a build.
 */
const MAIN = "src/main.tsx";

function codeOnly(source: string): string {
  // Strip comments first: the block above the call site names hydrateRoot
  // eight times while explaining why it is not used.
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");
}

describe("the root render mode", () => {
  const source = readFileSync(MAIN, "utf8");
  const code = codeOnly(source);

  it("mounts with createRoot", () => {
    expect(code).toMatch(/\bcreateRoot\s*\(\s*rootElement\s*\)/);
  });

  it("does not hydrate", () => {
    expect(code).not.toContain("hydrateRoot");
  });

  it("keeps the measurement that justifies it", () => {
    // Not a style rule. Someone re-running this comparison needs to know what
    // the last numbers were and on what profile, or they will re-derive it.
    expect(source).toContain("WEB-PERF-038");
    expect(source).toContain("4x CPU throttle");
    expect(source).toMatch(/createRoot\s+1552ms/);
    expect(source).toMatch(/hydrateRoot\s+1552ms/);
  });

  it("names the reproduction", () => {
    expect(source).toContain("scripts/measure-vitals.mjs");
  });
});
