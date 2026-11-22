import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { writeAuditLog, auditIp } from "../_shared/auditLog.ts";
import { fetchWithTimeout } from '../_shared/fetchWithTimeout.ts';
import { isUnknownColumnError } from '../_shared/postgrestErrors.ts'
import { runJob } from '../_shared/jobRunner.ts'
import { isPlacesMediaUrl, GOOGLE_ATTRIBUTION_TEXT } from '../_shared/placesPhoto.ts'
import { selectWithLocks, withoutLockedFields } from '../_shared/restaurantFieldLocks.ts'
import {
  buildHoursOnlyUpdate,
  buildStaleRefreshUpdate,
  failedLookupCountsAsCheck,
  HOURS_ONLY_FIELD_MASK,
  normalizeBusinessStatus,
  normalizeOpeningHours,
  parseStaleDays,
  staleHoursCutoff,
  staleHoursFilter,
  staleRefreshFieldMask,
} from '../_shared/placeHours.ts'
import { buildGoogleFactsUpdate, type GoogleFactsUpdate, withoutNewFactColumns } from '../_shared/placeFacts.ts'
import type { BusinessStatus, StaleRefreshUpdate, StoredHours } from '../_shared/placeHours.ts'
import {
  buildClosureReview,
  type ClosureReviewRow,
  PLACE_LOOKUP_DAILY_MAX,
  PLACE_LOOKUP_FIELD_MASK,
  type PlaceCandidate,
  pickConfidentPlace,
  placeLookupQuery,
} from '../_shared/placeLookup.ts'
import {
  applyEnrichTargets,
  descriptionUpdate,
  ENRICH_SELECT,
  parseCursor,
  parseRestaurantIds,
  pickNamedSearchHit,
} from '../_shared/restaurantEnrich.ts'

interface GooglePlaceDetails {
  id: string;
  displayName: {
    text: string;
  };
  formattedAddress: string;
  rating?: number;
  editorialSummary?: {
    text: string;
  };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  photos?: Array<{
    name: string;
    widthPx: number;
    heightPx: number;
    /** WEB-BE-044. Places requires this to be shown wherever the photo is.
     *  Requested explicitly in the field mask below - an unrequested field is
     *  simply absent from the response, which is how it went unnoticed. */
    authorAttributions?: Array<{ displayName?: string; uri?: string }>;
  }>;
  types: string[];
  businessStatus: string;
  /** WEB-FEAT-024: real Place fields, per the Places API (New) reference. */
  reservable?: boolean;
  googleMapsUri?: string;
  /** WEB-BE-045. Requested in the field mask; shape validated by
   *  _shared/placeHours.ts rather than trusted, since this is a network
   *  response typed by hand. */
  regularOpeningHours?: unknown;
}

/** A row as the full enrichment reads it (ENRICH_SELECT plus locked_fields). */
interface EnrichRow {
  id: string;
  name: string;
  location: string | null;
  google_place_id: string | null;
  enhanced: string | null;
  description: string | null;
  /** WEB-BE-069. Absent when migration 20261121000070 is not applied yet. */
  locked_fields?: unknown;
}

/** WEB-BE-070: the Google facts (rating, count, price and source, ...) come from GoogleFactsUpdate. */
interface RestaurantUpdate extends GoogleFactsUpdate {
  id: string;
  name: string;
  cuisine?: string;
  location?: string;
  rating?: number;
  description?: string;
  phone?: string;
  website?: string;
  image_url?: string;
  google_place_id?: string;
  /** WEB-FEAT-024. Added by migration 20260909000001; the write guards against
   *  that migration not being applied yet. */
  reservable?: boolean;
  google_maps_uri?: string;
  /** WEB-BE-044. Added by migration 20260919000004; guarded the same way.
   *  The RESOURCE NAME, never a media URL - "places/<id>/photos/<ref>". It is
   *  a reference, so the 30-day Place content cache limit does not apply to it
   *  the way it applies to the bytes. */
  places_photo_name?: string;
  places_photo_attribution?: string;
  places_photo_seen_at?: string;
  /** WEB-BE-045. Added by migration 20260919000009; guarded the same way as
   *  the two sets above. business_status is one of three literal values or
   *  absent - never a raw pass-through of whatever Places returned. */
  business_status?: BusinessStatus;
  hours_json?: StoredHours;
  /** WEB-BE-066. Added by migration 20261121000040; guarded like the rest.
   *  Stamped whenever Google answered for the row, so a row Google cannot
   *  complete stops heading the daily auto-enrich batch. */
  enrich_checked_at?: string;
  enhanced?: string;
  updated_at: string;
}

/**
 * SEO-054. `hoursOnly: true` fills hours_json and business_status for rows
 * that have a Google place id and no hours yet, and touches nothing else.
 *
 * WHY A SEPARATE MODE. hours_json was added by WEB-BE-045 and written only by
 * the full enrichment below, which (a) runs only on rows whose `enhanced` is
 * not 'completed' unless forceUpdate is set, and 428 of 478 rows were
 * completed before the column existed; (b) with forceUpdate, re-reads the
 * first N rows of an unordered select, so it re-enriches the same rows; and
 * (c) overwrites description, location, cuisine, rating, phone, website and
 * the photo on every row it touches. Filling hours through it would rewrite
 * 440 descriptions to get 440 hours. This mode asks Places for two fields
 * (HOURS_ONLY_FIELD_MASK), writes two columns, never sets `enhanced`, and
 * works through the backlog in id order so each call takes the next rows.
 *
 * Additive: an optional request field, absent means the old behaviour, and
 * the response keeps the old keys (CLAUDE.md, edge function compatibility).
 */
