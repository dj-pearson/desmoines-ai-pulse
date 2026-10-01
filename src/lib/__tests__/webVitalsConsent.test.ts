import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * WEB-PERF-039. Two halves of the same story.
 *
 * AC2 asked for a decision: point the RUM endpoint at something real, or delete
 * the branch. It is deleted, because the real thing already exists - the live
 * reporter is src/lib/webVitals.ts writing the web_vitals table, started from
 * main.tsx on idle, and the admin panel reads the weekly rollup of that table.
 * What was broken was a SECOND reporter in useWebVitals.ts POSTing to
 * '/api/performance-metrics', a route functions/ has never held.
 *
 * AC3 asked for a consent gate on the survivor. These beacons are first-party
 * and anonymous, but the banner offers an analytics category and a visitor can
 * decline it, so they now wait for the same grant GA waits for.
 */

let thenSubscribed = false;
const insert = vi.fn(() => ({
  // A PostgrestBuilder does nothing until something calls .then() on it. The
  // stub mirrors that, so a caller that drops the builder on the floor is
  // visible here as thenSubscribed staying false.
  then(onOk?: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) {
    thenSubscribed = true;
    return Promise.resolve({ data: null, error: null }).then(onOk, onErr);
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert }) },
}));

const onLCP = vi.fn();
vi.mock("web-vitals", () => ({
  onLCP: (cb: unknown) => onLCP(cb),
  onCLS: vi.fn(),
  onINP: vi.fn(),
  onTTFB: vi.fn(),
}));

const granted = vi.fn(() => true);
vi.mock("@/lib/analyticsConsent", () => ({
  analyticsGranted: () => granted(),
}));

async function freshInit() {
  vi.resetModules();
  const mod = await import("@/lib/webVitals");
  return mod.initWebVitals;
}

/** The library import is dynamic, so the subscription lands a microtask later. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("initWebVitals consent gate", () => {
  beforeEach(() => {
    insert.mockClear();
    onLCP.mockClear();
    thenSubscribed = false;
    granted.mockReturnValue(true);
    // SAMPLE_RATE is 0.2; a fixed 0 keeps every test in the sampled branch.
    vi.spyOn(Math, "random").mockReturnValue(0);
    Object.defineProperty(navigator, "doNotTrack", { value: "0", configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("subscribes when analytics consent is granted", async () => {
    const init = await freshInit();
    init();
    await settle();
    expect(onLCP).toHaveBeenCalled();
  });

  it("subscribes to nothing when consent is absent or refused", async () => {
    granted.mockReturnValue(false);
    const init = await freshInit();
    init();
    await settle();
    expect(onLCP).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("starts measuring on the SAME page load when consent is granted later", async () => {
    // A first-time visitor accepts the banner. Without the re-entry they are
    // measured from their next page load, which is the load least like the one
    // that matters.
    granted.mockReturnValue(false);
    const init = await freshInit();
    init();
    await settle();
    expect(onLCP).not.toHaveBeenCalled();

    granted.mockReturnValue(true);
    window.dispatchEvent(new CustomEvent("cookie-consent-changed"));
    await settle();
    expect(onLCP).toHaveBeenCalled();
  });

  it("stays off after a refusal, and can still start on a later acceptance", async () => {
    granted.mockReturnValue(false);
    const init = await freshInit();
    init();
    await settle();

    window.dispatchEvent(new CustomEvent("cookie-consent-changed"));
    await settle();
    expect(onLCP, "a refusal must not start it").not.toHaveBeenCalled();

    granted.mockReturnValue(true);
    window.dispatchEvent(new CustomEvent("cookie-consent-changed"));
    await settle();
    expect(onLCP, "a later acceptance must still be honoured").toHaveBeenCalled();
  });

  it("actually issues the insert - a PostgrestBuilder is a thenable, not a promise", async () => {
    // This is the defect that made the table empty. `void supabase.from(...)
    // .insert({...})` evaluates the builder and discards it WITHOUT
    // subscribing, so no request is ever issued and nothing throws. Measured in
    // a browser: TTFB fired, zero requests left the page. The mock's insert()
    // returns a thenable here for the same reason, so a return to `void` fails.
    const init = await freshInit();
    init();
    await settle();
    const report = onLCP.mock.calls[0]?.[0] as ((m: unknown) => void) | undefined;
    expect(report, "onLCP should have been handed a reporter").toBeTypeOf("function");
    report!({ name: "LCP", value: 1234, rating: "good" });
    await settle();
    expect(insert).toHaveBeenCalledTimes(1);
    expect(thenSubscribed, "the builder must be subscribed to, or no request is sent").toBe(true);
  });

  it("refuses on Do-Not-Track even with consent granted", async () => {
    Object.defineProperty(navigator, "doNotTrack", { value: "1", configurable: true });
    const init = await freshInit();
    init();
    await settle();
    expect(onLCP).not.toHaveBeenCalled();
  });
});

/**
 * Both files EXPLAIN the deletion in a comment that names the dead path, so a
 * bare substring match fails on the prose describing the fix - which is how
 * the first run of this test failed. Comments are stripped first; the URL-safe
 * lookbehind keeps `https://` from truncating a line.
 */
function codeOnly(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(?<!:)\/\/.*$/, ""))
    .join("\n");
}

describe("the endpoint that never existed", () => {
  it("is gone from performanceConfig", () => {
    const config = codeOnly("src/lib/performanceConfig.ts");
    expect(config).not.toContain("/api/performance-metrics");
    expect(config).not.toMatch(/^\s*endpoint:/m);
  });

  it("is not fetched from useWebVitals", () => {
    const hook = codeOnly("src/hooks/useWebVitals.ts");
    expect(hook).not.toMatch(/fetch\(\s*webVitalsConfig\.rumConfig\.endpoint/);
    expect(hook).not.toContain("/api/performance-metrics");
  });

  it("has no route in functions/ either, which is why it was deleted", () => {
    // If somebody later builds the ingest route, this test is the thing that
    // says the decision changed - it fails, and the deletion above is revisited
    // deliberately rather than by a second reporter appearing.
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const entries = readdirSync("functions");
    expect(entries).not.toContain("api");
  });
});
