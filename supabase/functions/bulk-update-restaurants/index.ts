import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { requireApiKey } from "../_shared/apiKeyAuth.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { writeAuditLog, auditIp } from "../_shared/auditLog.ts";
import { fetchWithTimeout } from '../_shared/fetchWithTimeout.ts';
import { isUnknownColumnError } from '../_shared/postgrestErrors.ts'
import { runJob } from '../_shared/jobRunner.ts'
import { isPlacesMediaUrl, GOOGLE_ATTRIBUTION_TEXT } from '../_shared/placesPhoto.ts'
import { normalizeBusinessStatus, normalizeOpeningHours } from '../_shared/placeHours.ts'
import type { BusinessStatus, StoredHours } from '../_shared/placeHours.ts'

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

interface RestaurantUpdate {
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
  enhanced: string;
  updated_at: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  // Require API key authentication (SEC-013)
  const authResponse = requireApiKey(req, corsHeaders);
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

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { batchSize = 10, forceUpdate = false, clearEnhanced = false } = await req.json()

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

    // Get restaurants that need updating
    let query = supabase
      .from('restaurants')
      .select('id, name, location, google_place_id, enhanced')
      .limit(batchSize)

    // Only get unenhanced restaurants unless force update is requested
    if (!forceUpdate) {
      query = query.or('enhanced.is.null,enhanced.neq.completed')
    }

    const { data: restaurants, error: fetchError } = await query

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
              const searchData = await searchResponse.json()
              console.log(`Search results for "${searchQuery}":`, JSON.stringify(searchData, null, 2))
              
              if (searchData.places && searchData.places.length > 0) {
                // Look for the best match (prefer exact name matches)
                let bestMatch = searchData.places[0]
                for (const place of searchData.places) {
                  if (place.displayName?.text?.toLowerCase().includes(restaurant.name.toLowerCase().split(' ')[0])) {
                    bestMatch = place
                    break
                  }
                }
                
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
              'X-Goog-FieldMask': 'id,displayName,formattedAddress,rating,editorialSummary,nationalPhoneNumber,websiteUri,photos,photos.authorAttributions,types,businessStatus,regularOpeningHours,reservable,googleMapsUri'
            }
          })

          if (detailsResponse.ok) {
            placeDetails = await detailsResponse.json()
            console.log(`Retrieved details for ${restaurant.name}`)
          } else {
            console.error(`Failed to get details for place ${placeId}:`, await detailsResponse.text())
          }
        }

        // Build the update object
        const update: any = {
          id: restaurant.id,
          name: restaurant.name,
          enhanced: 'completed',
          updated_at: new Date().toISOString()
        }

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
          
          if (placeDetails.rating) {
            update.rating = Math.round(placeDetails.rating * 10) / 10
          }
          
          // Use editorial summary as description if available and replace "Discovered via Google Places API"
          if (placeDetails.editorialSummary?.text) {
            update.description = placeDetails.editorialSummary.text
          } else if (restaurant.description === 'Discovered via Google Places API' || !restaurant.description) {
            // If no editorial summary but current description is generic or null, set to null
            update.description = null
          }
          
          if (placeDetails.nationalPhoneNumber) {
            update.phone = placeDetails.nationalPhoneNumber
          }
          
          if (placeDetails.websiteUri) {
            update.website = placeDetails.websiteUri
          }
          
          if (placeId) {
            update.google_place_id = placeId
          }

          // WEB-FEAT-024. Both are real Place fields, checked against the
          // Places API (New) reference. There is NO booking-provider URL in
          // that API, so reservation_url stays curated; googleMapsUri is the
          // automatic fallback, since a Google listing for a reservable place
          // carries its own reserve button.
          if (typeof placeDetails.reservable === 'boolean') {
            update.reservable = placeDetails.reservable
          }
          if (placeDetails.googleMapsUri) {
            update.google_maps_uri = placeDetails.googleMapsUri
          }

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

        updates.push(update)

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
            ...legacyUpdate
          } = update
          const retry = await supabase
            .from('restaurants')
            .update(legacyUpdate)
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
        } else {
          updatedCount++
          console.log(`Successfully updated restaurant ${update.name}`)
        }
      }
    }

      ctx.processed(updatedCount)
      ctx.failed(errors.length)
      ctx.meta({
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
      details: { processed: restaurants.length, updated: updatedCount, errors: errors.length },
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
