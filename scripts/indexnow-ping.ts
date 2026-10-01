/**
 * Submit changed URLs to IndexNow (SEO-047), which Bing, Yandex, Naver and
 * Seznam read. Bing's index is what ChatGPT search draws on alongside its own
 * crawler, so this is the cheapest way to get a new page in front of it.
 *
 * Two ways to say what changed:
 *
 *   Explicit URLs (the weekend-article workflow, and one-off runs):
 *     npx tsx scripts/indexnow-ping.ts /articles/some-slug https://desmoinesinsider.com/about
 *     npx tsx scripts/indexnow-ping.ts --urls /a,/b
 *
 *   Sitemap diff (the daily prerender rebuild workflow):
 *     npx tsx scripts/indexnow-ping.ts --from-sitemaps --state .indexnow/state.json \
 *       [--wait-minutes 25] [--since-days 1]
 *
 *   Reads the LIVE sitemap index and every child, and submits each URL that is
 *   new or whose lastmod differs from the saved state. With no saved state it
 *   submits URLs whose lastmod is within --since-days. --wait-minutes polls the
 *   live index until it differs from the one recorded in the state, so a run
 *   started right after the deploy hook reads the new build rather than the
 *   old one; if it never changes, the run goes ahead and finds nothing new.
 *
 * Common flags: --dry-run prints the payload and sends nothing; --site
 * overrides the host (default VITE_SITE_URL or https://desmoinesinsider.com).
 *
 * The key is read from public/<key>.txt, the file IndexNow fetches to verify
 * the submission, so this script cannot send a key the site does not serve.
 *
 * Exit code: 0 when the submission was accepted (200/202) or there was nothing
 * to send; 1 otherwise. The state file is only rewritten after a success, so a
 * rejected run (403 before the key file is deployed, 429) is retried in full
 * by the next one.
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fetchWithTimeout } from '../supabase/functions/_shared/fetchWithTimeout.ts';
import {
  buildIndexNowPayload,
  describeIndexNowStatus,
  INDEXNOW_ENDPOINT,
  INDEXNOW_MAX_URLS,
} from '../supabase/functions/_shared/indexNow.ts';
import {
  changedUrls,
  chunk,
  findIndexNowKey,
  parseSitemapIndex,
  parseUrlset,
  type SavedState,
  type SitemapState,
} from './lib/indexNowSitemaps';

interface Args {
  urls: string[];
  fromSitemaps: boolean;
  statePath: string | null;
  waitMinutes: number;
  sinceDays: number;
  dryRun: boolean;
  site: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    urls: [],
    fromSitemaps: false,
    statePath: null,
    waitMinutes: 0,
    sinceDays: 1,
    dryRun: false,
    site: (process.env.VITE_SITE_URL || process.env.SITE_URL || 'https://desmoinesinsider.com').replace(/\/+$/, ''),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--urls') args.urls.push(...next().split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--from-sitemaps') args.fromSitemaps = true;
    else if (a === '--state') args.statePath = next();
    else if (a === '--wait-minutes') args.waitMinutes = Number(next());
    else if (a === '--since-days') args.sinceDays = Number(next());
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--site') args.site = next().replace(/\/+$/, '');
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else args.urls.push(a);
  }
  return args;
}

/** "/about" -> "https://host/about"; absolute URLs pass through for the host check. */
function absolute(site: string, u: string): string {
  // Git Bash on Windows rewrites a leading-slash argument into a filesystem
  // path ("/about" arrives as "C:/Program Files/Git/about"), and IndexNow
  // accepts the result with a 200. Happened on the first run of this script.
  if (/^[A-Za-z]:[\\/]/.test(u)) {
    throw new Error(`"${u}" is a Windows path, not a site path. In Git Bash set MSYS_NO_PATHCONV=1 or pass full URLs.`);
  }
  return /^https?:\/\//i.test(u) ? u : `${site}${u.startsWith('/') ? '' : '/'}${u}`;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

async function getText(url: string): Promise<string | null> {
  try {
    // Cache-busting query: the index is served with max-age=3600, and a run
    // waiting for a fresh deploy must not be answered from an edge cache.
    const res = await fetchWithTimeout(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`, {}, 30_000);
    if (!res.ok) {
      console.warn(`  ${url}: HTTP ${res.status}, skipped`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.warn(`  ${url}: ${err instanceof Error ? err.message : String(err)}, skipped`);
    return null;
  }
}

function readState(path: string | null): SavedState | null {
  if (!path || !existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as SavedState;
    return parsed && typeof parsed.urls === 'object' ? parsed : null;
  } catch {
    console.warn(`  state file ${path} is unreadable; treating this as a first run`);
    return null;
  }
}

async function waitForNewIndex(indexUrl: string, oldHash: string, minutes: number): Promise<void> {
  const deadline = Date.now() + minutes * 60_000;
  for (;;) {
    const body = await getText(indexUrl);
    if (body && sha256(body) !== oldHash) {
      console.log('  sitemap index has changed since the last run');
      return;
    }
    if (Date.now() >= deadline) {
      console.log(`  sitemap index unchanged after ${minutes} min; reading it as it is`);
      return;
    }
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

async function readLiveSitemaps(site: string): Promise<{ indexHash: string; urls: SitemapState } | null> {
  const indexUrl = `${site}/sitemap.xml`;
  const indexXml = await getText(indexUrl);
  if (!indexXml) return null;
  const children = parseSitemapIndex(indexXml);
  if (children.length === 0) {
    console.warn(`  ${indexUrl} is not a sitemap index`);
    return null;
  }
  const urls: SitemapState = {};
  for (const child of children) {
    const xml = await getText(child);
    if (!xml) continue;
    const parsed = parseUrlset(xml);
    const n = Object.keys(parsed).length;
    console.log(`  ${child.replace(site, '')}: ${n} URL(s)`);
    Object.assign(urls, parsed);
  }
  return { indexHash: sha256(indexXml), urls };
}

async function submit(site: string, key: string, urls: string[], dryRun: boolean): Promise<boolean> {
  let ok = true;
  for (const batch of chunk(urls, INDEXNOW_MAX_URLS)) {
    const { payload, dropped } = buildIndexNowPayload(site, batch, key);
    if (dropped.length) console.warn(`  dropped ${dropped.length} URL(s) not on ${new URL(site).host}: ${dropped.join(', ')}`);
    if (!payload) continue;
    if (dryRun) {
      console.log(`  dry run, would POST ${payload.urlList.length} URL(s) to ${INDEXNOW_ENDPOINT}:`);
      console.log(JSON.stringify(payload, null, 2));
      continue;
    }
    try {
      const res = await fetchWithTimeout(
        INDEXNOW_ENDPOINT,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify(payload),
        },
        30_000,
      );
      const accepted = res.status === 200 || res.status === 202;
      console.log(`  IndexNow HTTP ${res.status} (${describeIndexNowStatus(res.status)}) for ${payload.urlList.length} URL(s)`);
      if (!accepted) ok = false;
    } catch (err) {
      console.error(`  IndexNow request failed: ${err instanceof Error ? err.message : String(err)}`);
      ok = false;
    }
  }
  return ok;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const found = findIndexNowKey(join(process.cwd(), 'public'));
  if (!found) {
    console.error('indexnow: expected exactly one public/<32 hex>.txt whose body is its own name; found none or several');
    return 1;
  }
  console.log(`indexnow: key file /${found.file}, host ${new URL(args.site).host}`);

  let urls = args.urls.map((u) => absolute(args.site, u));
  let nextState: SavedState | null = null;

  if (args.fromSitemaps) {
    const prev = readState(args.statePath);
    if (prev && args.waitMinutes > 0) await waitForNewIndex(`${args.site}/sitemap.xml`, prev.indexHash, args.waitMinutes);
    const live = await readLiveSitemaps(args.site);
    if (!live) {
      console.error('indexnow: could not read the live sitemaps; nothing submitted, state left as it was');
      return 1;
    }
    const since = new Date(Date.now() - args.sinceDays * 86_400_000).toISOString().slice(0, 10);
    const changed = changedUrls(prev?.urls ?? null, live.urls, since);
    console.log(
      prev
        ? `indexnow: ${changed.length} of ${Object.keys(live.urls).length} sitemap URL(s) new or with a changed lastmod since ${prev.readAt}`
        : `indexnow: no saved state; ${changed.length} of ${Object.keys(live.urls).length} sitemap URL(s) have lastmod on or after ${since}`,
    );
    urls.push(...changed);
    nextState = { indexHash: live.indexHash, readAt: new Date().toISOString(), urls: live.urls };
  }

  urls = [...new Set(urls)];
  if (urls.length === 0) {
    console.log('indexnow: nothing changed, nothing submitted');
  } else {
    for (const u of urls) console.log(`  ${u}`);
    const ok = await submit(args.site, found.key, urls, args.dryRun);
    if (!ok) {
      console.error('indexnow: submission not accepted; state left as it was so the next run retries these URLs');
      return 1;
    }
  }

  if (nextState && args.statePath && !args.dryRun) {
    mkdirSync(dirname(args.statePath), { recursive: true });
    writeFileSync(args.statePath, JSON.stringify(nextState));
    console.log(`indexnow: state saved to ${args.statePath} (${Object.keys(nextState.urls).length} URLs)`);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('indexnow:', err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
