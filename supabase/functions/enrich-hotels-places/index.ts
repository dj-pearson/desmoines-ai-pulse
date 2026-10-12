/**
 * enrich-hotels-places: give each hotel its Google place id and photo
 * reference, and refuse to guess.
 *
 * WHAT WAS THERE (2026-10-11): 63 active hotels, none with google_place_id or
 * any image. search-new-hotels finds NEW hotels; nothing resolved the ones
 * already listed.
 *
 * WHAT THIS WRITES, for a hotel with no google_place_id, when the match is
 * confident (_shared/hotelPlaceMatch.ts):
 *   - google_place_id (a place id may be stored indefinitely)
 *   - places_photo_name / _attribution / _seen_at (the reference, never a
 *     media URL; backfill-images turns it into a displayable copy)
 *   - latitude/longitude, phone, website ONLY where ours is empty
 * It never touches description, short_description, rates, amenities, star
 * rating, image_url or anything an editor curates.
 *
 * DRY RUN IS THE DEFAULT. `{"dryRun": false}` is what writes. A dry run reports,
 * per hotel, the place it would take (name, formatted address, place id) and
 * the confidence, or why it refused.
 *
 * Request body (all optional):
 *   dryRun       boolean, default true
 *   batchSize    1..25, default 10. One paid Text Search per hotel.
 *   afterId      uuid cursor; pass back `lastId` to take the next rows
 *   allowMedium  boolean, default false. Also write medium matches (no street
 *                number on our row, strong name + ZIP/city agreement).
 *   hotelIds     uuid[]; restrict to these rows (still only rows with no place id)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { writeAuditLog, auditIp } from "../_shared/auditLog.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { isUnknownColumnError } from "../_shared/postgrestErrors.ts";
import { runJob } from "../_shared/jobRunner.ts";
import {
  buildHotelPlaceUpdate,
  decideHotelMatch,
  type HotelPlaceRow,
  type SearchPlace,
} from "../_shared/hotelPlaceMatch.ts";

const MAX_BATCH = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DES_MOINES = { latitude: 41.5868, longitude: -93.625 };

/**
 * photos.authorAttributions must be named, or Places returns photos without it
 * and the attribution falls back to the generic line (WEB-BE-044).
 */
const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.types",
  "places.businessStatus",
  "places.location",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.photos",
  "places.photos.authorAttributions",
].join(",");

type HotelRow = HotelPlaceRow;


const PROVENANCE_COLUMNS = ["places_photo_name", "places_photo_attribution", "places_photo_seen_at"] as const;

