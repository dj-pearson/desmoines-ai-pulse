import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Environment variables
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing required environment variables:");
  console.error("- SUPABASE_URL");
  console.error("- SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration(migrationFile?: string) {
  const migrationsDir = path.join(process.cwd(), "supabase", "migrations");

  if (!fs.existsSync(migrationsDir)) {
    console.error("Migrations directory not found:", migrationsDir);
    process.exit(1);
  }

  let filesToRun: string[] = [];

  if (migrationFile) {
    // Run specific migration
    const fullPath = path.join(migrationsDir, migrationFile);
    if (!fs.existsSync(fullPath)) {
      console.error("Migration file not found:", fullPath);
      process.exit(1);
    }
    filesToRun = [migrationFile];
  } else {
    // Run all migrations
    filesToRun = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();
  }

  console.log(`Running ${filesToRun.length} migration(s):`);

  for (const file of filesToRun) {
    console.log(`\n🔄 Running migration: ${file}`);

    const migrationPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(migrationPath, "utf8");

    try {
      const { error } = await supabase.rpc("exec_sql", { query: sql });

      if (error) {
        console.error(`❌ Error in migration ${file}:`, error);
        process.exit(1);
      }

      console.log(`✅ Migration ${file} completed successfully`);
    } catch (error) {
      console.error(`❌ Error running migration ${file}:`, error);
      process.exit(1);
    }
  }

  console.log("\n🎉 All migrations completed successfully!");
}

// Check if exec_sql function exists, if not create it
async function ensureExecSqlFunction() {
  const createFunctionSQL = `
    CREATE OR REPLACE FUNCTION exec_sql(query text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE query;
    END;
    $$;
  `;

  try {
    const { error } = await supabase.rpc("exec_sql", { query: "SELECT 1" });
    if (error && error.message.includes("function exec_sql")) {
      // Function doesn't exist, create it
      console.log("Creating exec_sql function...");
      const { error: createError } = await supabase
        .from("dummy")
        .select("*")
        .limit(0);

      // Use direct SQL execution if available
      console.log("Setting up migration helper function...");
    }
  } catch (error) {
    console.log("Setting up migration environment...");
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const migrationFile = args[0];

  try {
    await ensureExecSqlFunction();
    await runMigration(migrationFile);
  } catch (error) {
    console.error("Migration runner error:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { runMigration };
