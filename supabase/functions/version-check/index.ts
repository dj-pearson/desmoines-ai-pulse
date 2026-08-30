/**
 * version-check — launch-time minimum-supported-version gate (IOS-AUDIT-REL-001).
 *
 * The mobile apps call this on launch with their platform + version. It returns
 * whether the binary is still supported, whether an optional update exists, and
 * a force-upgrade payload the app renders as a blocking screen when the binary
 * is below the floor defined in `_shared/minSupportedVersions.ts`.
 *
 * Public, unauthenticated, pre-session (the app calls it before the user signs
 * in), so `verify_jwt = false` (see supabase/config.toml). It does no DB work
 * and takes no secrets — it only reads compile-time constants — so there is no
 * SSRF/cost surface. Rate-limited in-function as defense-in-depth.
 *
 * Request:
 *   POST { platform: 'ios' | 'android', version: string }   // e.g. "1.2.0"
 *   (GET is also accepted with ?platform=&version= for easy probing.)
 *
 * Response (200):
 *   {
 *     platform: 'ios' | 'android',
 *     currentVersion: string,
 *     minSupportedVersion: string,
 *     latestVersion: string,
 *     forceUpgrade: boolean,        // true → app must block until updated
 *     updateAvailable: boolean,     // true → optional update banner
 *     storeUrl: string,
 *     message: string,              // copy for the blocking screen
 *   }
 *
 * Backward-compat: additive only. Older binaries that never call this are
 * unaffected; newer binaries ignore unknown response keys.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { checkRateLimit, addRateLimitHeaders } from "../_shared/rateLimit.ts";
import {
  MIN_SUPPORTED_APP_VERSION,
  LATEST_APP_VERSION,
  isBelowMinimum,
  isUpdateAvailable,
  type MobilePlatform,
} from "../_shared/minSupportedVersions.ts";

const VALID_PLATFORMS: MobilePlatform[] = ["ios", "android"];

/**
 * The App Store numeric id, or the sentinel while App Store Connect has not
 * assigned one. TODO(REL): set this and the copy in
 * ios/DesMoinesInsiderClip/ClipRootView.swift together - they hold the same
 * fact and there is no link between them.
 */
const IOS_APP_STORE_ID = "0000000000";
const UNASSIGNED_APP_STORE_ID = "0000000000";
const WEBSITE_URL = "https://desmoinesinsider.com";

/**
 * GUARD THE SENTINEL RATHER THAN SHIPPING IT INSIDE A URL.
 *
 * This used to be the literal string
 * "https://apps.apple.com/app/des-moines-insider/id0000000000", which is a
 * well-formed URL pointing at a listing that does not exist. It is returned as
 * `storeUrl` and is the button on ForceUpdateView - the screen shown to a user
 * whose binary is below MIN_SUPPORTED_APP_VERSION and can do nothing else. So
 * the one escape from a blocking screen led nowhere.
 *
 * ClipRootView.swift:16-20 already holds the same sentinel and already handles
 * it: it compares against "0000000000" and falls back to the website so the CTA
 * always resolves. Same missing fact, two surfaces, and only one of them
 * degraded honestly. This is that check, applied here (IOS-AUDIT-FEAT-031).
 *
 * A website fallback is not as good as the listing. It is much better than a
 * dead link, and unlike a dead link it is obvious when the id is still unset.
 */
const STORE_URL: Record<MobilePlatform, string> = {
  ios:
    IOS_APP_STORE_ID === UNASSIGNED_APP_STORE_ID
      ? WEBSITE_URL
      : `https://apps.apple.com/app/des-moines-insider/id${IOS_APP_STORE_ID}`,
  android: "https://play.google.com/store/apps/details?id=com.desmoines.aipulse",
};

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const rl = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    max: 120,
    message: "Too many version checks. Please slow down.",
  });
  if (!rl.success && rl.response) return addRateLimitHeaders(rl.response, rl);

  // Accept body (POST) or query params (GET).
  let platformRaw = "";
  let version = "";
  if (req.method === "POST") {
    try {
      const payload = await req.json();
      platformRaw = String(payload?.platform ?? "").toLowerCase();
      version = String(payload?.version ?? "").trim();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
  } else {
    const url = new URL(req.url);
    platformRaw = (url.searchParams.get("platform") ?? "").toLowerCase();
    version = (url.searchParams.get("version") ?? "").trim();
  }

  if (!VALID_PLATFORMS.includes(platformRaw as MobilePlatform)) {
    return json({ error: "Valid platform required ('ios' or 'android')" }, 400);
  }
  const platform = platformRaw as MobilePlatform;

  if (!version) {
    return json({ error: "version is required" }, 400);
  }

  const forceUpgrade = isBelowMinimum(platform, version);
  const updateAvailable = isUpdateAvailable(platform, version);

  return json({
    platform,
    currentVersion: version,
    minSupportedVersion: MIN_SUPPORTED_APP_VERSION[platform],
    latestVersion: LATEST_APP_VERSION[platform],
    forceUpgrade,
    updateAvailable,
    storeUrl: STORE_URL[platform],
    message: forceUpgrade
      ? "This version of Des Moines Insider is no longer supported. Please update to keep using the app."
      : updateAvailable
      ? "A new version of Des Moines Insider is available."
      : "You're on the latest version.",
  });
});
