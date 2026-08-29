/**
 * DMI-011 — the one door the hub hands extracted events through.
 *
 * WHY AN ENDPOINT AND NOT A DIRECT WRITE. The hub could hold a service_role key
 * and insert into `events` itself. It must not. A service_role JWT bypasses RLS
 * on every table in the project, four of this portfolio's repos already carry
 * committed ones, and adding a fifth process that holds one is the wrong
 * direction. So the hub holds a SCOPED API KEY, this function holds the
 * database, and `SUPABASE_SERVICE_ROLE_KEY_DESMOINESPULSE` — the hub's name for
 * that credential — appears nowhere in either codebase. A test asserts it.
 *
 * ONE WRITER, ONE DEDUP. This function and `firecrawl-scraper` both import
 * `_shared/eventDedup.ts` and `_shared/eventDateTime.ts`. There is no dedup
 * logic and no timezone arithmetic in this file, because a second copy of
 * either is how the same show reaches a public page twice, or an hour out.
 *
 * IT ONLY INSERTS. `updated` is in the response because the shape is shared
 * with the cloud path, and it is a REAL zero here rather than a placeholder:
 * this producer never updates an existing row. Enriching somebody else's row
 * from a second producer is a different decision and nobody has made it.
 *
 * REJECTIONS ARE ITEMIZED, NEVER ONLY COUNTED. "4 rejected" tells an operator
 * nothing they can act on; "4 rejected, all for an unparseable date, here they
 * are" tells them the extraction prompt is drifting. Every rejection carries
 * the item and a named reason.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import {
  generateEventFingerprint,
  type ExistingEvent,
} from "../_shared/eventDedup.ts";
import { planIngest, type IncomingItem, type Provenance } from "./plan.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

/** How far back existing rows are loaded for duplicate detection. Matches what
 *  the cloud path uses, so the two producers see the same window. */
const DEDUP_WINDOW_DAYS = 60;

/** A single request may not write more than this. Not a rate limit — a blast
 *  radius. The hub sends six sources' worth of events; a payload an order of
 *  magnitude larger is a bug somewhere upstream, and finding out by writing it
 *  is the expensive way. */
const MAX_ITEMS = 500;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  let body: { source?: string; items?: IncomingItem[]; provenance?: Provenance };
  try {
    body = await req.json();
  } catch {
    return json({ error: "body is not valid JSON" }, 400);
  }

  const source = typeof body.source === "string" ? body.source.trim() : "";
  if (!source) return json({ error: "`source` is required — a batch with no source cannot be attributed" }, 400);

  const items = Array.isArray(body.items) ? body.items : null;
  if (!items) return json({ error: "`items` must be an array" }, 400);
  if (items.length > MAX_ITEMS) {
    return json({ error: `payload holds ${items.length} items, over the ${MAX_ITEMS} cap. Refused whole rather than truncated — a partial write reported as success is worse than a refusal.` }, 413);
  }

  const provenance: Provenance = body.provenance && typeof body.provenance === "object" ? body.provenance : {};
  const producedBy = typeof provenance.producedBy === "string" && provenance.producedBy.trim()
    ? provenance.producedBy.trim().substring(0, 60)
    : null;
  const renderProvider = typeof provenance.renderProvider === "string" && provenance.renderProvider.trim()
    ? provenance.renderProvider.trim().substring(0, 60)
    : null;
  // Provenance is REQUIRED, because the column exists to make the cost claim
  // falsifiable and a null written by a producer that simply forgot is
  // indistinguishable from a row that predates the column.
  if (!producedBy || !renderProvider) {
    return json({ error: "`provenance.producedBy` and `provenance.renderProvider` are both required — a row with no provenance cannot be told apart from one written before provenance existed" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return json({ error: "the function is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const since = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const { data: existingRows, error: readError } = await supabase
    .from("events")
    .select("id, title, date, venue, source_url")
    .gte("date", since.toISOString())
    .order("date", { ascending: false });

  // A FAILED READ REFUSES THE WRITE. Treating an unreadable existing set as an
  // empty one would make every dedup tier pass and duplicate the whole payload.
  if (readError) {
    return json({ error: `could not read existing events for duplicate detection, so nothing was written: ${readError.message}` }, 503);
  }

  const existing: ExistingEvent[] = (existingRows || []).map((e: ExistingEvent) => ({
    ...e,
    fingerprint: generateEventFingerprint({
      title: e.title,
      date: new Date(e.date),
      venue: e.venue,
      source_url: e.source_url,
    }),
  }));

  const fallbackUrl = typeof (body as { listingUrl?: string }).listingUrl === "string"
    ? (body as { listingUrl?: string }).listingUrl as string
    : "";
  const plan = planIngest(items, existing, fallbackUrl);

  let inserted = 0;
  const writeErrors: string[] = [];
  if (plan.rows.length > 0) {
    const stamped = plan.rows.map((r) => ({
      ...r,
      produced_by: producedBy,
      render_provider: renderProvider,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    const { data, error } = await supabase.from("events").insert(stamped).select("id");
    if (error) {
      writeErrors.push(error.message);
    } else {
      inserted = (data || []).length;
    }
  }

  return json({
    source,
    inserted,
    // A REAL ZERO. This producer never updates an existing row; enriching
    // another producer's row is a decision nobody has made.
    updated: 0,
    updatedNote: "this endpoint only inserts — 0 is measured, not a placeholder",
    duplicates: plan.duplicates,
    rejected: plan.rejected,
    provenance: { producedBy, renderProvider, renderMode: provenance.renderMode ?? null },
    ...(writeErrors.length ? { writeErrors } : {}),
  }, writeErrors.length ? 500 : 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
