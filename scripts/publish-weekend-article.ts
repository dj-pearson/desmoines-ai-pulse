/**
 * SEO-035: publish "This Weekend in Des Moines: {dates}" from the events table.
 *
 *   npx tsx scripts/publish-weekend-article.ts                 # dry run: prints the markdown
 *   npx tsx scripts/publish-weekend-article.ts --date 2026-10-01
 *   npx tsx scripts/publish-weekend-article.ts --sql out.sql   # write the SQL, do not run it
 *   npx tsx scripts/publish-weekend-article.ts --apply         # write it to production
 *
 * READ PATH: the public REST API with the anon key, i.e. exactly the rows a
 * visitor can see under RLS, then isPublicEvent() on top (is_hidden,
 * is_merged, archived_at). Needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
 * (or SUPABASE_URL + SUPABASE_ANON_KEY).
 *
 * WRITE PATH: psql against SUPABASE_DB_URL, in one transaction, with
 * session_replication_role = replica - the same approach as
 * scripts/seo-032-halloween-articles.sql and for the same reason.
 * article_publish_webhook_trigger posts every newly published article to an
 * active Make.com webhook that generates AI social posts. Nobody asked for a
 * weekly AI social post, and a weekly one would be the most frequent poster on
 * the account. Replica mode also skips the slug, word-count, updated_at and
 * sitemap-queue triggers, so this script sets slug, word_count and updated_at
 * itself and writes the sitemap_change_queue row by hand. If the owner WANTS
 * social posts for these, drop the two session_replication_role lines in
 * buildSql() and the triggers do the rest.
 *
 * RERUNS ARE SAFE. The slug is fixed per weekend; a rerun updates the content
 * in place, keeps published_at, and first saves the current row to
 * scripts/content-backups/seo-035/.
 *
 * The connection string is passed to psql as an argument and never printed;
 * any error output has it redacted.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import {
  buildWeekendArticle,
  weekendWindow,
  WEEKEND_TIMEZONE,
  type WeekendEventRow,
} from "../src/lib/weekendArticle";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}
loadEnvFile(join(process.cwd(), ".env"));
loadEnvFile(join(process.cwd(), ".env.local"));

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const APPLY = flag("--apply");
const SQL_OUT = opt("--sql");
const DATE = opt("--date"); // a Central date inside the week to publish for
/** Author of every published article on the site today; override per run if needed. */
const AUTHOR_ID = process.env.WEEKEND_ARTICLE_AUTHOR_ID || "60ff90c2-d66d-407c-ba18-4462188c9b7b";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (DATE && !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) {
  console.error(`--date must be YYYY-MM-DD, got ${DATE}`);
  process.exit(1);
}
// Midday Central on the given date, so the weekday is unambiguous.
const now = DATE ? new Date(`${DATE}T17:00:00Z`) : new Date();
const weekend = weekendWindow(now);
const publishedOn = formatInTimeZone(now, WEEKEND_TIMEZONE, "yyyy-MM-dd");

const COLUMNS =
  "id, title, date, event_start_utc, event_start_local, time_tbd, venue, location, city, category, price, is_featured, is_hidden, is_merged, archived_at, popularity_score";

async function fetchRows(): Promise<WeekendEventRow[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_URL and SUPABASE_ANON_KEY).");
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  // A day of slack either side; buildWeekendArticle filters to the Central
  // window by eventLocalDate, which is the authority, not this range.
  const from = new Date(Date.parse(weekend.startUtc) - 86_400_000).toISOString();
  const to = new Date(Date.parse(weekend.endUtc) + 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("events")
    .select(COLUMNS)
    .gte("date", from)
    .lt("date", to)
    .neq("is_merged", true)
    .neq("is_hidden", true)
    .is("archived_at", null)
    .order("date", { ascending: true })
    .limit(2000);
  if (error) throw new Error(`events query failed: ${error.code} ${error.message}`);
  return (data ?? []) as WeekendEventRow[];
}

/** A dollar-quote tag that does not occur in the text. */
function dollarQuote(text: string): string {
  let tag = "wk";
  while (text.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${text}$${tag}$`;
}
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (xs: string[]) => `array[${xs.map(lit).join(",")}]::text[]`;

function buildSql(a: ReturnType<typeof buildWeekendArticle>): string {
  return `-- SEO-035 weekend article ${a.slug}, generated ${new Date().toISOString()}
-- by scripts/publish-weekend-article.ts from the events table. Do not hand-edit;
-- rerun the script. Replica mode: see the header of that script.
begin;
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

function psql(url: string, args: string[]): string {
  const r = spawnSync("psql", ["-d", url, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], {
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
  const dir = join(process.cwd(), "scripts", "content-backups", "seo-035");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${slug}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, json + "\n");
  return file;
}

async function main() {
  const rows = await fetchRows();
  const article = buildWeekendArticle(rows, weekend, publishedOn);
  const sql = buildSql(article);

  const summary = {
    weekend: `${weekend.friday}..${weekend.sunday}`,
    slug: article.slug,
    title: article.title,
    rowsFetched: rows.length,
    ...article.counts,
    words: article.word_count,
  };
  console.log(JSON.stringify(summary, null, 2));

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

  if (article.counts.total === 0) {
    // An empty weekend article is worse than none; fail loudly so the Action goes red.
    throw new Error("No events in the weekend window - refusing to publish an empty article.");
  }

  const url = dbUrl();
  const backup = backupExisting(url, article.slug);
  if (backup) console.log(`Existing row backed up to ${backup}`);

  const dir = join(process.cwd(), "scripts", "content-backups", "seo-035");
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
