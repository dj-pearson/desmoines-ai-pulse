
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabaseUrl = 'https://wtkhfqpmcegzcbngroui.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function backfillCoordinates(tableName: string) {
  console.log(`Starting backfill for ${tableName}...`);

  const { data, error } = await supabase
    .from(tableName)
    .select('id, location')
    .is('latitude', null);

  if (error) {
    console.error(`Error fetching from ${tableName}:`, error);
    return;
  }

  if (!data || data.length === 0) {
    console.log(`No missing coordinates in ${tableName}.`);
    return;
  }

  console.log(`Found ${data.length} records in ${tableName} to update.`);

  for (const record of data) {
    const { error: updateError } = await supabase
      .from(tableName)
      .update({ location: record.location })
      .eq('id', record.id);

    if (updateError) {
      console.error(`Error updating record ${record.id} in ${tableName}:`, updateError);
    } else {
      console.log(`Updated coordinates for record ${record.id} in ${tableName}.`);
    }
  }

  console.log(`Backfill for ${tableName} complete.`);
}

async function runBackfill() {
  const tables = ['restaurants', 'events', 'attractions', 'playgrounds'];
  for (const table of tables) {
    await backfillCoordinates(table);
  }
}

runBackfill();
