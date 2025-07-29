import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
  }>;
  types: string[];
  businessStatus: string;
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
  enhanced: string;
  updated_at: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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

    const { batchSize = 10, forceUpdate = false } = await req.json()

    console.log(`Starting bulk restaurant update with batch size: ${batchSize}`)

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
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No restaurants found that need updating',
          updated: 0 
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

    // Process each restaurant
    for (const restaurant of restaurants) {
      try {
        console.log(`Processing restaurant: ${restaurant.name}`)

        let placeId = restaurant.google_place_id
        let placeDetails: GooglePlaceDetails | null = null

        // If no Google Place ID, search for it first
        if (!placeId && restaurant.name && restaurant.location) {
          const searchQuery = `${restaurant.name} ${restaurant.location}`
          const searchUrl = `https://places.googleapis.com/v1/places:searchText`
          
          const searchResponse = await fetch(searchUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': googleApiKey,
              'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress'
            },
            body: JSON.stringify({
              textQuery: searchQuery,
              maxResultCount: 1,
              locationBias: {
                region: 'US-IA'  // Bias towards Iowa
              }
            })
          })

          if (searchResponse.ok) {
            const searchData = await searchResponse.json()
            if (searchData.places && searchData.places.length > 0) {
              placeId = searchData.places[0].id
              console.log(`Found place ID for ${restaurant.name}: ${placeId}`)
            }
          }
        }

        // If we have a place ID, get detailed information
        if (placeId) {
          const detailsUrl = `https://places.googleapis.com/v1/places/${placeId}`
          
          const detailsResponse = await fetch(detailsUrl, {
            method: 'GET',
            headers: {
              'X-Goog-Api-Key': googleApiKey,
              'X-Goog-FieldMask': 'id,displayName,formattedAddress,rating,editorialSummary,nationalPhoneNumber,websiteUri,photos,types,businessStatus'
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

          // Get the main photo URL
          if (placeDetails.photos && placeDetails.photos.length > 0) {
            const photo = placeDetails.photos[0]
            // Use the Google Places Photo API to get the actual image URL
            update.image_url = `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=1200&maxHeightPx=800&key=${googleApiKey}`
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
    let updatedCount = 0
    if (updates.length > 0) {
      console.log(`Updating ${updates.length} restaurants in database`)
      
      for (const update of updates) {
        console.log(`Updating restaurant ${update.name} (ID: ${update.id}) with data:`, JSON.stringify(update, null, 2))
        
        const { error: updateError } = await supabase
          .from('restaurants')
          .update(update)
          .eq('id', update.id)
          .select()

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

    const response = {
      success: true,
      message: `Bulk update completed`,
      processed: restaurants.length,
      updated: updatedCount,
      errors: errors.length,
      errorDetails: errors.length > 0 ? errors : undefined
    }

    console.log('Bulk update completed:', response)

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
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
