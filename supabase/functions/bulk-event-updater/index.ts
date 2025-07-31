import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const googleApiKey = Deno.env.get('GOOGLE_PLACES_API')!

const supabase = createClient(supabaseUrl, supabaseKey)

async function getStandardizedAddress(venue: string): Promise<string | null> {
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(
    venue
  )}&inputtype=textquery&fields=formatted_address,place_id,formatted_phone_number,website,rating&key=${googleApiKey}`
  const res = await fetch(url)
  type GooglePlacesResponse = {
    candidates?: Array<{
      formatted_address?: string
      place_id?: string
      formatted_phone_number?: string
      website?: string
      rating?: number
    }>
  }
  const data = (await res.json()) as GooglePlacesResponse
  if (data.candidates && data.candidates.length > 0) {
    return data.candidates[0].formatted_address || null
  }
  return null
}

serve(async (req) => {
  try {
    const { data: events, error } = await supabase
      .from('events')
      .select('id, venue, location')
      .is('location', null)

    if (error) throw error
    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ message: 'No events to update.' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    for (const event of events) {
      if (event.venue) {
        const address = await getStandardizedAddress(event.venue)
        if (address) {
          await supabase
            .from('events')
            .update({ location: address })
            .eq('id', event.id)
          console.log(`Updated event ${event.id} with address: ${address}`)
        } else {
          console.log(`No address found for venue: ${event.venue}`)
        }
      }
    }

    return new Response(JSON.stringify({ message: 'Events updated successfully.' }), {
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
