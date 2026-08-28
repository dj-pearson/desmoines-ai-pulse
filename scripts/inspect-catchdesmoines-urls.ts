/**
 * Ad-hoc diagnostic: prints the ten most recently updated events whose source_url is a catchdesmoines.com page.
 *
 * NOT A CHECK. It has no baseline, no verdict and always exits 0. It was named
 * check-* and sat in a directory of 32 real ratchets, so an audit of which
 * checks are wired into CI had to open it to find out it was never meant to be.
 * Renamed to inspect-* for that reason; nothing referenced it.
 */
import { createClient } from "@supabase/supabase-js";

// Using environment variables for secure credential management
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Missing required environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function checkCatchDesMoinesUrls() {
  console.log("🔍 Checking CatchDesMoines URLs...");
  
  const { data, error } = await supabase
    .from("events")
    .select("id, title, source_url, date, updated_at")
    .not("source_url", "is", null)
    .ilike("source_url", "%catchdesmoines%")
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("❌ Error querying events:", error);
    return;
  }

  if (!data || data.length === 0) {
    console.log("📭 No CatchDesMoines events found");
    return;
  }

  console.log(`📊 Found ${data.length} CatchDesMoines event(s):`);
  data.forEach((event, index) => {
    console.log(`\n${index + 1}. Event ID: ${event.id}`);
    console.log(`   Title: ${event.title}`);
    console.log(`   Date: ${event.date}`);
    console.log(`   Updated: ${event.updated_at}`);
    console.log(`   Source: ${event.source_url}`);
    
    // Check if the URL looks generic
    const isGeneric = event.source_url.includes('/events') && 
                     !event.source_url.includes(event.title.toLowerCase().replace(/\s+/g, '-'));
    if (isGeneric) {
      console.log(`   🚨 Potentially generic URL - may extract wrong dates`);
    }
  });

  // Show date distribution
  const currentDate = new Date('2025-07-30');
  const pastEvents = data.filter(event => new Date(event.date) < currentDate);
  const todayEvents = data.filter(event => {
    const eventDate = new Date(event.date);
    return eventDate.toDateString() === currentDate.toDateString();
  });
  const futureEvents = data.filter(event => new Date(event.date) > currentDate);

  console.log(`\n📅 Date distribution:`);
  console.log(`   Past events: ${pastEvents.length}`);
  console.log(`   Today's events: ${todayEvents.length}`);
  console.log(`   Future events: ${futureEvents.length}`);
}

checkCatchDesMoinesUrls().catch(console.error);
