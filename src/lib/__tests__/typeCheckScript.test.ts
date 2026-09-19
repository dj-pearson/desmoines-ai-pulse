import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * `npm run type-check` must read src/ (WEB-CI-030 AC2).
 *
 * WHAT IT USED TO BE. `tsc --noEmit`, against a root tsconfig that is
 * `"files": []` plus two project references. Without --build, tsc does not
 * follow references, so it compiled ZERO files and exited 0 on anything -
 * including an undefined identifier in a page component, reproduced here on
 * 2026-09-19 by adding one to src/pages/Auth.tsx and watching it pass.
 *
 * Two P1 crashes shipped through that exit code: /stay calling getCanonicalUrl
 * with no import, and useSocialFeatures returning a bare `loading` after an
 * unused-var autofix renamed the binding. Both are one-line TS2304/TS2552
 * errors the app project reports.
 *
 * A script named type-check that checks nothing is worse than no script,
 * because every workflow that runs it believes it did something. This test is
 * cheap and the thing it guards is not obvious from reading package.json.
 */
describe("the type-check script", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const script: string = pkg.scripts["type-check"];

  it("is not bare tsc against the root tsconfig", () => {
    // The exact no-op. `tsc --build --noEmit` would be fine; `tsc --noEmit` is
    // not, and the difference is one word.
    expect(script).not.toBe("tsc --noEmit");
    expect(script.replace(/\s+/g, " ").trim()).not.toMatch(/^tsc( -p \.\/?tsconfig\.json)? --noEmit$/);
  });

  it("reaches the app project", () => {
    const reachesApp =
      script.includes("type-check:app") ||
      script.includes("tsconfig.app.json") ||
      script.includes("--build");
    expect(reachesApp).toBe(true);
  });

  it("is still in the validate chain", () => {
    expect(pkg.scripts.validate).toContain("npm run type-check");
  });

  it("keeps the root tsconfig's shape on the record", () => {
    // If someone gives the root tsconfig real `files`/`include`, the reason
    // this test exists changes and it should be revisited rather than deleted.
    const root = JSON.parse(
      readFileSync("tsconfig.json", "utf8").replace(/^\s*\/\/.*$/gm, ""),
    );
    expect(root.files).toEqual([]);
    expect(root.references?.length).toBeGreaterThan(0);
  });
});
