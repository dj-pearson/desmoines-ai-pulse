import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

/**
 * IOS-AUDIT-010. iOS opens any first-party page it has no screen for in
 * SafariView inside the app. For /pricing that was Stripe Checkout for
 * Insider and VIP, reached from a push `url` or an article link, which App
 * Review rejects under Guideline 3.1.1. DeepLinkHandler.billingPaths sends
 * the web's billing pages to the native plans screen instead.
 *
 * This fails when a web page that starts a Stripe subscription checkout or
 * opens the Stripe billing portal is missing from billingPaths, or when
 * billingPaths names a path the web no longer routes.
 *
 * Swift cannot import TypeScript and there is no compiler in cloud sessions,
 * so this reads the Swift source. It parses only the shapes written today; if
 * either side is rewritten the parse finds nothing and the test fails.
 */

const APP = "src/App.tsx";
const DEEP_LINK = "ios/DesMoinesInsider/Services/DeepLinkHandler.swift";

/**
 * A page that calls one of these sells or manages a subscription through
 * Stripe: useSubscription's startCheckout (create-subscription-checkout) and
 * usePayments' openCustomerPortal (the Stripe portal).
 */
const BILLING_CALL = /\b(startCheckout|openCustomerPortal)\(/;

/**
 * Pages with a Stripe checkout that is not a reader's subscription. The
 * advertiser portal sells ad campaigns to businesses; iOS opens it in the
 * browser on purpose (PromoteListing.swift), so it is not a plans link.
 */
const NOT_A_SUBSCRIPTION = new Set(["advertise"]);

function billingPaths(): Set<string> {
  const src = readFileSync(DEEP_LINK, "utf8");
  const block = src.match(/static let billingPaths: Set<String> = \[([^\]]*)\]/);
  expect(block, "billingPaths literal not found").not.toBeNull();
  return new Set([...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

/** Route path (no leading slash) to the page file its element imports. */
function webRoutes(): Map<string, string> {
  const src = readFileSync(APP, "utf8");
  const imports = new Map<string, string>();
  for (const m of src.matchAll(/const (\w+) = lazyWithRetry\(\(\) => import\("\.\/pages\/([^"]+)"\)\)/g)) {
    imports.set(m[1], `src/pages/${m[2]}.tsx`);
  }
  const routes = new Map<string, string>();
  for (const m of src.matchAll(/<Route\s+path="\/([^"]*)"\s+element=\{([^\n]*)/g)) {
    const component = [...m[2].matchAll(/<(\w+)/g)]
      .map((c) => c[1])
      .find((name) => imports.has(name));
    if (component) routes.set(m[1], imports.get(component)!);
  }
  return routes;
}

describe("iOS opens the web's Stripe billing pages natively (IOS-AUDIT-010)", () => {
  const routes = webRoutes();
  const paths = billingPaths();

  it("parses both sides", () => {
    expect(routes.size).toBeGreaterThan(50);
    expect(paths.size).toBeGreaterThan(0);
  });

  it("lists every web page that starts a Stripe checkout or opens the portal", () => {
    const billing = [...routes]
      .filter(([path, file]) => !NOT_A_SUBSCRIPTION.has(path) && existsSync(file))
      .filter(([, file]) => BILLING_CALL.test(readFileSync(file, "utf8")))
      .map(([path]) => path);
    expect(billing).toEqual(expect.arrayContaining(["pricing", "subscription"]));
    expect(billing.filter((p) => !paths.has(p))).toEqual([]);
  });

  it("names only paths the web routes", () => {
    expect([...paths].filter((p) => !routes.has(p))).toEqual([]);
  });

  it("keeps the advertiser exemption a real route", () => {
    for (const p of NOT_A_SUBSCRIPTION) expect(routes.has(p), p).toBe(true);
  });
});
