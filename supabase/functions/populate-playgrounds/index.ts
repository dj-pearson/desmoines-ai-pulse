import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const googleApiKey = Deno.env.get('GOOGLE_PLACES_API')!

const supabase = createClient(supabaseUrl, supabaseKey)

// Central coordinates for Des Moines, IA (approximate)
const DES_MOINES_LAT = 41.5909
const DES_MOINES_LNG = -93.6208

async function searchPlaygrounds(radius_meters: number): Promise<any[]> {
  const url = 'https://places.googleapis.com/v1/places:searchText'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleApiKey,
      'X-Goog-FieldMask':
        'places.displayName,places.formattedAddress,places.editorialSummary,places.photos',
    },
    body: JSON.stringify({
      textQuery: 'playground',
      locationBias: {
        circle: {
          center: { latitude: DES_MOINES_LAT, longitude: DES_MOINES_LNG },
          radius: radius_meters,
        },
      },
    }),
  })
  const data = await res.json()
  console.log('Google Places API response status:', res.status)
  console.log('Google Places API full response data:', data)
  console.log('Google Places API response (places):', data.places)
  return data.places || []
}

serve(async (req) => {
  try {
    const { radius_meters } = await req.json()
    if (!radius_meters) {
      return new Response(
        JSON.stringify({ error: 'radius_meters is required.' }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    const playgrounds = await searchPlaygrounds(radius_meters)
    let newPlaygroundsCount = 0

    for (const playground of playgrounds) {
      const name = playground.displayName?.text || 'Unknown Playground'
      const location = playground.formattedAddress || 'Unknown Address'
      const description = playground.editorialSummary?.text || null
      const imageUrl = playground.photos?.[0]?.name || null // Store photo resource name

      // Check for duplicates
      const { data: existingPlayground, error: fetchError } = await supabase
        .from('playgrounds')
        .select('id')
        .eq('name', name)
        .eq('location', location)
        .single()

      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 means no rows found
        console.error('Error checking for existing playground:', fetchError)
        continue
      }

      if (!existingPlayground) {
        // Insert new playground
        const { error: insertError } = await supabase.from('playgrounds').insert({
          name,
          location,
          description,
          age_range: null, // Google Places API does not provide this directly
          amenities: null, // Google Places API does not provide this directly
          image_url: imageUrl,
        })

        if (insertError) {
          console.error('Error inserting playground:', insertError)
        } else {
          newPlaygroundsCount++
          console.log(`Inserted new playground: ${name}`)
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: `Found ${playgrounds.length} playgrounds, inserted ${newPlaygroundsCount} new ones.`,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
