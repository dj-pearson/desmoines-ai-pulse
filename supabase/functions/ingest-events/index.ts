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
import { parseEventDateTime } from "../_shared/eventDateTime.ts";
import { dedupWindow, loadExistingEvents } from "../_shared/existingEvents.ts";
import { findKnownVenue, venueCoordinates } from "../_shared/knownVenues.ts";
import { planIngest, type IncomingItem, type Provenance } from "./plan.ts";
import { runJob } from "../_shared/jobRunner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

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

  // The existing rows AROUND THE DATES IN THIS PAYLOAD, every one of them.
  //
  // This read "the last 60 days" - i.e. rows dated from two months ago up to
  // whenever - ordered newest first, in one request. PostgREST stops that at
  // max-rows (1000) without saying so, so once the calendar held more than a
  // thousand rows from two months back onward, the dedup set was the thousand
  // furthest-future ones and the near-term events the hub actually sends were
  // judged against nothing. loadExistingEvents pages through the window the
  // payload needs, +/- a day, which is all any dedup tier ever compares.
  const window = dedupWindow(
    items
      .map((i) => (i && typeof i.date === "string" ? parseEventDateTime(i.date)?.event_start_utc : null))
      .filter((d): d is Date => d instanceof Date),
  );
  let existing;
  try {
    existing = window ? await loadExistingEvents(supabase, window) : [];
  } catch (readError) {
    // A FAILED READ REFUSES THE WRITE. Treating an unreadable existing set as an
    // empty one would make every dedup tier pass and duplicate the whole payload.
    return json({ error: `could not read existing events for duplicate detection, so nothing was written: ${(readError as Error).message}` }, 503);
  }

  const fallbackUrl = typeof (body as { listingUrl?: string }).listingUrl === "string"
    ? (body as { listingUrl?: string }).listingUrl as string
    : "";
  const plan = planIngest(items, existing, fallbackUrl);

  // COORDINATES AT INGEST (WEB-BE-050). Every hub row reached the table with no
  // lat/lng, so none of them appeared on the map or in "near me" until one of
  // the nightly backfills geocoded it. Coordinates only, as knownVenues.ts asks
  // of a new caller: the venue name the hub sent is kept, and so the dedup
  // above - which compared that name - still describes what is written.
  // findKnownVenue caches known_venues per isolate, so this is one query.
  for (const row of plan.rows) {
    const venueText = String(row.venue || row.location || "");
    Object.assign(row, venueCoordinates(await findKnownVenue(supabase, venueText)));
  }

  let inserted = 0;
  let constraintDuplicates = 0;
  const writeErrors: string[] = [];

  // WEB-BE-043. The hub is an external process: when one of its four sources
  // stops producing, nothing inside Supabase sees a change, because this
  // function keeps being called and keeps answering 200 with inserted: 0.
  // Recording the batch here, keyed by the source the hub named, is what makes
  // that visible - the per-source rule in _shared/ingestionHealth.ts reads
  // exactly these counts.
  const job = await runJob("ingest-events", async (ctx) => {
  if (plan.rows.length > 0) {
    const stamped = plan.rows.map((r) => ({
      ...r,
      produced_by: producedBy,
      render_provider: renderProvider,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    // THE DATABASE AND THE SHARED DEDUP NOW AGREE (WEB-BE-036).
    //
    // They did not used to. `events_title_venue_unique` was a UNIQUE INDEX on
    // (title, venue) with no date in it — one row per title per venue, forever
    // — while `_shared/eventDedup.ts` tier 3 allowed the same title and venue
    // on a different day. The first live run found it the expensive way: 88
    // events extracted, the shared dedup passed 60, and Postgres rejected the
    // whole statement with "duplicate key value violates unique constraint".
    // A batch insert is ONE statement, so a single collision lost every row
    // beside it.
    //
    // Migration 20260902000006 replaced that index with
    // `events_title_venue_date_unique` on (title, venue, event_local_date) —
    // the Central-time calendar date, held in a generated column so PostgREST
    // can name it here. `event_local_date` is never sent in the payload;
    // Postgres derives it, and this clause only names it to pick the index.
    //
    // The two counts are still reported SEPARATELY rather than summed:
    // `duplicates` is what the shared module caught before the write,
    // `constraintDuplicates` is what the database caught during it. They should
    // now agree, and they are kept apart so that a future divergence is visible
    // instead of hidden — see the note in eventDedup.ts.
    const { data, error } = await supabase
      .from("events")
      .upsert(stamped, {
        onConflict: "title,venue,event_local_date",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) {
      writeErrors.push(error.message);
    } else {
      inserted = (data || []).length;
      constraintDuplicates = stamped.length - inserted;
    }
  }

    ctx.processed(inserted);
    ctx.failed(plan.rejected.length + writeErrors.length);
    ctx.meta({
      producedBy,
      sources: {
        [source]: {
          fetched: items.length,
          inserted,
          duplicates: plan.duplicates + constraintDuplicates,
          errors: plan.rejected.length + writeErrors.length,
        },
      },
    });
    // A write that failed outright is a failed run, not a quiet one. The HTTP
    // status below is decided from writeErrors either way, so a ledger write
    // that itself fails cannot change what the hub is told.
    if (writeErrors.length > 0) {
      throw new Error(`the events write failed: ${writeErrors.join('; ')}`);
    }
  });

  return json({
    runId: job.runId,
    // The kill switch (AOS-CORE-009) makes runJob return without running the
    // body. The hub would otherwise read that as "accepted, quiet batch" and
    // discard items nothing ever wrote.
    ...(job.status === "skipped"
      ? { paused: true, pausedNote: "automation is paused; this batch was NOT written and should be resent" }
      : {}),
    source,
    inserted,
    // A REAL ZERO. This producer never updates an existing row; enriching
    // another producer's row is a decision nobody has made.
    updated: 0,
    updatedNote: "this endpoint only inserts — 0 is measured, not a placeholder",
    duplicates: plan.duplicates,
    // Reported separately from `duplicates` on purpose: one is the shared
    // module's verdict before the write, the other is the database's during it,
    // and they disagree by design (see the comment on the upsert above).
    constraintDuplicates,
    constraintNote: constraintDuplicates > 0
      ? `${constraintDuplicates} row(s) were refused by events_title_venue_unique, which permits one row per (title, venue) with no date in it. The shared dedup considers a same-title, same-venue event more than 24 hours later to be a different event; this table does not.`
      : null,
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
