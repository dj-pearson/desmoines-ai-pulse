import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getStandardizedAddress(venue: string): Promise<string | null> {
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(venue)}&inputtype=textquery&fields=formatted_address,place_id,formatted_phone_number,website,rating&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  type GooglePlacesResponse = {
    candidates?: Array<{
      formatted_address?: string;
      place_id?: string;
      formatted_phone_number?: string;
      website?: string;
      rating?: number;
    }>;
  };
  const data = (await res.json()) as GooglePlacesResponse;
  if (data.candidates && data.candidates.length > 0) {
    return data.candidates[0].formatted_address || null;
  }
  return null;
}

async function updateEventLocations(batchSize = 10) {
  // Get all events with a venue and missing or non-standard location
  const { data: events, error } = await supabase
    .from('events')
    .select('id, venue, location')
    .is('location', null);

  if (error) throw error;
  if (!events || events.length === 0) {
    console.log('No events to update.');
    return;
  }

  for (const event of events) {
    if (event.venue) {
      const address = await getStandardizedAddress(event.venue);
      if (address) {
        await supabase
          .from('events')
          .update({ location: address })
          .eq('id', event.id);
        console.log(`Updated event ${event.id} with address: ${address}`);
      } else {
        console.log(`No address found for venue: ${event.venue}`);
      }
    }
  }
}

updateEventLocations().catch(console.error);
