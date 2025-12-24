import { createClient } from "@supabase/supabase-js";

// Using environment variables for secure credential management
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Missing required environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function testDirectUpdate() {
  const eventId = "e3e1e68f-5d9f-4baf-8939-67e953576f89";
  const newDate = "2025-08-23T18:00:00.000Z";
  
  console.log("🔧 Testing direct database update...");
  console.log(`Event ID: ${eventId}`);
  console.log(`New date: ${newDate}`);
  
  // First, check current state
  const { data: before, error: beforeError } = await supabase
    .from("events")
    .select("id, title, date, updated_at")
    .eq("id", eventId)
    .single();
    
  if (beforeError) {
    console.error("❌ Error fetching event:", beforeError);
    return;
  }
  
  console.log("\n📊 Current state:");
  console.log(`Date: ${before.date}`);
  console.log(`Updated: ${before.updated_at}`);
  
  // Perform update
  console.log("\n🔄 Performing update...");
  const { data: updateData, error: updateError } = await supabase
    .from("events")
    .update({
      date: newDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .select();

  if (updateError) {
    console.error("❌ Update error:", updateError);
    return;
  }

  console.log("✅ Update response:");
  console.log(`Records affected: ${updateData?.length || 0}`);
  if (updateData && updateData.length > 0) {
    console.log(`New date: ${updateData[0].date}`);
    console.log(`New updated_at: ${updateData[0].updated_at}`);
  }
  
  // Verify the change
  console.log("\n🔍 Verifying change...");
  const { data: after, error: afterError } = await supabase
    .from("events")
    .select("id, title, date, updated_at")
    .eq("id", eventId)
    .single();
    
  if (afterError) {
    console.error("❌ Error fetching updated event:", afterError);
    return;
  }
  
  console.log("📊 Final state:");
  console.log(`Date: ${after.date}`);
  console.log(`Updated: ${after.updated_at}`);
  
  const dateChanged = before.date !== after.date;
  const updatedAtChanged = before.updated_at !== after.updated_at;
  
  console.log(`\n🎯 Results:`);
  console.log(`Date changed: ${dateChanged ? '✅' : '❌'}`);
  console.log(`Updated_at changed: ${updatedAtChanged ? '✅' : '❌'}`);
}

testDirectUpdate().catch(console.error);