async function refreshHoursOnly(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  googleApiKey: string,
  batchSize: number,
  afterId: string | null,
  corsHeaders: Record<string, string>,
  req: Request,
): Promise<Response> {
  // WEB-BE-069: locked_fields comes with the row so a field a person set is
  // never written here (selectWithLocks drops it when the column is not there).
  const { data: rows, error: fetchError } = await selectWithLocks((cols) => {
    let query = supabase
      .from('restaurants')
      .select(cols)
      .not('google_place_id', 'is', null)
      .is('hours_json', null)
      .order('id', { ascending: true })
      .limit(batchSize)
    // A place Google has no hours for keeps hours_json null and would head every
    // batch forever. The caller passes back `lastId` to move past it.
    if (afterId) query = query.gt('id', afterId)
    return query
  }, 'id, name, google_place_id')
  if (fetchError) throw new Error(`Failed to fetch restaurants: ${fetchError.message}`)

  const targets = (rows ?? []) as Array<{ id: string; name: string; google_place_id: string; locked_fields?: unknown }>
  let updated = 0
  let noHours = 0
  let lockedSkips = 0
  const errors: Array<{ id: string; name: string; error: string }> = []

  const job = await runJob('bulk-update-restaurants-hours', async (ctx) => {
    for (const row of targets) {
      try {
        const res = await fetchWithTimeout(
          `https://places.googleapis.com/v1/places/${encodeURIComponent(row.google_place_id)}`,
          { method: 'GET', headers: { 'X-Goog-Api-Key': googleApiKey, 'X-Goog-FieldMask': HOURS_ONLY_FIELD_MASK } },
        )
        if (!res.ok) {
          errors.push({ id: row.id, name: row.name, error: `Places ${res.status}` })
          continue
        }
        const built = buildHoursOnlyUpdate(await res.json())
        if (!built) {
          // Google has no hours and no status for this place. Leave the row
          // alone: null means unknown, and an empty object would read as data.
          noHours++
          continue
        }
        // WEB-BE-069: a field a person set keeps their value.
        const { update, skipped } = withoutLockedFields(built, row.locked_fields)
        lockedSkips += skipped.length
        if (Object.keys(update).length === 0) continue
        const { error: updateError } = await supabase.from('restaurants').update(update).eq('id', row.id)
        if (updateError) errors.push({ id: row.id, name: row.name, error: updateError.message })
        else updated++
      } catch (error) {
        errors.push({ id: row.id, name: row.name, error: error instanceof Error ? error.message : String(error) })
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    ctx.processed(updated)
    ctx.failed(errors.length)
    ctx.meta({
      mode: 'hoursOnly',
      noHours,
      lockedSkips,
      sources: { 'google-places': { fetched: targets.length, inserted: updated, duplicates: 0, errors: errors.length } },
    })
  })

  if (!job.ok) {
    return new Response(
      JSON.stringify({ success: false, error: job.error ?? 'Hours refresh failed', runId: job.runId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    )
  }

  await writeAuditLog(supabase, {
    eventType: 'admin_action',
    actorId: null,
    action: 'bulk_update_restaurants_hours',
    resource: 'restaurants',
    severity: 'low',
    ipAddress: auditIp(req),
    details: { processed: targets.length, updated, noHours, errors: errors.length },
  })

  return new Response(
    JSON.stringify({
      success: true,
      runId: job.runId,
      message: 'Hours refresh completed',
      mode: 'hoursOnly',
      processed: targets.length,
      updated,
      noHours,
      lastId: targets.length > 0 ? targets[targets.length - 1].id : null,
      errors: errors.length,
      errorDetails: errors.length > 0 ? errors : undefined,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
  )
}

/**
 * WEB-FEAT-079. `hoursOnly: true, staleDays: N` re-reads hours and
 * status for rows that HAVE hours whose last check is older than N days,
 * oldest check first. The fill mode above never revisits a row, so without
 * this a place's hours and business_status were frozen at the first fetch.
 *
 * Same two-field mask and the same two columns as the fill mode, plus
 * hours_checked_at (migration 20261108000099), written on every answer Places
 * gives so a place with no hours is not re-read at the head of every batch.
 * A Places error other than 404 is not a check; the row is retried next run.
 * No cursor: each run's writes move the rows it read out of the stale set.
 */
async function refreshStaleHours(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  googleApiKey: string,
  batchSize: number,
  staleDays: number,
  corsHeaders: Record<string, string>,
  req: Request,
): Promise<Response> {
  const cutoff = staleHoursCutoff(staleDays)
  // WEB-BE-069: with locked_fields, as in the fill mode above.
  // WEB-BE-070: reservable is read so the mask asks for it only when the row
  // has no answer (staleRefreshFieldMask); the column is from 20260909000001.
  const { data: rows, error: fetchError } = await selectWithLocks((cols) =>
    supabase
      .from('restaurants')
      .select(cols)
      .not('google_place_id', 'is', null)
      .or(staleHoursFilter(cutoff))
      .order('hours_checked_at', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true })
      .limit(batchSize), 'id, name, google_place_id, reservable')
  if (fetchError) throw new Error(`Failed to fetch restaurants: ${fetchError.message}`)

  const targets = (rows ?? []) as Array<{
    id: string
    name: string
    google_place_id: string
    reservable?: boolean | null
    locked_fields?: unknown
  }>
  let lockedSkips = 0
  let updated = 0
  let noHours = 0
  let gone = 0
  let checked = 0
  let closed = 0
  const errors: Array<{ id: string; name: string; error: string }> = []

  const job = await runJob('bulk-update-restaurants-hours', async (ctx) => {
    for (const row of targets) {
      try {
        const res = await fetchWithTimeout(
          `https://places.googleapis.com/v1/places/${encodeURIComponent(row.google_place_id)}`,
          // WEB-BE-070: hours, status and the Google facts in one Enterprise
          // call; reservable only for a row that does not know it yet.
          { method: 'GET', headers: { 'X-Goog-Api-Key': googleApiKey, 'X-Goog-FieldMask': staleRefreshFieldMask(row) } },
        )
        let update: StaleRefreshUpdate & { promotion_hold_reason?: string }
        if (res.ok) {
          update = buildStaleRefreshUpdate(await res.json())
          checked++
          if (!('hours_json' in update)) noHours++
          if (update.business_status === 'CLOSED_PERMANENTLY') closed++
        } else if (failedLookupCountsAsCheck(res.status)) {
          // WEB-BE-064: Google no longer knows this place id. That is a
          // finding, not a pass: queue it for a person and hold the row out of
          // promotion (isRestaurantPromotable) until it is resolved.
          gone++
          update = { hours_checked_at: new Date().toISOString(), promotion_hold_reason: 'place_not_found' }
          const queued = await queueClosureReview(
            supabase,
            buildClosureReview(row.id, 'place_not_found', 'bulk-update-restaurants-hours', { google_place_id: row.google_place_id }),
          )
          if (queued !== null) {
            errors.push({ id: row.id, name: row.name, error: `closure review not queued: ${queued}` })
            continue
          }
        } else {
          errors.push({ id: row.id, name: row.name, error: `Places ${res.status}` })
          continue
        }
        // WEB-BE-069: hours_checked_at is never locked, so the check is still
        // recorded when every Google field on the row is locked.
        const kept = withoutLockedFields(update, row.locked_fields)
        lockedSkips += kept.skipped.length
        update = kept.update
        let { error: updateError } = await supabase.from('restaurants').update(update).eq('id', row.id)
        // WEB-BE-070: deployed before 20261121000130, the new columns would
        // fail the whole write. Retry without them so hours, status, rating,
        // phone, website and price still land.
        if (updateError && isUnknownColumnError(updateError)) {
          ;({ error: updateError } = await supabase.from('restaurants').update(withoutNewFactColumns(update)).eq('id', row.id))
        }
        if (updateError) errors.push({ id: row.id, name: row.name, error: updateError.message })
        else updated++
      } catch (error) {
        errors.push({ id: row.id, name: row.name, error: error instanceof Error ? error.message : String(error) })
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    ctx.processed(updated)
    ctx.failed(errors.length)
    ctx.meta({
      mode: 'hoursOnly-stale',
      staleDays,
      noHours,
      gone,
      checked,
      closed,
      not_found: gone,
      lockedSkips,
      sources: { 'google-places': { fetched: targets.length, inserted: updated, duplicates: 0, errors: errors.length } },
    })
  })

  if (!job.ok) {
    return new Response(
      JSON.stringify({ success: false, error: job.error ?? 'Hours refresh failed', runId: job.runId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    )
  }

  await writeAuditLog(supabase, {
    eventType: 'admin_action',
    actorId: null,
    action: 'bulk_update_restaurants_hours',
    resource: 'restaurants',
    severity: 'low',
    ipAddress: auditIp(req),
    details: { mode: 'stale', staleDays, processed: targets.length, updated, noHours, gone, errors: errors.length },
  })

  return new Response(
    JSON.stringify({
      success: true,
      runId: job.runId,
      message: 'Stale hours refresh completed',
      mode: 'hoursOnly-stale',
      staleDays,
      processed: targets.length,
      updated,
      noHours,
      gone,
      checked,
      closed,
      not_found: gone,
      errors: errors.length,
      errorDetails: errors.length > 0 ? errors : undefined,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
  )
}

/**
 * WEB-BE-064. Insert one closure finding. An open finding for the same
 * restaurant and reason already exists when the partial unique index answers
 * 23505; that is success (it is queued). Returns an error message or null.
 */
async function queueClosureReview(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  review: ClosureReviewRow,
): Promise<string | null> {
  const { error } = await supabase.from('restaurant_closure_reviews').insert(review)
  if (!error || error.code === '23505') return null
  return error.message ?? String(error)
}

/** Restaurants whose last name-and-address lookup is older than this are tried again. */
const PLACE_LOOKUP_RETRY_DAYS = 90

/**
 * WEB-BE-064. `placeLookup: true` gives rows with no google_place_id a path
 * into the refresh: a Places Text Search by name and address, the id stored
 * only on a confident match (pickConfidentPlace), everything else queued for
 * a person as no_place_match. Every answered row gets place_lookup_checked_at,
 * so the same rows do not head every batch; a Places error is not an answer
 * and the row is retried next run. Capped at PLACE_LOOKUP_DAILY_MAX a call.
 */
async function lookupMissingPlaceIds(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  googleApiKey: string,
  batchSize: number,
  corsHeaders: Record<string, string>,
  req: Request,
): Promise<Response> {
  const limit = Math.min(batchSize, PLACE_LOOKUP_DAILY_MAX)
  const retryBefore = new Date(Date.now() - PLACE_LOOKUP_RETRY_DAYS * 86_400_000).toISOString()
  const { data: rows, error: fetchError } = await supabase
    .from('restaurants')
    .select('id, name, location')
    .is('google_place_id', null)
    .not('is_merged', 'is', true)
    .not('status', 'in', '(closed,permanently_closed,closed_permanently)')
    .or(`place_lookup_checked_at.is.null,place_lookup_checked_at.lt.${retryBefore}`)
    .order('place_lookup_checked_at', { ascending: true, nullsFirst: true })
    .order('id', { ascending: true })
    .limit(limit)
  if (fetchError) throw new Error(`Failed to fetch restaurants: ${fetchError.message}`)

  const targets = (rows ?? []) as Array<{ id: string; name: string; location: string | null }>
  let matched = 0
  let queued = 0
  const errors: Array<{ id: string; name: string; error: string }> = []

  const job = await runJob('restaurant-place-lookup', async (ctx) => {
    for (const row of targets) {
      try {
        const query = placeLookupQuery(row)
        const res = await fetchWithTimeout('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': googleApiKey,
            'X-Goog-FieldMask': PLACE_LOOKUP_FIELD_MASK,
          },
          body: JSON.stringify({
            textQuery: query,
            maxResultCount: 5,
            locationBias: { circle: { center: { latitude: 41.5868, longitude: -93.625 }, radius: 40000 } },
          }),
        })
        if (!res.ok) {
          errors.push({ id: row.id, name: row.name, error: `Places ${res.status}` })
          continue
        }
        const body = await res.json()
        const candidates: PlaceCandidate[] = Array.isArray(body?.places) ? body.places : []
        const match = pickConfidentPlace(row, candidates)
        const checkedAt = new Date().toISOString()

        let reason: string | null = match.ok ? null : match.reason
        let duplicateOf: string | null = null
        if (match.ok) {
          // Another listing already holds this place: a duplicate for the
          // merge queue, not a second row pointing at one business.
          const { data: holder, error: holderError } = await supabase
            .from('restaurants')
            .select('id')
            .eq('google_place_id', match.placeId)
            .neq('id', row.id)
            .limit(1)
          if (holderError) {
            errors.push({ id: row.id, name: row.name, error: holderError.message })
            continue
          }
          if (holder && holder.length > 0) {
            reason = 'place_id_on_another_listing'
            duplicateOf = holder[0].id
          }
        }

        if (match.ok && reason === null) {
          const { error: updateError } = await supabase
            .from('restaurants')
            .update({ google_place_id: match.placeId, place_lookup_checked_at: checkedAt })
            .eq('id', row.id)
          if (updateError) {
            errors.push({ id: row.id, name: row.name, error: updateError.message })
            continue
          }
          matched++
          continue
        }

        const queueError = await queueClosureReview(
          supabase,
          buildClosureReview(row.id, 'no_place_match', 'restaurant-place-lookup', {
            match: reason,
            query,
            candidates: candidates.slice(0, 5).map((c) => ({
              id: c.id ?? null,
              name: c.displayName?.text ?? null,
              address: c.formattedAddress ?? null,
            })),
            ...(duplicateOf ? { duplicate_of: duplicateOf } : {}),
          }),
        )
        if (queueError !== null) {
          errors.push({ id: row.id, name: row.name, error: `closure review not queued: ${queueError}` })
          continue
        }
        const { error: stampError } = await supabase
          .from('restaurants')
          .update({ place_lookup_checked_at: checkedAt })
          .eq('id', row.id)
        if (stampError) errors.push({ id: row.id, name: row.name, error: stampError.message })
        else queued++
      } catch (error) {
        errors.push({ id: row.id, name: row.name, error: error instanceof Error ? error.message : String(error) })
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    ctx.processed(matched + queued)
    ctx.failed(errors.length)
    ctx.meta({
      mode: 'placeLookup',
      checked: targets.length,
      matched,
      queued,
      sources: { 'google-places': { fetched: targets.length, inserted: matched, duplicates: 0, errors: errors.length } },
    })
  })

  if (!job.ok) {
    return new Response(
      JSON.stringify({ success: false, error: job.error ?? 'Place lookup failed', runId: job.runId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    )
  }

  await writeAuditLog(supabase, {
    eventType: 'admin_action',
    actorId: null,
    action: 'restaurant_place_lookup',
    resource: 'restaurants',
    severity: 'low',
    ipAddress: auditIp(req),
    details: { processed: targets.length, matched, queued, errors: errors.length },
  })

  return new Response(
    JSON.stringify({
      success: true,
      runId: job.runId,
      message: 'Place lookup completed',
      mode: 'placeLookup',
      processed: targets.length,
      matched,
      queued,
      errors: errors.length,
      errorDetails: errors.length > 0 ? errors : undefined,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
  )
}

serve(async (req) => {
  // Handle CORS preflight requests
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  // API key or admin auth (SEC-013). This was requireApiKey alone, which only
  // accepts EDGE_FUNCTION_API_KEY, so the admin bulk updater
  // (useBulkRestaurantUpdate.ts), which sends the admin's JWT, always got a 401.
  const authResponse = await requireAdminOrApiKey(req, corsHeaders);
  if (authResponse) return authResponse;

  // Rate limiting: 5 requests per 15 minutes (SEC-013)
  const rateLimit = checkRateLimit(req, {
    max: 5,
    message: "Too many bulk update requests. Please try again later.",
  });
  if (!rateLimit.success && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const googleApiKey = Deno.env.get('GOOGLE_SEARCH_API')!

    if (!googleApiKey) {
      throw new Error('GOOGLE_SEARCH_API key not found in environment variables')
    }

    // WEB-BE-075: names this job in restaurant_changes.actor.
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { 'x-actor': 'bulk-update-restaurants' } },
    })

    const { batchSize: rawBatchSize = 10, forceUpdate = false, clearEnhanced = false, hoursOnly = false, afterId = null, staleDays: rawStaleDays = null, placeLookup = false, restaurantIds: rawRestaurantIds = null } = await req.json()
    // Each row is a paid Google Places lookup, and batchSize went straight into
    // .limit(). 50 is the admin form's own max (RestaurantBulkUpdaterSimple.tsx,
    // and HOURS_BATCH_MAX in src/lib/restaurantHoursRefresh.ts).
    const batchSize = Math.min(Math.max(Math.floor(Number(rawBatchSize)) || 10, 1), 50)

    // WEB-BE-064: optional field; absent keeps every existing mode.
    if (placeLookup === true) {
      return await lookupMissingPlaceIds(supabase, googleApiKey, batchSize, corsHeaders, req)
    }

    // SEO-054: hours and status only, for rows with a place id and no hours.
    if (hoursOnly === true) {
      // WEB-FEAT-079: with staleDays, re-read rows that already
      // have hours. Optional field; absent keeps the fill behaviour.
      const staleDays = parseStaleDays(rawStaleDays)
      if (staleDays !== null) {
        return await refreshStaleHours(supabase, googleApiKey, batchSize, staleDays, corsHeaders, req)
      }
      const cursor = typeof afterId === 'string' && /^[0-9a-f-]{36}$/i.test(afterId) ? afterId : null
      return await refreshHoursOnly(supabase, googleApiKey, batchSize, cursor, corsHeaders, req)
    }

    console.log(`Starting bulk restaurant update with batch size: ${batchSize}, forceUpdate: ${forceUpdate}, clearEnhanced: ${clearEnhanced}`)

    // Clear enhanced status if requested
    if (clearEnhanced) {
      console.log('Clearing enhanced status for all restaurants...')
      const { error: clearError } = await supabase
        .from('restaurants')
        .update({ enhanced: null })
        .neq('id', '00000000-0000-0000-0000-000000000000') // Update all rows
      
      if (clearError) {
        console.error('Error clearing enhanced status:', clearError)
      } else {
        console.log('Enhanced status cleared successfully')
      }
    }

    // WEB-BE-066. restaurantIds (optional; absent keeps the old selection)
    // limits the run to the rows the caller picked: auto-enrich-restaurants
    // sends the incomplete rows it chose, and they used to be ignored.
    // Without ids the rows come in id order after afterId, and the response's
    // lastId is the next cursor, so repeated force runs reach different rows
    // instead of whichever ones an unordered select returned first.
    const restaurantIds = parseRestaurantIds(rawRestaurantIds)
    // WEB-BE-069: locked_fields is read with the row, and every write below
    // drops the fields a person set (withoutLockedFields before updates.push).
    const { data: restaurants, error: fetchError } = await selectWithLocks<EnrichRow>(
      (cols) => applyEnrichTargets(
        supabase.from('restaurants').select(cols),
        { restaurantIds, forceUpdate: !!forceUpdate, afterId: parseCursor(afterId), batchSize },
      ),
      ENRICH_SELECT,
    )

    if (fetchError) {
      throw new Error(`Failed to fetch restaurants: ${fetchError.message}`)
    }

    if (!restaurants || restaurants.length === 0) {
      // WEB-BE-043: a run with nothing to do is still a run. Returning without
      // recording one is why "this job has been enriching nothing for a month"
      // and "there was nothing to enrich today" produced identical evidence.
      const emptyRun = await runJob('bulk-update-restaurants', async (ctx) => {
        ctx.meta({ sources: { 'google-places': { fetched: 0, inserted: 0, duplicates: 0, errors: 0 } } })
      })
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No restaurants found that need updating',
          updated: 0,
          // WEB-BE-066: the cursor reached the end; start again without afterId.
          lastId: null,
          runId: emptyRun.runId
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    console.log(`Found ${restaurants.length} restaurants to update`)

    const updates: RestaurantUpdate[] = []
    const errors: Array<{ id: string; name: string; error: string }> = []
    // WEB-BE-066: rows where every search answered and no hit carried the
    // restaurant's name. They are left alone apart from enrich_checked_at.
    let unmatched = 0
    // WEB-BE-069: fields left out of a write because a person set them.
    let lockedSkips = 0

    // WEB-BE-043. The Google Places call is what goes dark here - a quota
    // exhaustion or a retired key makes every lookup come back empty and the
    // function still answers 200 with "Bulk update completed". `updatedCount`
    // is declared out here so the response below can read it after the wrapper
    // returns.
    let updatedCount = 0
    const job = await runJob('bulk-update-restaurants', async (ctx) => {
    // Process each restaurant
    for (const restaurant of restaurants) {
      try {
        console.log(`Processing restaurant: ${restaurant.name}`)

        let placeId = restaurant.google_place_id
        let placeDetails: GooglePlaceDetails | null = null

        // Whether Google gave an answer for this row (a search that returned,
        // or details that loaded). A Places error is not an answer, and the
        // row is tried again next run.
        let googleAnswered = false

        // If no Google Place ID, search for it first
        if (!placeId && restaurant.name && restaurant.location) {
          // Try multiple search variations
          const searchQueries = [
            `${restaurant.name} ${restaurant.location}`,
            `${restaurant.name} Des Moines Iowa`,
            `${restaurant.name} West Des Moines Iowa`,
            restaurant.name  // Just the name as a fallback
          ]
          
          for (const searchQuery of searchQueries) {
            console.log(`Searching for: "${searchQuery}"`)
            const searchUrl = `https://places.googleapis.com/v1/places:searchText`
            
            const searchResponse = await fetchWithTimeout(searchUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': googleApiKey,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress'
              },
              body: JSON.stringify({
                textQuery: searchQuery,
                maxResultCount: 3,
                locationBias: {
                  circle: {
                    center: {
                      latitude: 41.5868,
                      longitude: -93.6250
                    },
                    radius: 50000.0  // 50km radius around Des Moines
                  }
                }
              })
            })

            if (searchResponse.ok) {
              googleAnswered = true
              const searchData = await searchResponse.json()
              console.log(`Search results for "${searchQuery}":`, JSON.stringify(searchData, null, 2))
              
              // WEB-BE-066: a hit counts only when its name is the
              // restaurant's. This took places[0] (or the first hit sharing
              // the first word), and the details of that place then
              // overwrote location, phone and website.
              const places: PlaceCandidate[] = Array.isArray(searchData.places) ? searchData.places : []
              const bestMatch = pickNamedSearchHit(restaurant.name, places)
              if (bestMatch?.id) {
                placeId = bestMatch.id
                console.log(`Found place ID: ${placeId} for restaurant: ${restaurant.name}`)
                break // Exit the search loop once we find a match
              }
            } else {
              console.error(`Search failed for "${searchQuery}":`, await searchResponse.text())
            }
            
            // Add a small delay between searches
            await new Promise(resolve => setTimeout(resolve, 100))
          }
          
          if (placeId) {
            console.log(`Found place ID for ${restaurant.name}: ${placeId}`)
          } else {
            console.log(`No place ID found for ${restaurant.name}`)
            if (googleAnswered) {
              // Left alone: no enhanced flag, no content. Only the stamp, so
              // the daily job stops picking this row first.
              unmatched++
              updates.push({
                id: restaurant.id,
                name: restaurant.name,
                enrich_checked_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              await new Promise(resolve => setTimeout(resolve, 100))
              continue
            }
          }
        }

        // If we have a place ID, get detailed information
        if (placeId) {
          const detailsUrl = `https://places.googleapis.com/v1/places/${placeId}`
          
          const detailsResponse = await fetchWithTimeout(detailsUrl, {
            method: 'GET',
            headers: {
              'X-Goog-Api-Key': googleApiKey,
              // regularOpeningHours is new (WEB-BE-045). businessStatus was already
              // here and its answer was thrown away - the mask asked for it and
              // nothing wrote it, which is why no restaurant was ever marked closed.
              // WEB-BE-070: priceLevel and userRatingCount added. Both are
              // Enterprise fields; editorialSummary and reservable already put
              // this call in Enterprise + Atmosphere, so the SKU is unchanged.
              'X-Goog-FieldMask': 'id,displayName,formattedAddress,rating,userRatingCount,priceLevel,editorialSummary,nationalPhoneNumber,websiteUri,photos,photos.authorAttributions,types,businessStatus,regularOpeningHours,reservable,googleMapsUri'
            }
          })

          if (detailsResponse.ok) {
            googleAnswered = true
            placeDetails = await detailsResponse.json()
            console.log(`Retrieved details for ${restaurant.name}`)
          } else {
            console.error(`Failed to get details for place ${placeId}:`, await detailsResponse.text())
          }
        }

        // Build the update object
        const update: RestaurantUpdate = {
          id: restaurant.id,
          name: restaurant.name,
          enhanced: 'completed',
          updated_at: new Date().toISOString()
        }
        if (googleAnswered) update.enrich_checked_at = new Date().toISOString()

        if (placeDetails) {
          console.log(`Processing place details for ${restaurant.name}:`, {
            hasEditorialSummary: !!placeDetails.editorialSummary?.text,
            rating: placeDetails.rating,
            hasPhone: !!placeDetails.nationalPhoneNumber,
            hasWebsite: !!placeDetails.websiteUri,
            hasPhotos: placeDetails.photos?.length || 0,
            types: placeDetails.types
          })

          // Extract cuisine from place types
          const cuisineTypes = placeDetails.types?.filter(type => 
            type.includes('restaurant') || 
            type.includes('food') || 
            type.includes('meal') ||
            type === 'american_restaurant' ||
            type === 'chinese_restaurant' ||
            type === 'mexican_restaurant' ||
            type === 'italian_restaurant' ||
            type === 'japanese_restaurant' ||
            type === 'indian_restaurant' ||
            type === 'thai_restaurant' ||
            type === 'vietnamese_restaurant' ||
            type === 'korean_restaurant' ||
            type === 'french_restaurant' ||
            type === 'greek_restaurant' ||
            type === 'mediterranean_restaurant' ||
            type === 'seafood_restaurant' ||
            type === 'steak_house' ||
            type === 'pizza_restaurant' ||
            type === 'sandwich_shop' ||
            type === 'coffee_shop' ||
            type === 'bakery' ||
            type === 'bar' ||
            type === 'cafe'
          ) || []

          // Map Google types to readable cuisine names
          const getCuisineName = (types: string[]): string => {
            const typeMap: { [key: string]: string } = {
              'american_restaurant': 'American',
              'chinese_restaurant': 'Chinese',
              'mexican_restaurant': 'Mexican',
              'italian_restaurant': 'Italian',
              'japanese_restaurant': 'Japanese',
              'indian_restaurant': 'Indian',
              'thai_restaurant': 'Thai',
              'vietnamese_restaurant': 'Vietnamese',
              'korean_restaurant': 'Korean',
              'french_restaurant': 'French',
              'greek_restaurant': 'Greek',
              'mediterranean_restaurant': 'Mediterranean',
              'seafood_restaurant': 'Seafood',
              'steak_house': 'Steakhouse',
              'pizza_restaurant': 'Pizza',
              'sandwich_shop': 'Sandwiches',
              'coffee_shop': 'Coffee',
              'bakery': 'Bakery',
              'bar': 'Bar & Grill',
              'cafe': 'Cafe'
            }

            for (const type of types) {
              if (typeMap[type]) {
                return typeMap[type]
              }
            }
            return 'Restaurant'
          }

          // Only update fields that have actual data
          const cuisineName = getCuisineName(cuisineTypes)
          if (cuisineName && cuisineName !== 'Restaurant') {
            update.cuisine = cuisineName
          }
          
          if (placeDetails.formattedAddress) {
            update.location = placeDetails.formattedAddress
          }
          
          // WEB-BE-070: rating, review count, phone, website, Google's price
          // level, reservable and the listing link, from the same builder the
          // stale refresh uses. A field Google left out is absent, never null.
          Object.assign(update, buildGoogleFactsUpdate(placeDetails))

          // WEB-BE-066: Google's editorial summary when it has one, and
          // otherwise the stored description stays. This used to write null
          // whenever there was no summary, and since description was not in
          // the select, it did so to every description it touched.
          Object.assign(update, descriptionUpdate(restaurant.description, placeDetails.editorialSummary?.text))
          
          if (placeId) {
            update.google_place_id = placeId
          }

          // WEB-FEAT-024. reservable and googleMapsUri are written by
          // buildGoogleFactsUpdate above. There is NO booking-provider URL in
          // the Places API, so reservation_url stays curated (the admin edit
          // form sets it); googleMapsUri is the automatic fallback, since a
          // Google listing for a reservable place carries its own reserve
          // button.

          // WEB-BE-044. THE COMMENT HERE USED TO SAY it stored "the photo
          // reference name instead of the full URL with API key", and what it
          // assigned was a full media URL with the key stripped out. That URL
          // 403s, so every restaurant enriched this way has been rendering a
          // broken image; and hot-linking Places media out of a content column
          // is outside the Maps Platform terms even when it works.
          //
          // The resource name goes on the row instead. It is a reference, not
          // Place content, so it can be stored; anything that wants the bytes
          // builds the media URL at fetch time and does not keep them past the
          // 30-day window.
          if (placeDetails.photos && placeDetails.photos.length > 0) {
            const photo = placeDetails.photos[0]
            if (photo.name) {
              update.places_photo_name = photo.name
              update.places_photo_attribution =
                photo.authorAttributions?.map((a) => a.displayName).filter(Boolean).join(', ')
                || GOOGLE_ATTRIBUTION_TEXT
              update.places_photo_seen_at = new Date().toISOString()
            }
          }

          // WEB-BE-045. Both go through the normalizer rather than straight
          // from the response: an unrecognised status is dropped instead of
          // stored, because the column is filtered on and a value nobody
          // anticipated must not be read as a closure OR as an operating
          // venue; and hours are null rather than an empty periods array,
          // because `{periods: []}` reads as "closed all week" and means
          // "Google did not answer".
          const businessStatus = normalizeBusinessStatus(placeDetails.businessStatus)
          if (businessStatus) {
            update.business_status = businessStatus
          }
          const hours = normalizeOpeningHours(placeDetails.regularOpeningHours)
          if (hours) {
            update.hours_json = hours
          }

          // A belt-and-braces stop on the defect above: nothing in this
          // function may put a Places media URL into image_url again, however
          // it got there.
          if (isPlacesMediaUrl(update.image_url)) {
            console.warn(`Refusing to write a Places media URL into image_url for ${restaurant.name}`)
            delete update.image_url
          }
          
          console.log(`Update object for ${restaurant.name}:`, update)
        } else if (placeId) {
          // We found a place ID but couldn't get details, still save the place ID
          update.google_place_id = placeId
        }

        // WEB-BE-069: a field an owner or admin set keeps their value. This is
        // the one place the full enrichment's update leaves the loop.
        const kept = withoutLockedFields(update, restaurant.locked_fields)
        lockedSkips += kept.skipped.length
        if (kept.skipped.length > 0) {
          console.log(`Kept locked fields on ${restaurant.name}: ${kept.skipped.join(', ')}`)
        }
        updates.push(kept.update)

      } catch (error) {
        console.error(`Error processing restaurant ${restaurant.name}:`, error)
        errors.push({
          id: restaurant.id,
          name: restaurant.name,
          error: error.message
        })
      }

      // Add a small delay to avoid hitting rate limits
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Batch update the database
    if (updates.length > 0) {
      console.log(`Updating ${updates.length} restaurants in database`)
      
      for (const update of updates) {
        console.log(`Updating restaurant ${update.name} (ID: ${update.id}) with data:`, JSON.stringify(update, null, 2))
        
        let { error: updateError } = await supabase
          .from('restaurants')
          .update(update)
          .eq('id', update.id)
          .select()

        // MIGRATION-ORDER GUARD (WEB-FEAT-024). Edge functions deploy
        // separately from migrations, and this runs on a daily cron. If
        // 20260909000001 has not been applied yet, PostgREST rejects the whole
        // UPDATE for one unknown column - which would stop enrichment writing
        // ANY field, not just the new ones. Retry once without them so the
        // window between a function deploy and `supabase db push` costs the two
        // new columns and nothing else.
        if (updateError && isUnknownColumnError(updateError)) {
          console.warn(
            `Reservation, Places-provenance or hours columns not present yet; retrying ${update.name} without them`
          )
          const {
            reservable,
            google_maps_uri,
            places_photo_name,
            places_photo_attribution,
            places_photo_seen_at,
            // WEB-BE-045: added by 20260919000009 and stripped here for the
            // same reason as the rest. Missing them costs hours and a closure
            // flag; leaving them in when the migration has not landed costs
            // the whole update.
            business_status,
            hours_json,
            // WEB-BE-066: added by 20261121000040.
            enrich_checked_at,
            ...legacyUpdate
          } = update
          // WEB-BE-070: and the 20261121000130 columns (review count, rating
          // check date, price source).
          const retry = await supabase
            .from('restaurants')
            .update(withoutNewFactColumns(legacyUpdate))
            .eq('id', update.id)
            .select()
          updateError = retry.error
        }

        if (updateError) {
          console.error(`Failed to update restaurant ${update.name}:`, updateError)
          errors.push({
            id: update.id,
            name: update.name,
            error: updateError.message
          })
        } else if (update.enhanced) {
          // A stamp-only write for an unmatched row is not an enrichment;
          // auto-enrich-restaurants reads `updated` as its success count.
          updatedCount++
          console.log(`Successfully updated restaurant ${update.name}`)
        }
      }
    }

      ctx.processed(updatedCount)
      ctx.failed(errors.length)
      ctx.meta({
        unmatched,
        lockedSkips,
        sources: {
          'google-places': {
            fetched: restaurants.length,
            // Enrichment writes are updates; this function never inserts, so
            // `updated` is what the zero-result rule has to read as work done.
            inserted: updatedCount,
            duplicates: 0,
            errors: errors.length,
          },
        },
      })
    })

    if (!job.ok) {
      // runJob records the failed run and returns rather than rethrowing, so
      // the catch below no longer sees it.
      return new Response(
        JSON.stringify({ success: false, error: job.error ?? 'Bulk update failed', runId: job.runId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const response = {
      success: true,
      runId: job.runId,
      message: `Bulk update completed`,
      processed: restaurants.length,
      updated: updatedCount,
      // WEB-BE-066, both new keys: rows whose search found no hit with the
      // restaurant's name, and the cursor for the next run (pass as afterId).
      unmatched,
      lastId: restaurants[restaurants.length - 1].id,
      errors: errors.length,
      errorDetails: errors.length > 0 ? errors : undefined
    }

    console.log('Bulk update completed:', response)

    await writeAuditLog(supabase, {
      eventType: "admin_action",
      actorId: null, // API-key/cron triggered; no end-user actor
      action: "bulk_update_restaurants",
      resource: "restaurants",
      severity: "medium",
      ipAddress: auditIp(req),
      details: { processed: restaurants.length, updated: updatedCount, unmatched, errors: errors.length },
    });

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Bulk restaurant update error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Bulk update failed'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
