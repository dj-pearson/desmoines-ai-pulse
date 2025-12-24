import { createClient } from "@supabase/supabase-js";

// Using environment variables for secure credential management
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Missing required environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function findSpecificPlatformEvents() {
  console.log("🔍 Finding events with specific platform URLs...");
  
  const platforms = [
    { name: "Eventbrite", pattern: "%eventbrite%" },
    { name: "First Fleet Concerts", pattern: "%firstfleetconcerts%" },
    { name: "Des Moines Performing Arts", pattern: "%desmoinesperformingarts%" },
    { name: "Iowa Cubs", pattern: "%milb.com/iowa%" },
  ];

  for (const platform of platforms) {
    console.log(`\n🏢 ${platform.name} Events:`);
    
    const { data, error } = await supabase
      .from("events")
      .select("id, title, source_url, date")
      .ilike("source_url", platform.pattern)
      .limit(3);

    if (error) {
      console.error(`❌ Error querying ${platform.name}:`, error);
      continue;
    }

    if (!data || data.length === 0) {
      console.log("   📭 No events found");
      continue;
    }

    data.forEach((event, index) => {
      console.log(`   ${index + 1}. ${event.title}`);
      console.log(`      ID: ${event.id}`);
      console.log(`      Date: ${event.date}`);
      console.log(`      URL: ${event.source_url}`);
      console.log("");
    });
  }
}

findSpecificPlatformEvents().catch(console.error);
