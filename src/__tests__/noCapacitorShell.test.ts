import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * WEB-FEAT-039. The native apps are SwiftUI and Kotlin. The Capacitor shell
 * they replaced is gone from the repo: no @capacitor package, no
 * capacitor.config, no mobile Vite config. Nothing ever defines
 * window.Capacitor, so every branch on it is code that cannot run.
 *
 * Slice 1 deleted the shell runtime: CapacitorRuntime and its four hooks
 * (deep links, swipe-back, status bar, keyboard avoidance), the page
 * transition hook, and main.tsx's link interceptor, window.open override,
 * splash-screen hide and capacitor-app body class. This file keeps them gone
 * and ratchets the isCapacitor() branches that later slices remove.
 */

const DELETED = [
  "src/components/CapacitorRuntime.tsx",
  "src/hooks/useDeepLinks.ts",
  "src/hooks/useSwipeBack.ts",
  "src/hooks/useStatusBarStyle.ts",
  "src/hooks/useKeyboardAware.ts",
  "src/hooks/usePageTransition.ts",
] as const;

/**
 * Files that still branch on the shell. This list may only shrink: a file
 * that drops its last branch must come off it (the second case fails until it
 * does), and a file not on it may not start branching.
 */
const REMAINING_BRANCHES = [
  "src/components/AdBanner.tsx",
  "src/components/AffiliateAdBanner.tsx",
  "src/components/EnhancedHero.tsx",
  "src/components/EventQuickView.tsx",
  "src/components/Footer.tsx",
  "src/components/ImageViewer.tsx",
  "src/hooks/useNetworkStatus.ts",
  "src/lib/capacitorUtils.ts",
];

const SHELL_REFERENCE =
  /\bisCapacitor\s*\(|\bisMobileApp\s*\(|__MOBILE_APP__|\bwindow\.Capacitor\b|\(window as any\)\.Capacitor\b/;

/**
 * Source with comment lines dropped, so prose that names isCapacitor (the
 * WEB-QA-028 note in main.tsx, for one) does not count as a branch. Line-based
 * on purpose: a block-comment regex mis-pairs on strings such as "image/*".
 */
function codeOnly(path: string): string {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\/\*|\*|\{\s*\/\*)/.test(l))
    .join("\n");
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__") continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full.split("\\").join("/"));
    }
  }
  return out;
}

describe("Capacitor shell removal (WEB-FEAT-039)", () => {
  it.each(DELETED)("%s stays deleted", (path) => {
    expect(existsSync(path)).toBe(false);
  });

  it("App.tsx and main.tsx carry no shell code", () => {
    for (const path of ["src/App.tsx", "src/main.tsx"]) {
      const code = codeOnly(path);
      expect(code, path).not.toMatch(SHELL_REFERENCE);
      expect(code, path).not.toContain("CapacitorRuntime");
      expect(code, path).not.toContain("capacitorUtils");
      expect(code, path).not.toContain("SplashScreen");
    }
  });

  it("only files on the remaining list branch on the shell, and every listed file still does", () => {
    const branching = sourceFiles("src")
      .filter((f) => SHELL_REFERENCE.test(codeOnly(f)))
      .sort();
    expect(branching).toEqual([...REMAINING_BRANCHES].sort());
  });
});
