/**
 * Count a version-check call in public.app_version_checks (migration
 * 20261020000001). See that migration for why the count exists.
 *
 * Two rules:
 *   1. It never affects the answer. The apps fail open on any version-check
 *      error, so a recording failure that turned into a 500 would silently
 *      switch the force-update gate off. recordVersionCheck never throws and
 *      the caller does not await it on the response path.
 *   2. It never records junk. A version that does not look like 1.2.3 is
 *      skipped here, and the table's CHECK refuses it anyway.
 *
 * Plain fetch to PostgREST rather than supabase-js, so the test can hand in a
 * fake fetch and nothing here needs the network.
 */

export const VERSION_PATTERN = /^[0-9]{1,4}(\.[0-9]{1,4}){0,3}$/;

/** The version to record, or null when it is not a plain dotted number. */
export function recordableVersion(version: string): string | null {
  const v = String(version ?? "").trim();
  return VERSION_PATTERN.test(v) ? v : null;
}

export interface RecordResult {
  ok: boolean;
  reason?: string;
}

export interface RecordDeps {
  url?: string;
  serviceKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function recordVersionCheck(
  platform: "ios" | "android",
  version: string,
  deps: RecordDeps = {},
): Promise<RecordResult> {
  try {
    const v = recordableVersion(version);
    if (!v) return { ok: false, reason: "version is not a plain dotted number; not recorded" };
    const url = deps.url ?? Deno.env.get("SUPABASE_URL");
    const key = deps.serviceKey ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return { ok: false, reason: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set" };
    const doFetch = deps.fetchImpl ?? fetch;
    const res = await doFetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/record_version_check`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_platform: platform, p_version: v }),
      signal: AbortSignal.timeout(deps.timeoutMs ?? 3000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, reason: `record_version_check returned ${res.status}: ${body.slice(0, 200)}` };
    }
    await res.body?.cancel().catch(() => {});
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `record_version_check failed: ${String((err as Error)?.message ?? err).slice(0, 200)}` };
  }
}
