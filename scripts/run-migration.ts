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

/**
 * REFUSE EARLY RATHER THAN FAIL AT THE FIRST MIGRATION.
 *
 * This script executes migration SQL through `supabase.rpc("exec_sql", ...)`.
 * That function DOES NOT EXIST in this project's database - probed 2026-08-24,
 * PGRST202, and absent from all 785 functions in scripts/db-snapshot.json. So
 * `npm run migrate` (package.json:28) could only ever print a PGRST202 and exit,
 * and it has been able to do nothing else for as long as the function has been
 * missing.
 *
 * The previous version of this function looked like it handled that: it probed
 * exec_sql, and on failure held a CREATE OR REPLACE FUNCTION exec_sql(...) string
 * ready to run. That string was assigned to a local and never used. The fallback
 * path instead did `.from("dummy").select("*")` - a table that does not exist
 * either - logged "Setting up migration helper function..." and returned, having
 * created nothing.
 *
 * Migrations are applied with `supabase db push` (CLAUDE.md, PRODUCTION_RUNBOOK).
 * This matters more than a broken convenience script usually would: 31 migrations
 * are recorded in supabase_migrations.schema_migrations as applied while having
 * produced nothing (WEB-QA-017), and a documented command that fails halfway
 * through a manual workaround is one plausible way to arrive at that state.
 */
async function ensureExecSqlFunction() {
  const { error } = await supabase.rpc("exec_sql", { query: "SELECT 1" });
  if (!error) return;

  console.error("This script cannot run migrations against this database.");
  console.error("");
  console.error(`  rpc("exec_sql") -> ${error.code ?? "error"}: ${error.message}`);
  console.error("");
  console.error("exec_sql does not exist here, and nothing in this repo creates it.");
  console.error("Apply migrations with the Supabase CLI instead:");
  console.error("");
  console.error("    supabase db push                    # apply pending migrations");
  console.error("    supabase migration new <name>       # create a new one");
  console.error("");
  console.error("See CLAUDE.md and docs/PRODUCTION_RUNBOOK.md.");
  process.exit(1);
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
