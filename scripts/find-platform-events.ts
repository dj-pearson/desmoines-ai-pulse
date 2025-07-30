import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wtkhfqpmcegzcbngroui.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1Mzc5NzcsImV4cCI6MjA2OTExMzk3N30.a-qKhaxy7l72IyT0eLq7kYuxm-wypuMxgycDy95r1aE";

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
