import { createClient } from "@supabase/supabase-js";

// Using same credentials as event-datetime-crawler.ts
const SUPABASE_URL = "https://wtkhfqpmcegzcbngroui.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1Mzc5NzcsImV4cCI6MjA2OTExMzk3N30.a-qKhaxy7l72IyT0eLq7kYuxm-wypuMxgycDy95r1aE";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function findWineEvent() {
  console.log("🔍 Looking for Iowa Wine and Cider Festival event...");
  
  const { data, error } = await supabase
    .from("events")
    .select("id, title, source_url, date, updated_at")
    .ilike("title", "%wine%cider%festival%")
    .or("title.ilike.%iowa wine%,title.ilike.%wine and cider%");

  if (error) {
    console.error("❌ Error querying events:", error);
    return;
  }

  if (!data || data.length === 0) {
    console.log("📭 No wine festival events found, searching broader...");
    
    // Try broader search
    const { data: broader, error: broaderError } = await supabase
      .from("events")
      .select("id, title, source_url, date, updated_at")
      .ilike("title", "%wine%")
      .ilike("title", "%festival%");

    if (broaderError) {
      console.error("❌ Error with broader search:", broaderError);
      return;
    }

    if (broader && broader.length > 0) {
      console.log(`📊 Found ${broader.length} wine festival event(s):`);
      broader.forEach((event, index) => {
        console.log(`\n${index + 1}. Event ID: ${event.id}`);
        console.log(`   Title: ${event.title}`);
        console.log(`   Date: ${event.date}`);
        console.log(`   Updated: ${event.updated_at}`);
        console.log(`   Source: ${event.source_url}`);
      });
    }
    return;
  }

  console.log(`📊 Found ${data.length} wine festival event(s):`);
  data.forEach((event, index) => {
    console.log(`\n${index + 1}. Event ID: ${event.id}`);
    console.log(`   Title: ${event.title}`);
    console.log(`   Date: ${event.date}`);
    console.log(`   Updated: ${event.updated_at}`);
    console.log(`   Source: ${event.source_url}`);
  });
}

findWineEvent().catch(console.error);
