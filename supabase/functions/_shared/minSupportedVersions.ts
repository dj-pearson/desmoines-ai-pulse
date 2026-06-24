/**
 * Minimum-supported app versions per mobile platform (IOS-AUDIT-REL-001).
 *
 * This is the load-bearing constant the CLAUDE.md Backward-Compatibility policy
 * refers to: any data shape, edge function, or RPC that a binary
 * `>= MIN_SUPPORTED_APP_VERSION` still reads is load-bearing and cannot be
 * retired until this floor is raised above it (with a >= 2-week force-upgrade
 * window first).
 *
 * The `version-check` edge function returns these so the apps can show a
 * blocking upgrade screen for binaries below the floor. Bumping a floor here is
 * how you actually retire an old client — do it in a release that ships at least
 * two weeks BEFORE the destructive backend change that depends on it.
 *
 * Versions are dotted numeric strings (`major.minor.patch`) compared
 * left-to-right, numerically, by `compareVersions` below.
 */

export type MobilePlatform = "ios" | "android";

/**
 * The lowest version we still support per platform. Clients reporting a version
 * BELOW this are shown a blocking force-upgrade screen.
 *
 * Keep these conservative — raising a floor strands users on older binaries.
 */
export const MIN_SUPPORTED_APP_VERSION: Record<MobilePlatform, string> = {
  // Initial floor: the first store-submitted native build. No older native
  // binary exists in the wild, so nothing is stranded by this value.
  ios: "1.0.0",
  android: "1.0.0",
};

/**
 * The latest version available in each store. Used to tell a client an optional
 * (non-blocking) update is available. Update on each store release.
 */
export const LATEST_APP_VERSION: Record<MobilePlatform, string> = {
  ios: "1.2.0",
  android: "1.2.0",
};

/**
 * Compare two dotted numeric version strings.
 * @returns negative if a < b, 0 if equal, positive if a > b.
 *
 * Tolerant of differing segment counts ("1.2" == "1.2.0") and of non-numeric
 * junk (coerced to 0). Never throws — a malformed client version sorts as 0.0.0.
 */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split(".");
  const pb = String(b).split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = parseInt(pa[i] ?? "0", 10) || 0;
    const nb = parseInt(pb[i] ?? "0", 10) || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

/** Whether `version` is below the supported floor for `platform`. */
export function isBelowMinimum(platform: MobilePlatform, version: string): boolean {
  return compareVersions(version, MIN_SUPPORTED_APP_VERSION[platform]) < 0;
}

/** Whether a newer (optional) version is available for `platform`. */
export function isUpdateAvailable(platform: MobilePlatform, version: string): boolean {
  return compareVersions(version, LATEST_APP_VERSION[platform]) < 0;
}