async function searchPlaces(apiKey: string, hotel: HotelRow): Promise<SearchPlace[]> {
  const textQuery = [hotel.name, hotel.address, hotel.city, hotel.state || "IA"].filter(Boolean).join(", ");
  const center = hotel.latitude != null && hotel.longitude != null
    ? { latitude: Number(hotel.latitude), longitude: Number(hotel.longitude) }
    : DES_MOINES;
  const res = await fetchWithTimeout("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery,
      includedType: "lodging",
      maxResultCount: 5,
      locationBias: { circle: { center, radius: 50_000 } },
    }),
  });
  if (!res.ok) {
    // The body names the quota or key problem; the key itself is in a header,
    // never in this text.
    throw new Error(`Places searchText ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return Array.isArray(data?.places) ? data.places : [];
}

interface ResultRow {
  id: string;
  name: string;
  address: string | null;
  status: "would_write" | "written" | "refused" | "ambiguous" | "no_candidates" | "duplicate_place" | "error";
  confidence?: string;
  place?: { id: string; name: string; formattedAddress: string; nameScore: number; address: string };
  fields?: string[];
  reasons?: string[];
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const authResponse = await requireAdminOrApiKey(req, corsHeaders);
  if (authResponse) return authResponse;

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const rateLimit = checkRateLimit(req, { max: 10, message: "Too many hotel enrichment requests. Try again later." });
  if (!rateLimit.success && rateLimit.response) return rateLimit.response;

  try {
    const apiKey = Deno.env.get("GOOGLE_SEARCH_API");
    if (!apiKey) return json({ success: false, error: "GOOGLE_SEARCH_API is not set" }, 500);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false;
    const allowMedium = body?.allowMedium === true;
    const batchSize = Math.min(Math.max(Math.floor(Number(body?.batchSize)) || 10, 1), MAX_BATCH);
    const afterId = typeof body?.afterId === "string" && UUID.test(body.afterId) ? body.afterId : null;
    const hotelIds: string[] = Array.isArray(body?.hotelIds)
      ? body.hotelIds.filter((x: unknown) => typeof x === "string" && UUID.test(x)).slice(0, MAX_BATCH)
      : [];

    let query = supabase
      .from("hotels")
      .select("id, name, address, city, state, zip, latitude, longitude, phone, website")
      .is("google_place_id", null)
      .eq("is_active", true)
      .order("id", { ascending: true })
      .limit(batchSize);
    if (afterId) query = query.gt("id", afterId);
    if (hotelIds.length > 0) query = query.in("id", hotelIds);
    const { data: rows, error: fetchError } = await query;
    if (fetchError) return json({ success: false, error: `Failed to read hotels: ${fetchError.message}` }, 500);
    const hotels = (rows ?? []) as HotelRow[];

    // Place ids already on a hotel. A second hotel claiming one is a wrong
    // match or a duplicate listing, and either way not something to write.
    const { data: taken, error: takenError } = await supabase
      .from("hotels")
      .select("id, google_place_id")
      .not("google_place_id", "is", null);
    if (takenError) return json({ success: false, error: `Failed to read existing place ids: ${takenError.message}` }, 500);
    const claimed = new Map<string, string>((taken ?? []).map((r: { id: string; google_place_id: string }) => [r.google_place_id, r.id]));

    const results: ResultRow[] = [];
    let written = 0;
    let provenanceColumnsMissing = false;

    const work = async () => {
      for (const hotel of hotels) {
        const base = { id: hotel.id, name: hotel.name, address: hotel.address };
        try {
          const places = await searchPlaces(apiKey, hotel);
          const decision = decideHotelMatch(hotel, places, { allowMedium });
          const best = decision.best;
          const place = best
            ? { id: best.placeId, name: best.placeName, formattedAddress: best.formattedAddress, nameScore: best.nameScore, address: best.address }
            : undefined;

          if (!decision.accepted) {
            results.push({
              ...base,
              status: decision.status === "matched" ? "refused" : decision.status,
              confidence: best?.confidence,
              place,
              reasons: decision.reasons,
            });
            continue;
          }

          const owner = claimed.get(decision.accepted.placeId);
          if (owner && owner !== hotel.id) {
            results.push({
              ...base,
              status: "duplicate_place",
              confidence: decision.accepted.confidence,
              place,
              reasons: [`place id already belongs to hotel ${owner}`],
            });
            continue;
          }

          const chosen = places.find((p) => p.id === decision.accepted!.placeId) as SearchPlace;
          const update = buildHotelPlaceUpdate(hotel, chosen, new Date().toISOString());
          const fields = Object.keys(update);

          if (dryRun) {
            results.push({ ...base, status: "would_write", confidence: decision.accepted.confidence, place, fields, reasons: decision.reasons });
            claimed.set(decision.accepted.placeId, hotel.id);
            continue;
          }

          // Conditional on google_place_id still being null, so a concurrent
          // run or an editor who set it meanwhile wins.
          let { data: hit, error: updateError } = await supabase
            .from("hotels").update(update).eq("id", hotel.id).is("google_place_id", null).select("id");
          // MIGRATION-ORDER GUARD, as in bulk-update-restaurants. If
          // 20261020000002 is not applied yet, retry without the provenance
          // columns so the place id still lands.
          if (updateError && isUnknownColumnError(updateError)) {
            provenanceColumnsMissing = true;
            const legacy = { ...update };
            for (const c of PROVENANCE_COLUMNS) delete legacy[c];
            ({ data: hit, error: updateError } = await supabase
              .from("hotels").update(legacy).eq("id", hotel.id).is("google_place_id", null).select("id"));
          }
          if (updateError) {
            results.push({ ...base, status: "error", place, reasons: [updateError.message] });
            continue;
          }
          if (!hit || hit.length === 0) {
            results.push({ ...base, status: "refused", place, reasons: ["google_place_id was set by someone else during this run; left alone"] });
            continue;
          }
          claimed.set(decision.accepted.placeId, hotel.id);
          written++;
          results.push({ ...base, status: "written", confidence: decision.accepted.confidence, place, fields, reasons: decision.reasons });
        } catch (error) {
          results.push({ ...base, status: "error", reasons: [(error as Error).message] });
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    };

    let runId: string | null = null;
    if (dryRun) {
      await work();
    } else {
      const job = await runJob("enrich-hotels-places", async (ctx) => {
        await work();
        ctx.processed(written);
        ctx.failed(results.filter((r) => r.status === "error").length);
        ctx.meta({
          refused: results.filter((r) => r.status !== "written" && r.status !== "error").length,
          provenanceColumnsMissing,
          sources: { "google-places": { fetched: hotels.length, inserted: written, duplicates: 0, errors: results.filter((r) => r.status === "error").length } },
        });
      });
      runId = job.runId;
      if (!job.ok) return json({ success: false, error: job.error ?? "Hotel enrichment failed", runId }, 500);
      await writeAuditLog(supabase, {
        eventType: "admin_action",
        actorId: null,
        action: "enrich_hotels_places",
        resource: "hotels",
        severity: "low",
        ipAddress: auditIp(req),
        details: { processed: hotels.length, written },
      });
    }

    const tally = (s: ResultRow["status"]) => results.filter((r) => r.status === s).length;
    return json({
      success: true,
      dryRun,
      runId,
      allowMedium,
      processed: hotels.length,
      wouldWrite: tally("would_write"),
      written,
      refused: tally("refused"),
      ambiguous: tally("ambiguous"),
      noCandidates: tally("no_candidates"),
      duplicatePlace: tally("duplicate_place"),
      errors: tally("error"),
      provenanceColumnsMissing,
      lastId: hotels.length > 0 ? hotels[hotels.length - 1].id : null,
      results,
    });
  } catch (error) {
    console.error("enrich-hotels-places failed:", (error as Error).message);
    return json({ success: false, error: "Hotel enrichment failed" }, 500);
  }
});
