import { createClient } from "@supabase/supabase-js";

// Using environment variables for secure credential management
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Missing required environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function analyzeEventUrls() {
  console.log("🔍 Analyzing event URL patterns...");
  
  const { data: events, error } = await supabase
    .from("events")
    .select("id, title, source_url")
    .not("source_url", "is", null);

  if (error) {
    console.error("❌ Error fetching events:", error);
    return;
  }

  if (!events || events.length === 0) {
    console.log("📭 No events with source URLs found");
    return;
  }

  // Categorize URLs
  const categories = {
    goodUrls: [] as typeof events,
    genericUrls: [] as typeof events,
    specificPlatforms: [] as typeof events
  };

  const genericPatterns = [
    '/events?',
    '/events/?',
    '/calendar',
    '/event-calendar',
    'catchdesmoines.com/events/?skip=',
    'catchdesmoines.com/events/?utm_source='
  ];

  const specificPlatforms = [
    'eventbrite.com/e/',
    'firstfleetconcerts.com/events/detail/',
    'desmoinesperformingarts.org/whats-on/events/',
    'ticketmaster.com',
    'stubhub.com'
  ];

  events.forEach(event => {
    const url = event.source_url;
    
    // Check if it's a generic URL
    const isGeneric = genericPatterns.some(pattern => url.includes(pattern));
    
    // Check if it's a specific platform
    const isSpecificPlatform = specificPlatforms.some(pattern => url.includes(pattern));
    
    if (isGeneric) {
      categories.genericUrls.push(event);
    } else if (isSpecificPlatform) {
      categories.specificPlatforms.push(event);
    } else {
      categories.goodUrls.push(event);
    }
  });

  console.log(`\n📊 URL Analysis Results:`);
  console.log(`───────────────────────────────────────`);
  console.log(`✅ Specific Platform URLs: ${categories.specificPlatforms.length}`);
  console.log(`🟡 Other URLs (potential): ${categories.goodUrls.length}`);
  console.log(`❌ Generic Calendar URLs: ${categories.genericUrls.length}`);
  console.log(`📍 Total Events: ${events.length}`);

  console.log(`\n🎯 Recommendation:`);
  console.log(`• Process Specific Platforms (${categories.specificPlatforms.length} events) - High success rate`);
  console.log(`• Process Other URLs (${categories.goodUrls.length} events) - Medium success rate`);
  console.log(`• Skip Generic URLs (${categories.genericUrls.length} events) - Low success rate, wrong data`);

  console.log(`\n🏢 Specific Platform Breakdown:`);
  const platformCounts = {};
  categories.specificPlatforms.forEach(event => {
    const url = event.source_url;
    let platform = 'Other';
    
    if (url.includes('eventbrite.com')) platform = 'Eventbrite';
    else if (url.includes('firstfleetconcerts.com')) platform = 'First Fleet';
    else if (url.includes('desmoinesperformingarts.org')) platform = 'DMPA';
    else if (url.includes('ticketmaster.com')) platform = 'Ticketmaster';
    
    platformCounts[platform] = (platformCounts[platform] || 0) + 1;
  });

  Object.entries(platformCounts).forEach(([platform, count]) => {
    console.log(`   ${platform}: ${count} events`);
  });

  console.log(`\n❌ Sample Generic URLs to skip:`);
  categories.genericUrls.slice(0, 3).forEach((event, i) => {
    console.log(`   ${i + 1}. ${event.title}`);
    console.log(`      ${event.source_url.substring(0, 80)}...`);
  });

  // Output safe event IDs for processing
  const safeEvents = [...categories.specificPlatforms, ...categories.goodUrls];
  console.log(`\n📋 Safe Events for Processing: ${safeEvents.length}`);
  
  if (safeEvents.length > 0) {
    const sampleIds = safeEvents.slice(0, 5).map(e => e.id);
    console.log(`\n🔧 To process specific platforms only (recommended):`);
    console.log(`npx tsx scripts/event-datetime-sql-generator.ts --platform-filter`);
    
    console.log(`\n🔧 To process all safe URLs:`);
    console.log(`npx tsx scripts/event-datetime-sql-generator.ts --safe-urls-only`);
    
    console.log(`\n🔧 To process ALL events (including problematic ones):`);
    console.log(`npx tsx scripts/event-datetime-sql-generator.ts --all`);
  }
}

analyzeEventUrls().catch(console.error);
