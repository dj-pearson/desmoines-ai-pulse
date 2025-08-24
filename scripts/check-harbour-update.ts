import { createClient } from "@supabase/supabase-js";

// Using same credentials as event-datetime-crawler.ts
const SUPABASE_URL = "https://wtkhfqpmcegzcbngroui.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1Mzc5NzcsImV4cCI6MjA2OTExMzk3N30.a-qKhaxy7l72IyT0eLq7kYuxm-wypuMxgycDy95r1aE";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function checkHarbourUpdate() {
  console.log("🔍 Checking Harbour event updates...");
  
  const { data, error } = await supabase
    .from("events")
    .select("id, title, date, updated_at, source_url")
    .ilike("title", "%harbour%")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("❌ Error querying events:", error);
    return;
  }

  if (!data || data.length === 0) {
    console.log("📭 No Harbour events found");
    return;
  }

  console.log(`📊 Found ${data.length} Harbour event(s):`);
  data.forEach((event, index) => {
    console.log(`\n${index + 1}. Event ID: ${event.id}`);
    console.log(`   Title: ${event.title}`);
    console.log(`   Date: ${event.date}`);
    console.log(`   Updated: ${event.updated_at}`);
    console.log(`   Source: ${event.source_url}`);
  });

  // Check if any were updated in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentlyUpdated = data.filter(event => 
    new Date(event.updated_at) > oneHourAgo
  );

  if (recentlyUpdated.length > 0) {
    console.log(`\n✅ ${recentlyUpdated.length} event(s) updated in the last hour:`);
    recentlyUpdated.forEach(event => {
      console.log(`   - ${event.title} (ID: ${event.id})`);
    });
  } else {
    console.log("\n⏰ No Harbour events updated in the last hour");
  }
}

checkHarbourUpdate().catch(console.error);
