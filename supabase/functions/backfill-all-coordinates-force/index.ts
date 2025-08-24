import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const googleApiKey = Deno.env.get('GOOGLE_PLACES_API')!

const supabase = createClient(supabaseUrl, supabaseKey)

async function getCoordinates(venue: string): Promise<{ lat: number; lng: number } | null> {
  const query = `${venue}, Des Moines, Iowa`
  const url = 'https://places.googleapis.com/v1/places:searchText'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleApiKey,
      'X-Goog-FieldMask': 'places.location',
    },
    body: JSON.stringify({ textQuery: query }),
  })
  type GooglePlacesResponse = {
    places?: Array<{
      location?: {
        latitude: number
        longitude: number
      }
    }>
  }
  const data = (await res.json()) as GooglePlacesResponse
  if (data.places && data.places.length > 0 && data.places[0].location) {
    return {
      lat: data.places[0].location.latitude,
      lng: data.places[0].location.longitude,
    }
  }
  return null
}

serve(async (req) => {
  try {
    const { data: events, error } = await supabase
      .from('events')
      .select('id, venue, location, latitude, longitude')

    if (error) throw error
    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ message: 'No events to update.' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    for (const event of events) {
      if (event.venue) {
        const coordinates = await getCoordinates(event.venue)
        if (coordinates) {
          await supabase
            .from('events')
            .update({ latitude: coordinates.lat, longitude: coordinates.lng })
            .eq('id', event.id)
          console.log(`Updated event ${event.id} with coordinates: ${coordinates.lat}, ${coordinates.lng}`)
        } else {
          console.log(`No coordinates found for venue: ${event.venue}`)
        }
      }
    }

    return new Response(JSON.stringify({ message: 'Coordinates updated successfully.' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
