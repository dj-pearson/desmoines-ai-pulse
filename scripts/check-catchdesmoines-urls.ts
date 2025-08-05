import { createClient } from "@supabase/supabase-js";

// Using same credentials as event-datetime-crawler.ts
const SUPABASE_URL = "https://wtkhfqpmcegzcbngroui.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1Mzc5NzcsImV4cCI6MjA2OTExMzk3N30.a-qKhaxy7l72IyT0eLq7kYuxm-wypuMxgycDy95r1aE";

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
