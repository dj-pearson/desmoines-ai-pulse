/**
 * instrument — lightweight per-invocation metrics for edge functions
 * (AOS-MAINT-007). Wrap a `Deno.serve` / `serve` handler:
 *
 *     serve(instrument("geocode-location", async (req) => { ... }));
 *
 * It times the handler, derives the HTTP status class (2xx/3xx/4xx/5xx), and
 * records a sampled row to `edge_function_metrics`. The 4xx vs 5xx split lets
 * the monitor separate user-caused errors from server regressions. It NEVER
 * alters the response and NEVER throws — a metrics hiccup can't break the
 * function. OPTIONS preflights are skipped (not real invocations).
 *
 * Sampling: EDGE_METRICS_SAMPLE_RATE (0..1, default 1). Lower it for hot
 * functions to cap write amplification.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type EdgeHandler = (req: Request) => Promise<Response> | Response;

// deno-lint-ignore no-explicit-any
let client: any = null;
function db() {
  if (client) return client;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  client = createClient(url, key);
  return client;
}

function statusClass(status: number): string {
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  if (status >= 300) return "3xx";
  if (status >= 200) return "2xx";
  return "other";
}

function sampleRate(): number {
  const raw = Number(Deno.env.get("EDGE_METRICS_SAMPLE_RATE"));
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.min(1, raw);
}

async function record(functionName: string, method: string, status: number, durationMs: number): Promise<void> {
  try {
    if (Math.random() > sampleRate()) return;
    const supabase = db();
    if (!supabase) return;
    await supabase.from("edge_function_metrics").insert({
      function_name: functionName,
      method,
      status_code: status,
      status_class: statusClass(status),
      duration_ms: durationMs,
    });
  } catch {
    // Best-effort — never surface a metrics error to the caller.
  }
}

export function instrument(functionName: string, handler: EdgeHandler): EdgeHandler {
  return async (req: Request): Promise<Response> => {
    const started = Date.now();
    if (req.method === "OPTIONS") return await handler(req); // skip preflight
    try {
      const res = await handler(req);
      // Fire-and-forget; don't add latency to the response path.
      void record(functionName, req.method, res.status, Date.now() - started);
      return res;
    } catch (err) {
      void record(functionName, req.method, 500, Date.now() - started);
      throw err;
    }
  };
}
