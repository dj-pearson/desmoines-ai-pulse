/**
 * SEO-039: publish "New restaurants in Des Moines: {Month YYYY}" from the
 * restaurants table, through the same rule as /restaurants/new.
 *
 *   npx tsx scripts/publish-new-restaurants-article.ts                    # dry run, current Central month
 *   npx tsx scripts/publish-new-restaurants-article.ts --month 2026-11    # dry run, a given month
 *   npx tsx scripts/publish-new-restaurants-article.ts --next             # dry run, next month
 *   npx tsx scripts/publish-new-restaurants-article.ts --sql out.sql      # write the SQL, do not run it
 *   npx tsx scripts/publish-new-restaurants-article.ts --month 2026-10 --apply
 *   ... --env-file ../path/.env   # read keys from another checkout's .env
 *
 * Run it at the end of the month (or the 1st of the next, with --month): the
 * edition lists openings dated in that month up to the day it runs.
 *
 * REFUSES TO PUBLISH below MIN_ARTICLE_OPENINGS (3) openings: it prints the
 * count and exits 2, so a scheduled run shows up as skipped, not as a thin
 * article.
 *
 * READ PATH: the public REST API with the anon key, the rows a visitor sees,
 * then selectNewRestaurants/openingsInMonth (src/lib/newRestaurants.ts).
 *
 * WRITE PATH: psql against SUPABASE_DB_URL in one transaction with
 * session_replication_role = replica, the same as
 * scripts/publish-weekend-article.ts and for the same reason: the
 * article_publish_webhook_trigger posts every newly published article to a
 * Make.com webhook that writes AI social posts. Replica mode also skips the
 * slug, word-count, updated_at and sitemap-queue triggers (set by hand below)
 * and the SEO-058 articles_publishable_body_guard, so the SQL calls
 * public.article_body_problem() on the body itself and aborts if it objects.
 *
 * Reruns are safe: the slug is fixed per month, a rerun updates in place,
 * keeps published_at, and first saves the current row to
 * scripts/content-backups/seo-039/. The connection string is never printed.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import {
  buildNewRestaurantsArticle,
  MIN_ARTICLE_OPENINGS,
  nextMonth,
  type ArticleRestaurantRow,
} from "../src/lib/newRestaurantsArticle";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

// --env-file lets a worktree run use the main checkout's .env without copying it.
const ENV_FILE = opt("--env-file");
if (ENV_FILE) loadEnvFile(ENV_FILE);
loadEnvFile(join(process.cwd(), ".env"));
loadEnvFile(join(process.cwd(), ".env.local"));

const APPLY = flag("--apply");
const SQL_OUT = opt("--sql");
const TZ = "America/Chicago";
const now = new Date();
const currentMonth = formatInTimeZone(now, TZ, "yyyy-MM");
const MONTH = opt("--month") ?? (flag("--next") ? nextMonth(currentMonth) : currentMonth);
const publishedOn = formatInTimeZone(now, TZ, "yyyy-MM-dd");
/** Author of every published article on the site today; override per run if needed. */
const AUTHOR_ID = process.env.NEW_RESTAURANTS_ARTICLE_AUTHOR_ID || "60ff90c2-d66d-407c-ba18-4462188c9b7b";

if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(MONTH)) {
  console.error(`--month must be YYYY-MM, got ${MONTH}`);
  process.exit(1);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const COLUMNS =
  "id, name, slug, status, opening_date, opening_timeframe, source_url, business_status, is_merged, cuisine, location, city";

async function fetchRows(): Promise<ArticleRestaurantRow[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_URL and SUPABASE_ANON_KEY).");
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  // Every dated or flagged row; the rule in src/lib/newRestaurants.ts decides.
  const { data, error } = await supabase
    .from("restaurants")
    .select(COLUMNS)
    .neq("is_merged", true)
    .or("status.in.(newly_opened,opening_soon,announced),opening_date.not.is.null")
    .limit(2000);
  if (error) throw new Error(`restaurants query failed: ${error.code} ${error.message}`);
  return (data ?? []) as ArticleRestaurantRow[];
}

