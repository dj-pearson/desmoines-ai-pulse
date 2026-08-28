/**
 * Ad-hoc diagnostic: prints every event whose title contains "harbour", newest first.
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
