import { createClient } from "@supabase/supabase-js";

// Using environment variables for secure credential management
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Missing required environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function analyzeEventDates() {
  console.log("📊 Analyzing event date patterns...");
  
  const { data, error } = await supabase
    .from("events")
    .select("id, title, source_url, date, updated_at")
    .not("source_url", "is", null)
    .order("date", { ascending: true });

  if (error) {
    console.error("❌ Error querying events:", error);
    return;
  }

  if (!data || data.length === 0) {
    console.log("📭 No events found");
    return;
  }

  const currentDate = new Date('2025-07-30');
  const oneYearFromNow = new Date('2026-07-30');
  
  // Categorize events by date validity for our new validation
  const pastEvents = data.filter(event => new Date(event.date) < currentDate);
  const validFutureEvents = data.filter(event => {
    const eventDate = new Date(event.date);
    return eventDate >= currentDate && eventDate <= oneYearFromNow;
  });
  const farFutureEvents = data.filter(event => new Date(event.date) > oneYearFromNow);

  console.log(`\n📅 Date analysis (as of ${currentDate.toDateString()}):`);
  console.log(`   📍 Total events: ${data.length}`);
  console.log(`   ❌ Past events (would be rejected): ${pastEvents.length}`);
  console.log(`   ✅ Valid future events (0-1 year): ${validFutureEvents.length}`);
  console.log(`   ⚠️  Far future events (>1 year): ${farFutureEvents.length}`);

  if (pastEvents.length > 0) {
    console.log(`\n🔍 Sample past events that would be rejected:`);
    pastEvents.slice(0, 5).forEach((event, index) => {
      console.log(`   ${index + 1}. ${event.title} - ${event.date} (${event.source_url})`);
    });
  }

  if (farFutureEvents.length > 0) {
    console.log(`\n🔍 Sample far future events that would be rejected:`);
    farFutureEvents.slice(0, 5).forEach((event, index) => {
      console.log(`   ${index + 1}. ${event.title} - ${event.date} (${event.source_url})`);
    });
  }

  // Look for events that might have problematic source URLs
  const genericUrlPatterns = [
    '/events',
    '/calendar',
    '/event-calendar',
    'catchdesmoines.com/events',
  ];

  const potentiallyProblematicEvents = data.filter(event => 
    genericUrlPatterns.some(pattern => event.source_url.includes(pattern)) &&
    !event.source_url.includes(event.title.toLowerCase().replace(/[^a-z0-9]/gi, '-'))
  );

  if (potentiallyProblematicEvents.length > 0) {
    console.log(`\n⚠️  Events with potentially generic URLs (${potentiallyProblematicEvents.length}):`);
    potentiallyProblematicEvents.slice(0, 3).forEach((event, index) => {
      console.log(`   ${index + 1}. ${event.title} - ${event.source_url}`);
    });
  }
}

analyzeEventDates().catch(console.error);
