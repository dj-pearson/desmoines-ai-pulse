/**
 * SEO-054: fill restaurants.hours_json (and business_status) from Google
 * Places for every row with a google_place_id and no hours.
 *
 *   npx tsx scripts/backfill-restaurant-hours.ts           # dry run: coverage and the plan
 *   npx tsx scripts/backfill-restaurant-hours.ts --apply   # call the edge function until done
 *
 * The Google key lives only in the edge function secrets, so this script does
 * not call Google. It asks bulk-update-restaurants to, in its `hoursOnly` mode
 * (field mask regularOpeningHours,businessStatus; writes those two columns and
 * nothing else), through pg_net with the service-role key the database already
 * holds for its cron jobs (public.app_secret('service_role_key')). Nothing
 * secret passes through this process: the SQL names the key, Postgres reads it.
 *
 * --apply REFUSES to run against a deployed function that does not know
 * `hoursOnly`. An older deployment ignores the flag and runs the full
 * enrichment, which overwrites description, location, phone, website, rating
 * and photo on every row it touches. The check reads the deployed bundle
 * through the Management API (SUPABASE_ACCESS_TOKEN).
 *
 * Cost: one Place Details call per target row, at most 50 per request.
 * regularOpeningHours bills at the Place Details Enterprise tier. The function
 * allows 5 requests per 15 minutes per caller, so after every 5 batches this
 * waits out the window. Re-runnable: a filled row is no longer a target.
 *
 * Before the first write, --apply exports hours_json and business_status for
 * every row to scripts/content-backups/seo-054/ (never overwriting one).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { psql } from "./lib/restaurantSeoRows.ts";

const PROJECT_REF = "wtkhfqpmcegzcbngroui";
const FUNCTION_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/bulk-update-restaurants`;
const BATCH = 50;
const RATE_WINDOW_CALLS = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000 + 30_000;

const args = process.argv.slice(2);
const apply = args.includes("--apply");

interface Coverage {
  total: number;
  with_place_id: number;
  with_hours: number;
  with_status: number;
  targets: number;
}

function coverage(): Coverage {
  const out = psql(`
    select row_to_json(t) from (
      select count(*)::int as total,
             count(google_place_id)::int as with_place_id,
             count(hours_json)::int as with_hours,
             count(business_status)::int as with_status,
             count(*) filter (where google_place_id is not null and hours_json is null)::int as targets
      from restaurants
    ) t;
  `);
  return JSON.parse(out.trim()) as Coverage;
}

function envValue(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  for (const p of [".env", "../../../.env"]) {
    const file = resolve(process.cwd(), p);
    if (!existsSync(file)) continue;
    const m = readFileSync(file, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error(`${name} is not set and no .env carries it.`);
}

/** True when the deployed bulk-update-restaurants bundle contains the hoursOnly mode. */
async function deployedSupportsHoursOnly(): Promise<boolean> {
  const token = envValue("SUPABASE_ACCESS_TOKEN");
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/bulk-update-restaurants/body`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Management API answered ${res.status} for the function body`);
  const bundle = Buffer.from(await res.arrayBuffer()).toString("latin1");
  return bundle.includes("hoursOnly") && bundle.includes("regularOpeningHours,businessStatus");
}

function backup(): string {
  const day = new Date().toISOString().slice(0, 10);
  const file = resolve(process.cwd(), `scripts/content-backups/seo-054/restaurants-hours-${day}.json`);
  mkdirSync(dirname(file), { recursive: true });
  const rows = psql(`
    select coalesce(json_agg(json_build_object('id', id, 'hours_json', hours_json, 'business_status', business_status) order by id), '[]'::json)
    from restaurants;
  `);
  try {
    writeFileSync(file, `{"exportedAt":"${new Date().toISOString()}","table":"restaurants","rows":${rows.trim()}}\n`, { flag: "wx" });
    console.log(`backed up hours_json and business_status to ${file}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    console.log(`backup exists, kept as is: ${file}`);
  }
  return file;
}

interface BatchResult {
  success?: boolean;
  mode?: string;
  processed?: number;
  updated?: number;
  noHours?: number;
  errors?: number;
  lastId?: string | null;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST one hoursOnly batch through pg_net and wait for the response row. */
async function runBatch(afterId: string | null): Promise<BatchResult> {
  const body = JSON.stringify({ hoursOnly: true, batchSize: BATCH, afterId });
  if (/'/.test(body)) throw new Error("unexpected quote in request body");
  const id = psql(`
    select net.http_post(
      url := '${FUNCTION_URL}',
      headers := jsonb_build_object('Authorization', 'Bearer ' || public.app_secret('service_role_key'), 'Content-Type', 'application/json'),
      body := '${body}'::jsonb,
      timeout_milliseconds := 150000
    );
  `).trim();
  if (!/^\d+$/.test(id)) throw new Error("pg_net did not return a request id");
  for (let i = 0; i < 80; i++) {
    await sleep(3000);
    const row = psql(`select row_to_json(t) from (select status_code, content, error_msg from net._http_response where id = ${id}) t;`).trim();
    if (!row) continue;
    const r = JSON.parse(row) as { status_code: number | null; content: string | null; error_msg: string | null };
    if (r.error_msg) throw new Error(`pg_net: ${r.error_msg}`);
    const parsed = (() => {
      try {
        return JSON.parse(r.content ?? "{}") as BatchResult;
      } catch {
        return { error: (r.content ?? "").slice(0, 200) } as BatchResult;
      }
    })();
    if (r.status_code !== 200) throw new Error(`function answered ${r.status_code}: ${parsed.error ?? "no body"}`);
    return parsed;
  }
  throw new Error(`no response for pg_net request ${id} after 240s`);
}

async function main() {
  const before = coverage();
  console.log(
    `${before.total} restaurants; ${before.with_place_id} with a place id; ${before.with_hours} with hours_json; ` +
      `${before.with_status} with business_status; ${before.targets} to fill`,
  );
  const batches = Math.ceil(before.targets / BATCH);
  console.log(
    `plan: ${before.targets} Place Details calls (mask regularOpeningHours,businessStatus) in ${batches} batch(es) of ${BATCH}, ` +
      `about ${Math.max(0, Math.ceil(batches / RATE_WINDOW_CALLS) - 1) * 15} min of rate-limit waits`,
  );
  if (!apply) {
    console.log("dry run; pass --apply to back up and fill");
    return;
  }
  if (before.targets === 0) return;
  if (!(await deployedSupportsHoursOnly())) {
    console.error(
      "The deployed bulk-update-restaurants has no hoursOnly mode. Deploy it first " +
        "(supabase functions deploy bulk-update-restaurants); without it the call runs the full enrichment.",
    );
    process.exitCode = 1;
    return;
  }
  backup();

  let afterId: string | null = null;
  let calls = 0;
  for (let i = 0; i < batches + 1; i++) {
    if (calls > 0 && calls % RATE_WINDOW_CALLS === 0) {
      console.log(`waiting out the rate-limit window after ${calls} calls...`);
      await sleep(RATE_WINDOW_MS);
    }
    const result = await runBatch(afterId);
    calls++;
    if (result.mode !== "hoursOnly") throw new Error("the function did not answer in hoursOnly mode; stopping");
    console.log(
      `batch ${calls}: processed ${result.processed}, filled ${result.updated}, no hours from Google ${result.noHours}, errors ${result.errors}`,
    );
    if (!result.processed || !result.lastId) break;
    afterId = result.lastId;
  }

  const after = coverage();
  console.log(`after: ${after.with_hours} with hours_json (was ${before.with_hours}); ${after.with_status} with business_status (was ${before.with_status})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
