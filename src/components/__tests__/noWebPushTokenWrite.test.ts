import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * WEB-FEAT-020. Decision recorded: the web does not do push. Reminders are
 * email (useEventReminders -> event_reminders), and device tokens come only
 * from the native apps through register-device-token, which validates the
 * platform and writes with the service role.
 *
 * What was removed: src/hooks/usePushNotifications.ts. It registered with
 * APNs/FCM through window.Capacitor, but the repo has no @capacitor package,
 * no capacitor.config and no mobile Vite config, so isCapacitor() is never
 * true and none of it could run. Had it run, it would have failed anyway: it
 * upserted device_tokens with `token` and `is_active`, columns migration
 * 20261015000005 does not create. There was no pushManager.subscribe and no
 * VAPID key, so it was never Web Push either.
 *
 * These checks stop a second, unvalidated write path coming back. Building
 * real Web Push means a VAPID key, a service worker with push handlers (sw.js
 * self-destructs today) and a sender for web endpoints; that is a new story,
 * and it should register through register-device-token like iOS and Android.
 */

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__") continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("web push token path (WEB-FEAT-020)", () => {
  const files = sourceFiles("src");

  it("scans a real tree", () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it("no web code writes device_tokens directly", () => {
    const offenders = files.filter((f) =>
      /['"`]device_tokens['"`]/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("the dead Capacitor push hook stays deleted", () => {
    expect(existsSync("src/hooks/usePushNotifications.ts")).toBe(false);
    const importers = files.filter((f) =>
      readFileSync(f, "utf8").includes("usePushNotifications"),
    );
    expect(importers).toEqual([]);
  });
});
