import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The site registers NO service worker, and says so in one place
 * (WEB-QUAL-014).
 *
 * It used to say so in three, one of which was named registerServiceWorker()
 * and called under the comment "Priority 3: Service worker (after 5 seconds)".
 * Anyone reading that call site concluded the opposite of what ran. These
 * assertions are source-text because the behaviour is browser-API teardown
 * that jsdom cannot meaningfully execute - what is worth pinning is which
 * files claim to do it.
 */
describe("service-worker teardown", () => {
  /**
   * COMMENTS ARE STRIPPED BEFORE MATCHING. Both files now carry a comment
   * explaining what was removed, and those comments name
   * registerServiceWorker() - so a check for the call matched the prose
   * describing its deletion. This is the third time in this session a check
   * has fired on the text explaining it; expect it rather than rediscover it.
   */
  const codeOnly = (path: string) =>
    readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/(?<!:)\/\/.*$/, ""))
      .join("\n");

  const indexHtml = readFileSync("index.html", "utf8");
  const lazyInit = codeOnly("src/lib/lazyInit.ts");
  const performance = codeOnly("src/lib/performance.ts");
  const sw = readFileSync("public/sw.js", "utf8");

  it("index.html still tears down any worker a returning client arrives with", () => {
    // The layer that must not be removed by this cleanup: it is the only one
    // that runs on an ordinary page load.
    expect(indexHtml).toContain("navigator.serviceWorker.getRegistrations()");
    expect(indexHtml).toContain("reg.unregister()");
    expect(indexHtml).toContain("caches.delete(cacheName)");
  });

  it("public/sw.js still self-destructs for clients that fetch it", () => {
    // Reached by the browser's own update check for sw.js rather than by
    // loading the page, so it is NOT redundant with the inline script.
    expect(sw).toContain("self.registration.unregister()");
  });

  it("lazyInit no longer schedules a duplicate teardown", () => {
    // It ran five seconds after the inline script had already finished the
    // same work in the same document.
    expect(lazyInit).not.toMatch(/registerServiceWorker\s*\(\s*\)/);
    expect(lazyInit).not.toContain("navigator.serviceWorker.getRegistrations");
  });

  it("performance.ts exports nothing that touches service workers", () => {
    // The dead-twin failure: a function whose name states the opposite of its
    // body. Deleted rather than renamed, because it was also redundant.
    expect(performance).not.toMatch(/export const registerServiceWorker/);
    expect(performance).not.toMatch(/export\s+(const|function)\s+\w*[sS]erviceWorker/);
  });

  it("nothing in src/ registers a worker", () => {
    // The question the story opens with - "does this site use a service
    // worker?" - now has one answer in the code.
    for (const source of [lazyInit, performance]) {
      expect(source).not.toMatch(/serviceWorker\.register\s*\(/);
    }
  });
});
