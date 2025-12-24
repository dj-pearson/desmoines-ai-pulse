import { createClient } from "@supabase/supabase-js";

// Use environment variables for secure credential management
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Missing required environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function convertEventTimezones() {
  console.log("🕐 Starting timezone conversion for Des Moines events...\n");

  try {
    // Step 1: Get all events that are at midnight UTC (likely the problematic ones)
    console.log("📋 Fetching events that need timezone conversion...");

    const { data: events, error: fetchError } = await supabase
      .from("events")
      .select("id, title, date, source_url")
      .order("date", { ascending: true });

    if (fetchError) {
      console.error("❌ Error fetching events:", fetchError);
      return;
    }

    if (!events || events.length === 0) {
      console.log("ℹ️ No events found");
      return;
    }

    // Filter events that are at midnight UTC
    const midnightEvents = events.filter((event) => {
      const date = new Date(event.date);
      return (
        date.getUTCHours() === 0 &&
        date.getUTCMinutes() === 0 &&
        date.getUTCSeconds() === 0
      );
    });

    console.log(
      `Found ${midnightEvents.length} events at midnight UTC that need conversion:\n`
    );

    // Step 2: Preview the conversions
    midnightEvents.forEach((event) => {
      const originalDate = new Date(event.date);

      // Convert to CDT and set to 7:30 PM
      const cdtDate = new Date(
        originalDate.toLocaleString("en-US", { timeZone: "America/Chicago" })
      );
      cdtDate.setHours(19, 30, 0, 0); // 7:30 PM

      // Convert back to UTC for storage
      const utcDate = new Date(
        cdtDate.toLocaleString("en-US", { timeZone: "UTC" })
      );

      console.log(`📅 ${event.title}`);
      console.log(`   Original UTC: ${originalDate.toISOString()}`);
      console.log(
        `   Original CDT: ${originalDate.toLocaleString("en-US", {
          timeZone: "America/Chicago",
        })}`
      );
      console.log(`   New UTC: ${utcDate.toISOString()}`);
      console.log(
        `   New CDT: ${cdtDate.toLocaleString("en-US", {
          timeZone: "America/Chicago",
        })}`
      );
      console.log("");
    });

    // Step 3: Ask for confirmation
    console.log(`\n⚠️  Ready to update ${midnightEvents.length} events?`);
    console.log("This will convert UTC midnight times to CDT 7:30 PM times.");

    // In a real scenario, you'd want user confirmation here
    // For now, let's do a dry run
    const dryRun =
      process.argv.includes("--dry-run") || !process.argv.includes("--apply");

    if (dryRun) {
      console.log("🔍 DRY RUN MODE - No changes will be made");
      console.log("Add --apply flag to actually perform the conversion");
      return;
    }

    // Step 4: Perform the actual updates
    console.log("🚀 Performing timezone conversion...\n");

    let successCount = 0;
    let errorCount = 0;

    for (const event of midnightEvents) {
      try {
        const originalDate = new Date(event.date);

        // Create a new date in CDT at 7:30 PM
        // First get the date part in CDT timezone
        const cdtDateStr = originalDate.toLocaleDateString("en-CA", {
          timeZone: "America/Chicago",
        }); // YYYY-MM-DD format
        const cdtDateTime = new Date(`${cdtDateStr}T19:30:00`);

        // Convert to UTC for storage
        const timezoneOffset = cdtDateTime.getTimezoneOffset() * 60000;
        const utcDateTime = new Date(cdtDateTime.getTime() + timezoneOffset);

        // Update the event
        const { error: updateError } = await supabase
          .from("events")
          .update({
            date: utcDateTime.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", event.id);

        if (updateError) {
          console.error(`❌ Failed to update "${event.title}":`, updateError);
          errorCount++;
        } else {
          console.log(
            `✅ Updated "${event.title}" to ${utcDateTime.toISOString()}`
          );
          successCount++;
        }
      } catch (error) {
        console.error(`❌ Error processing "${event.title}":`, error);
        errorCount++;
      }
    }

    console.log(`\n🎉 Conversion complete!`);
    console.log(`✅ Successfully updated: ${successCount} events`);
    console.log(`❌ Errors: ${errorCount} events`);
  } catch (error) {
    console.error("💥 Unexpected error:", error);
  }
}

// CLI interface
const args = process.argv.slice(2);

if (args.includes("--help")) {
  console.log(`
Des Moines Insider Event Timezone Converter

Usage:
  npm run convert-timezones           # Dry run (preview changes)
  npm run convert-timezones -- --apply    # Actually perform conversion

Options:
  --dry-run    Preview changes without applying them (default)
  --apply      Actually perform the timezone conversion
  --help       Show this help message
`);
  process.exit(0);
}

// Run the conversion
convertEventTimezones().catch(console.error);
