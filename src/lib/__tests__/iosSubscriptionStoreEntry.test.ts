import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * IOS-AUDIT-011. SubscriptionView is the StoreKit store. Shown to someone
 * whose plan is billed by Stripe (web) or Google Play, it sells them a second,
 * duplicate plan. Settings > Account > Subscription presented it to everyone;
 * it now presents PlansLinkView, which picks the store or the "billed through"
 * sheet with PlansLinkScreen.screen(tier:hasAppStoreSubscription:).
 *
 * This fails when a Swift file starts presenting SubscriptionView() directly
 * without being listed below with the reason a paid subscriber can't reach it.
 * Swift has no compiler in cloud sessions, so this reads the source.
 */

const APP_DIR = "ios/DesMoinesInsider";

/** Files allowed to construct SubscriptionView() directly, and why. */
const DIRECT_STORE_ALLOWED: Record<string, string> = {
  // The decision itself: .store case.
  "Views/Subscription/PlansLinkView.swift": "chooses store vs plan info",
  // Its own #Preview.
  "Views/Subscription/SubscriptionView.swift": "preview",
  // showSubscription is set only from freeUserCard and compactFreeCard; the
  // subscribed card opens PlanInfoSheet or App Store management.
  "Views/Components/SubscriptionBanner.swift": "free-user cards only",
};

function swiftFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return swiftFiles(path);
    return name.endsWith(".swift") ? [path] : [];
  });
}

describe("iOS shows the StoreKit store only where a paid web/Play subscriber can't reach it (IOS-AUDIT-011)", () => {
  const files = swiftFiles(APP_DIR);

  it("reads the app sources", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("constructs SubscriptionView() only in the listed files", () => {
    const direct = files
      .filter((f) => /\bSubscriptionView\(\)/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(APP_DIR.length + 1));
    expect(direct.filter((f) => !(f in DIRECT_STORE_ALLOWED))).toEqual([]);
    // A stale entry would quietly allow a future regression in that file.
    expect(Object.keys(DIRECT_STORE_ALLOWED).filter((f) => !direct.includes(f))).toEqual([]);
  });

  it("Settings > Subscription presents PlansLinkView", () => {
    const src = readFileSync(`${APP_DIR}/Views/Profile/SettingsView.swift`, "utf8");
    expect(src).toMatch(/\.sheet\(isPresented: \$showSubscription\)\s*\{[^}]*PlansLinkView\(\)/);
  });

  it("the banner opens the store only from its free-user cards", () => {
    const src = readFileSync(`${APP_DIR}/Views/Components/SubscriptionBanner.swift`, "utf8");
    const subscribed = src.match(/private var subscribedCard: some View \{[\s\S]*?\n {4}\}\n/);
    expect(subscribed, "subscribedCard not found").not.toBeNull();
    expect(subscribed![0]).not.toMatch(/showSubscription = true/);
    expect(subscribed![0]).toMatch(/showPlanInfo = true/);
  });
});
