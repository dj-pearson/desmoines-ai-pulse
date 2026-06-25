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

const STORE_URL: Record<MobilePlatform, string> = {
  // TODO(REL): replace the iOS numeric id once App Store Connect assigns it.
  ios: "https://apps.apple.com/app/des-moines-insider/id0000000000",
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
