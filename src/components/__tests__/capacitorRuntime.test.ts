import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * WEB-PERF-020 AC4. Five hooks do nothing outside the Capacitor shell -
 * push registration, deep links, swipe-back, status-bar style, keyboard
 * avoidance - and each one opens with `if (!isCapacitor()) return;`. Called
 * straight from the app shell they still shipped 10.4 KB in the entry chunk to
 * every web visitor.
 *
 * They live in CapacitorRuntime now, mounted behind isCapacitor() and a lazy
 * import. Two halves have to stay true and neither is obvious from reading
 * either file alone: the component must call every hook, and App.tsx must not
 * call any of them directly again - one direct call and the whole chunk is
 * back in the entry with nothing failing.
 */
const HOOKS = [
  "usePushNotifications",
  "useDeepLinks",
  "useSwipeBack",
  "useStatusBarStyle",
  "useKeyboardAware",
] as const;

function codeOnly(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(?<!:)\/\/.*$/, ""))
    .join("\n");
}

describe("CapacitorRuntime", () => {
  const runtime = codeOnly("src/components/CapacitorRuntime.tsx");
  const app = codeOnly("src/App.tsx");

  it.each(HOOKS)("calls %s", (hook) => {
    expect(runtime).toContain(`${hook}()`);
  });

  it.each(HOOKS)("is the only caller of %s - App.tsx must not call it", (hook) => {
    expect(app).not.toContain(`${hook}()`);
  });

  it("is imported lazily, not statically", () => {
    expect(app).toMatch(/lazyWithRetry\(\(\)\s*=>\s*import\("@\/components\/CapacitorRuntime"\)\)/);
    expect(app).not.toMatch(/^import .*CapacitorRuntime/m);
  });

  it("is mounted behind isCapacitor()", () => {
    // Without the guard the chunk is fetched by every web visitor, which is
    // the cost this whole arrangement exists to avoid.
    expect(app).toMatch(/isCapacitor\(\)\s*&&\s*\(\s*<Suspense[\s\S]{0,200}<CapacitorRuntime\s*\/>/);
  });

  it("renders nothing - it exists for its effects", () => {
    expect(runtime).toMatch(/return null;/);
  });
});