function dollarQuote(text: string, base = "nr"): string {
  let tag = base;
  while (text.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${text}$${tag}$`;
}
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (xs: string[]) => `array[${xs.map(lit).join(",")}]::text[]`;

function buildSql(a: ReturnType<typeof buildNewRestaurantsArticle>): string {
  return `-- SEO-039 new-restaurants article ${a.slug}, generated ${new Date().toISOString()}
-- by scripts/publish-new-restaurants-article.ts from the restaurants table.
-- Do not hand-edit; rerun the script. Replica mode: see that script's header.
begin;

-- Replica mode below skips the SEO-058 publish guard, so ask it directly.
do $guard$
declare problem text := public.article_body_problem(${dollarQuote(a.content, "body")});
begin
  if problem is not null then
    raise exception 'article_body_not_publishable: %', problem using errcode = '23514';
  end if;
end
$guard$;

set local session_replication_role = replica;

insert into public.articles
  (title, slug, content, excerpt, category, tags, seo_title, seo_description,
   seo_keywords, status, published_at, author_id, word_count, is_auto_published)
values (
  ${lit(a.title)},
  ${lit(a.slug)},
  ${dollarQuote(a.content)},
  ${lit(a.excerpt)},
  ${lit(a.category)},
  ${arr(a.tags)},
  ${lit(a.seo_title)},
  ${lit(a.seo_description)},
  ${arr(a.seo_keywords)},
  'published',
  now(),
  ${lit(AUTHOR_ID)},
  ${a.word_count},
  true
)
on conflict (slug) do update set
  title = excluded.title,
  content = excluded.content,
  excerpt = excluded.excerpt,
  tags = excluded.tags,
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  seo_keywords = excluded.seo_keywords,
  word_count = excluded.word_count,
  status = 'published',
  updated_at = now();

-- The sitemap-queue trigger was skipped by replica mode; enqueue by hand.
insert into public.sitemap_change_queue (content_type, content_id, action)
select 'article', id, 'upsert' from public.articles where slug = ${lit(a.slug)};

set local session_replication_role = origin;

select slug, status, published_at, updated_at, word_count
from public.articles where slug = ${lit(a.slug)};

commit;
`;
}

function dbUrl(): string {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL is not set; --apply needs it.");
  return url;
}

function redact(text: string, url: string): string {
  return (text || "").split(url).join("[redacted]").replace(/postgres(ql)?:\/\/\S+/g, "[redacted]");
}

function psql(url: string, psqlArgs: string[]): string {
  const r = spawnSync("psql", ["-d", url, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...psqlArgs], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 50_000_000,
  });
  if (r.error) throw new Error(`psql could not start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`psql failed: ${redact(r.stderr, url)}`);
  return redact(r.stdout, url);
}

function backupExisting(url: string, slug: string) {
  const json = psql(url, [
    "-t",
    "-A",
    "-c",
    `select coalesce(json_agg(a), '[]') from public.articles a where slug = ${lit(slug)}`,
  ]).trim();
  if (json === "[]" || json === "") return null;
  const dir = join(process.cwd(), "scripts", "content-backups", "seo-039");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${slug}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, json + "\n");
  return file;
}

async function main() {
  const rows = await fetchRows();
  const article = buildNewRestaurantsArticle(rows, MONTH, publishedOn, now);
  console.log(
    JSON.stringify(
      { month: MONTH, slug: article.slug, rowsFetched: rows.length, ...article.counts, words: article.word_count },
      null,
      2,
    ),
  );

  if (article.counts.opened < MIN_ARTICLE_OPENINGS) {
    console.log(
      `\n${article.counts.opened} opening(s) dated in ${MONTH}; the article needs at least ${MIN_ARTICLE_OPENINGS}. Not published.`,
    );
    if (APPLY) process.exit(2);
    console.log("\n--- dry run: what it would say ---\n");
    console.log(article.content);
    return;
  }

  const sql = buildSql(article);
  if (SQL_OUT) {
    writeFileSync(SQL_OUT, sql);
    console.log(`SQL written to ${SQL_OUT}`);
  }
  if (!APPLY) {
    if (!SQL_OUT) {
      console.log("\n--- dry run: article content ---\n");
      console.log(article.content);
    }
    return;
  }

  const url = dbUrl();
  const backup = backupExisting(url, article.slug);
  if (backup) console.log(`Existing row backed up to ${backup}`);
  const dir = join(process.cwd(), "scripts", "content-backups", "seo-039");
  mkdirSync(dir, { recursive: true });
  const sqlFile = SQL_OUT || join(dir, `${article.slug}.sql`);
  if (!SQL_OUT) writeFileSync(sqlFile, sql);
  console.log(psql(url, ["-f", sqlFile]));
  console.log(`Published https://desmoinesinsider.com/articles/${article.slug}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
