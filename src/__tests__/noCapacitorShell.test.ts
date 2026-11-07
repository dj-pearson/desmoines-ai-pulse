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
 * splash-screen hide and capacitor-app body class.
 *
 * Slice 2 removed every isCapacitor()/isMobileApp() branch (keeping the web
 * arm of each), the detection helpers and plugin types in capacitorUtils, the
 * no-op hapticTap and its five callers, the unused nativeShare/getPlatform,
 * and ImageViewer, which nothing rendered and which only opened in the shell.
 *
 * Slice 3 removed what the body class used to switch on: about 320 lines of
 * .capacitor-app / .cap-page-enter / .keyboard-visible rules in index.css,
 * and the isCapacitor arm of the early error handler in index.html (its CSP
 * hash in public/_headers re-pinned; check-csp-hashes guards that).
 * This file keeps all of it gone.
 */

const DELETED = [
  "src/components/CapacitorRuntime.tsx",
  "src/hooks/useDeepLinks.ts",
  "src/hooks/useSwipeBack.ts",
  "src/hooks/useStatusBarStyle.ts",
  "src/hooks/useKeyboardAware.ts",
  "src/hooks/usePageTransition.ts",
  "src/components/ImageViewer.tsx",
] as const;

/** Shell exports capacitorUtils no longer has, and nothing may bring back. */
const DELETED_EXPORTS = ["isCapacitor", "isMobileApp", "getPlatform", "nativeShare", "hapticTap"] as const;

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

  it("no source file branches on the shell", () => {
    const branching = sourceFiles("src").filter((f) => SHELL_REFERENCE.test(codeOnly(f)));
    expect(branching).toEqual([]);
  });

  it.each(DELETED_EXPORTS)("capacitorUtils does not export %s", (name) => {
    const code = codeOnly("src/lib/capacitorUtils.ts");
    expect(code).not.toMatch(new RegExp(`\\bexport\\s+(async\\s+)?function\\s+${name}\\b`));
  });

  it("capacitorUtils keeps the web helpers other code imports", () => {
    const code = codeOnly("src/lib/capacitorUtils.ts");
    for (const name of ["toSafeExternalUrl", "openExternalUrl", "shareWithOutcome"]) {
      expect(code, name).toMatch(new RegExp(`\\bexport\\s+(async\\s+)?function\\s+${name}\\b`));
    }
  });

  it("index.css has no rules for the shell's classes", () => {
    const css = readFileSync("src/index.css", "utf8");
    expect(css).not.toMatch(/\.capacitor-app\b|\.cap-page-enter\b|\.keyboard-visible\b|@keyframes\s+cap-/);
  });

  it("index.html's inline scripts do not look for window.Capacitor", () => {
    expect(readFileSync("index.html", "utf8")).not.toMatch(/\bCapacitor\b/);
  });
});
