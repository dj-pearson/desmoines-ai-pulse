/**
 * SECURITY: verify_jwt = false
 * Reason: Background scraping job that runs without user context to collect restaurant menu data
 * Alternative measures: Service role key required for database access, API key validation for external services
 * Risk level: MEDIUM
 */

/**
 * Restaurant menu scraper.
 *
 * WHAT CHANGED AND WHY
 * --------------------
 * The previous version walked a fixed list of URL patterns, flattened whatever
 * HTML came back, asked Claude to find a menu in it, and published the FIRST
 * non-empty answer. That works on a site that renders its menu as plain HTML
 * under `/menu` and fails on essentially every other shape:
 *
 *   - menu rendered client-side (Toast, Popmenu, Square, Wix) → plain `fetch`
 *     returns an empty shell, and the old code scored links to those platforms
 *     UP, steering itself toward pages it could not read;
 *   - menu published as a PDF or a photograph → found only when the word
 *     "menu" appeared in the URL or alt text, which on a hashed CDN filename
 *     it never does;
 *   - menu split across several pages (food / brunch / tap list) → whichever
 *     page was reached first won and the rest were discarded;
 *   - menu present as schema.org structured data → never looked at, so exact
 *     data was thrown away in favour of an LLM guess over flattened text.
 *
 * This version is a candidate pipeline instead of a fixed sequence:
 *
 *   1. DISCOVER  — seed from `menu_url` and the homepage, then harvest links,
 *      iframes, images, PDFs, `hasMenu` URLs and (if needed) the sitemap.
 *   2. EXTRACT   — run the cheap exact paths first (schema.org JSON-LD, then a
 *      platform's own embedded JSON), and only then spend Claude calls on
 *      PDFs, images and prepared page text.
 *   3. JUDGE     — score every candidate result, merge the ones that pass, and
 *      publish the best. Nothing reaches the database without clearing a
 *      quality gate, so a nav bar parsed into four "items" is no longer a menu.
 *
 * Each stage lives in `_shared/menu/` and is unit-tested there; this file is
 * orchestration, budgets and persistence.
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { fetchPdfAsBase64, fetchImageAsBase64, scrapeUrl } from "../_shared/scraper.ts";
import { getAnthropicApiKey } from "../_shared/aiConfig.ts";

import type { MenuCandidate, MenuExtraction, MenuQuality } from "../_shared/menu/types.ts";
import {
  countItems,
  mergeExtractions,
  normalizeExtraction,
  passesQualityGate,
  rankExtractions,
  scoreExtraction,
} from "../_shared/menu/menuNormalize.ts";
import { extractMenuFromJsonLd } from "../_shared/menu/menuJsonLd.ts";
import {
  detectMenuPlatform,
  extractMenuFromEmbeddedState,
  looksClientRendered,
} from "../_shared/menu/menuPlatforms.ts";
import {
  discoverMenuEmbeds,
  discoverMenuImages,
  discoverMenuLinks,
  isImageUrl,
  isMenuishUrl,
  isPdfUrl,
  MENU_PATH_PATTERNS,
  menuUrlsFromSitemap,
  mergeCandidates,
} from "../_shared/menu/menuDiscovery.ts";
import { prepareMenuContent, menuSignalCount } from "../_shared/menu/menuContent.ts";
import { isPublicHttpUrl, normalizeSiteUrl } from "../_shared/menu/menuUrls.ts";
import {
  extractMenuFromImages,
  extractMenuFromPdf,
  extractMenuFromText,
  type MenuLlmContext,
} from "../_shared/menu/menuLlm.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import {
  fetchWindow,
  MIN_FETCH_WINDOW_MS,
  MIN_LLM_WINDOW_MS,
  MS_PER_RESTAURANT,
  remainingMs,
  RESPONSE_DEADLINE_MS,
  RUN_DEADLINE_MS,
  withDeadline,
} from "../_shared/menu/menuBudget.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const claudeApiKey = getAnthropicApiKey()!;

const supabase = createClient(supabaseUrl, supabaseKey);

const llmContext: MenuLlmContext = {
  supabaseUrl,
  supabaseKey,
  apiKey: claudeApiKey,
};

// ─── Budgets ────────────────────────────────────────────────────────────────

/**
 * Per-restaurant limits. Discovery can fan out a long way on a big site, and
 * without caps one restaurant with a hundred linked PDFs would consume the
 * whole invocation and every dollar of Claude budget in it.
 */
const DEFAULT_BUDGET = {
  /** HTTP requests for pages/assets. */
  fetches: 18,
  /** Claude requests (a chunked text extraction counts once per chunk). */
  llmCalls: 6,
  /** Wall-clock per restaurant. */
  msPerRestaurant: MS_PER_RESTAURANT,
};

// The run and response deadlines live in _shared/menu/menuBudget.ts, beside
// the reasoning: Supabase drops a request that is silent for 150s.

/** How long a menu stays fresh before it is re-scraped. */
const DEFAULT_MAX_AGE_DAYS = 30;

interface ScrapeRequest {
  restaurant_id?: string;
  restaurant_ids?: string[];
  batch_size?: number;
  force_update?: boolean;
  /** Override the freshness window. */
  max_age_days?: number;
  /** Run discovery and extraction but do not write to the database. */
  dry_run?: boolean;
}

interface RestaurantRow {
  id: string;
  name: string;
  website: string | null;
  menu_url: string | null;
}

interface ScoredResult {
  extraction: MenuExtraction;
  quality: MenuQuality;
}

interface AttemptRecord {
  url: string;
  method: string;
  outcome: "success" | "empty" | "rejected" | "error" | "skipped";
  items: number;
  score: number;
  detail?: string;
}

interface RestaurantOutcome {
  success: boolean;
  items_count: number;
  method?: string;
  source_url?: string;
  confidence?: number;
  error?: string;
  /** True when the restaurant was skipped rather than attempted. */
  skipped?: boolean;
  attempts: AttemptRecord[];
}

/** Mutable per-restaurant run state. */
interface RunContext {
  restaurant: RestaurantRow;
  fetchesLeft: number;
  llmLeft: number;
  deadline: number;
  runDeadline: number;
  visited: Set<string>;
  pages: Map<string, PageContent>;
  results: ScoredResult[];
  attempts: AttemptRecord[];
}

interface PageContent {
  url: string;
  html: string;
  /** Structure-preserving text, already windowed to the prompt budget. */
  text: string;
  renderedWithJs: boolean;
}

/** The earlier of the restaurant's and the run's deadline. */
function deadlineOf(ctx: RunContext): number {
  return Math.min(ctx.deadline, ctx.runDeadline);
}

function timeLeft(ctx: RunContext): number {
  return remainingMs(deadlineOf(ctx), Date.now());
}

function canFetch(ctx: RunContext): boolean {
  return ctx.fetchesLeft > 0 && timeLeft(ctx) >= MIN_FETCH_WINDOW_MS;
}

/** A Claude call started with less than MIN_LLM_WINDOW_MS left only wastes tokens. */
function canCallLlm(ctx: RunContext): boolean {
  return ctx.llmLeft > 0 && timeLeft(ctx) >= MIN_LLM_WINDOW_MS;
}

/** A timeout for one fetch: at most `ceilingMs`, never past the deadline. */
function fetchTimeout(ctx: RunContext, ceilingMs: number): number {
  return fetchWindow(deadlineOf(ctx), Date.now(), ceilingMs);
}

// ─── Page fetching ──────────────────────────────────────────────────────────

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Upgrade-Insecure-Requests": "1",
};

const PAGE_TIMEOUT_MS = 20_000;

/** Ceiling on one JS render, across scrapeUrl's whole backend fallback chain. */
const RENDER_TIMEOUT_MS = 40_000;
const RENDER_DEADLINE = "render deadline";

interface RenderResult {
  success: boolean;
  html?: string;
  markdown?: string;
  error?: string;
}

/**
 * Fetch a page, escalating to a JS-rendering backend when the plain response
 * is an empty app shell.
 *
 * This is the single biggest reliability fix in the rewrite. `_shared/scraper`
 * has had Browserless and Firecrawl backends all along; the menu scraper never
 * used them and called bare `fetch` instead, which cannot see a menu that is
 * painted by JavaScript. Escalation is conditional so the ordinary
 * server-rendered site still costs one cheap request.
 */
async function fetchMenuPage(ctx: RunContext, url: string): Promise<PageContent | null> {
  const key = url.replace(/\/$/, "").toLowerCase();
  const cached = ctx.pages.get(key);
  if (cached) return cached;
  if (ctx.visited.has(key)) return null;
  ctx.visited.add(key);

  if (!isPublicHttpUrl(url) || !canFetch(ctx)) return null;
  ctx.fetchesLeft--;

  let html = "";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), fetchTimeout(ctx, PAGE_TIMEOUT_MS));
    const response = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal });
    clearTimeout(timer);

    if (response.ok) {
      html = await response.text();
    } else {
      console.log(`  ❌ ${url} → HTTP ${response.status}`);
      ctx.attempts.push({
        url,
        method: "fetch",
        outcome: "error",
        items: 0,
        score: 0,
        detail: `HTTP ${response.status}`,
      });
    }
  } catch (error) {
    console.log(`  ❌ ${url} → ${(error as Error).message}`);
  }

  let text = html ? prepareMenuContent(html) : "";
  let renderedWithJs = false;

  const platform = detectMenuPlatform(url, html);
  const needsJs = platform.requiresJs || !html || looksClientRendered(html, text);

  if (needsJs && canFetch(ctx)) {
    ctx.fetchesLeft--;
    console.log(
      `  🎭 ${url} needs rendering (platform=${platform.platform ?? "unknown"}) — escalating`,
    );
    // scrapeUrl chains render backends, each with its own timeout (one has
    // none), so the deadline is enforced by not waiting past it.
    const renderMs = fetchTimeout(ctx, RENDER_TIMEOUT_MS);
    const rendered: RenderResult = await withDeadline<RenderResult>(
      scrapeUrl(url, { waitTime: 6000, timeout: Math.min(30_000, renderMs) }).catch((error) => ({
        success: false,
        error: (error as Error).message,
      })),
      renderMs,
      { success: false, error: RENDER_DEADLINE },
    );
    if (rendered.error === RENDER_DEADLINE) {
      ctx.attempts.push({
        url,
        method: "render",
        outcome: "error",
        items: 0,
        score: 0,
        detail: `render did not finish within ${renderMs}ms`,
      });
    }
    if (rendered.success && (rendered.html || rendered.markdown)) {
      const body = rendered.html || rendered.markdown || "";
      const renderedText = prepareMenuContent(body);
      // Keep the render only if it actually revealed more menu content.
      if (menuSignalCount(renderedText) > menuSignalCount(text) || renderedText.length > text.length) {
        html = body;
        text = renderedText;
        renderedWithJs = true;
      }
    }
  }

  if (!html) return null;

  const page: PageContent = { url, html, text, renderedWithJs };
  ctx.pages.set(key, page);
  console.log(
    `  ✅ ${url} → ${html.length} HTML, ${text.length} prepared text, ${menuSignalCount(text)} menu signals${renderedWithJs ? " (JS)" : ""}`,
  );
  return page;
}

// ─── Free (non-LLM) extraction passes ───────────────────────────────────────

/**
 * Run the zero-cost extractors over a fetched page and record anything they
 * find. Returns candidate URLs the page pointed at.
 */
function harvestPage(ctx: RunContext, page: PageContent): MenuCandidate[] {
  const { restaurant } = ctx;

  // 1. schema.org — exact data when present.
  const jsonLd = extractMenuFromJsonLd(page.html, page.url);
  if (jsonLd.extraction) {
    record(ctx, jsonLd.extraction, "jsonld");
  }

  // 2. The platform's own JSON state.
  const embedded = extractMenuFromEmbeddedState(page.html, page.url);
  if (embedded) {
    record(ctx, embedded, "platform");
  }

  // 3. Everything the page links to.
  const fromJsonLd: MenuCandidate[] = jsonLd.menuUrls.map((url) => ({
    url,
    // schema.org `hasMenu` is the site stating where its menu is; trust it
    // above any link-text heuristic.
    score: 40,
    kind: isPdfUrl(url) ? "pdf" : isImageUrl(url) ? "image" : "page",
    label: "schema.org hasMenu",
    isSection: false,
  }));

  const candidates = mergeCandidates(
    fromJsonLd,
    discoverMenuEmbeds(page.html, page.url),
    discoverMenuLinks(page.html, page.url),
    discoverMenuImages(page.html, page.url, isMenuishUrl(page.url) || hasMenuHeading(page.html)),
  );

  console.log(
    `  🔎 ${page.url}: ${candidates.length} candidate(s) for ${restaurant.name}`,
  );
  return candidates;
}

/** Does the page announce itself as a menu in a heading? */
function hasMenuHeading(html: string): boolean {
  return /<h[1-3]\b[^>]*>[^<]{0,60}\bmenus?\b/i.test(html);
}

/** Normalize, score and file a result. */
function record(ctx: RunContext, raw: MenuExtraction, method: string): ScoredResult | null {
  const extraction = normalizeExtraction(raw);
  const quality = scoreExtraction(extraction);
  const notes = raw.truncated ? [`reply incomplete: ${raw.truncated}`, ...quality.warnings] : quality.warnings;

  const attempt: AttemptRecord = {
    url: raw.source_url,
    method,
    outcome: quality.item_count === 0 ? "empty" : passesQualityGate(quality) ? "success" : "rejected",
    items: quality.item_count,
    score: quality.score,
    detail: notes.join("; ") || undefined,
  };
  ctx.attempts.push(attempt);

  console.log(
    `  📊 [${method}] ${raw.source_url} → ${quality.item_count} items, ${quality.section_count} sections, score ${quality.score}${quality.warnings.length ? ` (${quality.warnings.join("; ")})` : ""}`,
  );

  if (!passesQualityGate(quality)) return null;

  const result = { extraction, quality };
  ctx.results.push(result);
  return result;
}

// ─── LLM extraction passes ──────────────────────────────────────────────────

async function tryPdf(ctx: RunContext, url: string): Promise<void> {
  if (!canCallLlm(ctx) || !canFetch(ctx) || !isPublicHttpUrl(url)) return;
  const key = `pdf:${url.toLowerCase()}`;
  if (ctx.visited.has(key)) return;
  ctx.visited.add(key);

  ctx.fetchesLeft--;
  // The helper's timeout stops at the response headers, not the body, so the
  // download as a whole is bounded here.
  const pdfMs = fetchTimeout(ctx, 30_000);
  const base64 = await withDeadline(fetchPdfAsBase64(url, pdfMs), pdfMs, null);
  if (!base64) {
    ctx.attempts.push({ url, method: "pdf_vision", outcome: "error", items: 0, score: 0, detail: "fetch failed" });
    return;
  }

  // The download may have used the time a Claude call needs.
  if (!canCallLlm(ctx)) {
    ctx.attempts.push({ url, method: "pdf_vision", outcome: "skipped", items: 0, score: 0, detail: "deadline before extraction" });
    return;
  }
  ctx.llmLeft--;
  const extraction = await extractMenuFromPdf(llmContext, base64, ctx.restaurant.name, url, deadlineOf(ctx));
  if (extraction) record(ctx, extraction, "pdf_vision");
  else ctx.attempts.push({ url, method: "pdf_vision", outcome: "empty", items: 0, score: 0 });
}

/**
 * Fetch the best image candidates and read them together.
 *
 * Batched on purpose: a menu photographed in four pieces is one menu, and
 * sending the pieces separately produces four fragmentary extractions that
 * each fail the quality gate on their own.
 */
async function tryImages(ctx: RunContext, candidates: MenuCandidate[], sourceUrl: string): Promise<void> {
  if (candidates.length === 0 || !canCallLlm(ctx)) return;

  const images: Array<{ base64: string; mediaType: string }> = [];
  for (const candidate of candidates) {
    if (images.length >= 4 || !canFetch(ctx)) break;
    if (!isPublicHttpUrl(candidate.url)) continue;
    const key = `img:${candidate.url.toLowerCase()}`;
    if (ctx.visited.has(key)) continue;
    ctx.visited.add(key);

    ctx.fetchesLeft--;
    const imageMs = fetchTimeout(ctx, 20_000);
    const fetched = await withDeadline(fetchImageAsBase64(candidate.url, imageMs), imageMs, null);
    if (fetched) images.push({ base64: fetched.base64, mediaType: fetched.mediaType });
  }

  if (images.length === 0) {
    ctx.attempts.push({
      url: sourceUrl,
      method: "image_vision",
      outcome: "skipped",
      items: 0,
      score: 0,
      detail: "no fetchable images",
    });
    return;
  }

  if (!canCallLlm(ctx)) {
    ctx.attempts.push({ url: sourceUrl, method: "image_vision", outcome: "skipped", items: 0, score: 0, detail: "deadline before extraction" });
    return;
  }
  ctx.llmLeft--;
  const extraction = await extractMenuFromImages(llmContext, images, ctx.restaurant.name, sourceUrl, deadlineOf(ctx));
  if (extraction) record(ctx, extraction, "image_vision");
  else ctx.attempts.push({ url: sourceUrl, method: "image_vision", outcome: "empty", items: 0, score: 0 });
}

/** Minimum menu signal density before a page is worth an LLM call. */
const MIN_SIGNALS_FOR_TEXT_EXTRACTION = 6;

async function tryPageText(ctx: RunContext, page: PageContent): Promise<void> {
  if (!canCallLlm(ctx)) return;

  const signals = menuSignalCount(page.text);
  if (signals < MIN_SIGNALS_FOR_TEXT_EXTRACTION || page.text.length < 200) {
    ctx.attempts.push({
      url: page.url,
      method: "html_text",
      outcome: "skipped",
      items: 0,
      score: 0,
      detail: `only ${signals} menu signals`,
    });
    return;
  }

  ctx.llmLeft--;
  const extraction = await extractMenuFromText(llmContext, page.text, ctx.restaurant.name, page.url, deadlineOf(ctx));
  if (extraction) record(ctx, extraction, "html_text");
  else ctx.attempts.push({ url: page.url, method: "html_text", outcome: "empty", items: 0, score: 0 });
}

// ─── Orchestration ──────────────────────────────────────────────────────────

async function scrapeRestaurantMenu(
  restaurant: RestaurantRow,
  options: {
    forceUpdate: boolean;
    maxAgeDays: number;
    dryRun: boolean;
    runDeadline: number;
    /**
     * The attempt log, owned by the caller so that a response sent at the hard
     * deadline can still persist what this restaurant tried.
     */
    attempts: AttemptRecord[];
    /** True once the handler has answered without waiting for this restaurant. */
    abandoned: () => boolean;
  },
): Promise<RestaurantOutcome> {
  const ctx: RunContext = {
    restaurant,
    fetchesLeft: DEFAULT_BUDGET.fetches,
    llmLeft: DEFAULT_BUDGET.llmCalls,
    deadline: Date.now() + DEFAULT_BUDGET.msPerRestaurant,
    runDeadline: options.runDeadline,
    visited: new Set(),
    pages: new Map(),
    results: [],
    attempts: options.attempts,
  };

  // ── Freshness check ──
  if (!options.forceUpdate) {
    const { data: existing, error: existingError } = await supabase
      .from("restaurant_menus")
      .select("id, captured_at")
      .eq("restaurant_id", restaurant.id)
      .eq("is_current", true)
      .maybeSingle();

    // SKIPS RATHER THAN RE-SCRAPING. The error was discarded, so a failed read
    // produced `existing = null`, which reads as "no current menu" and sends us
    // back to fetch somebody else's website - a request to a third party made
    // because OUR query failed. Not knowing whether the menu is fresh is a
    // reason to leave it alone, and the skip is reported with its real cause so
    // a persistent failure shows up as unmeasurable rather than as quiet churn.
    if (existingError) {
      return {
        success: false,
        items_count: 0,
        skipped: true,
        error: `Could not check menu freshness: ${existingError.message}`,
        attempts: [],
      };
    }

    if (existing?.captured_at) {
      const ageDays = (Date.now() - new Date(existing.captured_at).getTime()) / 86_400_000;
      if (ageDays < options.maxAgeDays) {
        return {
          success: true,
          items_count: 0,
          skipped: true,
          error: `Menu already current (${Math.round(ageDays)}d old)`,
          attempts: [],
        };
      }
    }
  }

  const menuUrl = normalizeSiteUrl(restaurant.menu_url);
  const siteUrl = normalizeSiteUrl(restaurant.website);

  if (!menuUrl && !siteUrl) {
    return { success: false, items_count: 0, error: "No usable website or menu URL", attempts: [] };
  }

  let candidates: MenuCandidate[] = [];

  // ── Phase 1: an explicit menu_url that is itself the menu ──
  if (menuUrl) {
    if (isPdfUrl(menuUrl)) {
      await tryPdf(ctx, menuUrl);
    } else if (isImageUrl(menuUrl)) {
      await tryImages(ctx, [{ url: menuUrl, score: 100, kind: "image", label: "menu_url", isSection: false }], menuUrl);
    }
  }

  // ── Phase 2: seed pages ──
  const seeds = [menuUrl, siteUrl].filter((u): u is string => !!u);
  for (const seed of seeds) {
    const page = await fetchMenuPage(ctx, seed);
    if (!page) continue;
    candidates = mergeCandidates(candidates, harvestPage(ctx, page));

    // A seed that is itself the menu page gets extracted directly rather than
    // being re-discovered as a candidate.
    if (seed === menuUrl || isMenuishUrl(seed)) {
      await tryPageText(ctx, page);
    }
  }

  // ── Phase 3: guessed paths, only when discovery found nothing promising ──
  const hasPromisingPage = candidates.some((c) => c.kind !== "image" && c.score >= 9);
  if (!hasResult(ctx) && !hasPromisingPage && siteUrl) {
    const patterns = [...MENU_PATH_PATTERNS.tier1, ...MENU_PATH_PATTERNS.tier2];
    for (const path of patterns) {
      if (!canFetch(ctx) || hasStrongResult(ctx)) break;
      const page = await fetchMenuPage(ctx, `${siteUrl}${path}`);
      if (!page) continue;
      candidates = mergeCandidates(candidates, harvestPage(ctx, page));
      await tryPageText(ctx, page);
    }
  }

  // ── Phase 4: the site's own sitemap, for paths no pattern list would guess ──
  if (!hasResult(ctx) && !hasPromisingPage && siteUrl && canFetch(ctx)) {
    for (const url of await sitemapCandidates(ctx, siteUrl)) {
      candidates = mergeCandidates(candidates, [
        { url, score: 12, kind: isPdfUrl(url) ? "pdf" : "page", label: "sitemap", isSection: false },
      ]);
    }
  }

  // ── Phase 5: work the candidate queue, cheapest and most precise first ──
  await processCandidates(ctx, candidates);

  // ── Phase 6: nothing found yet — read the densest page we already have ──
  if (!hasResult(ctx)) {
    await tryDensestFetchedPage(ctx);
  }

  // Say so when the clock, not the search, ended this restaurant: "no menu
  // found" and "ran out of time" call for different follow-ups.
  if (timeLeft(ctx) < MIN_LLM_WINDOW_MS && !hasStrongResult(ctx)) {
    ctx.attempts.push({
      url: menuUrl ?? siteUrl ?? "",
      method: "deadline",
      outcome: "skipped",
      items: 0,
      score: 0,
      detail: `stopped with ${Math.round(timeLeft(ctx) / 1000)}s left; ${ctx.llmLeft} Claude call(s) and ${ctx.fetchesLeft} fetch(es) unused`,
    });
  }

  // ── Phase 7: pick and merge ──
  if (ctx.results.length === 0) {
    return {
      success: false,
      items_count: 0,
      error: describeFailure(ctx),
      attempts: ctx.attempts,
    };
  }

  const best = combineResults(ctx.results);
  const itemCount = countItems(best.extraction);

  if (options.dryRun) {
    return {
      success: true,
      items_count: itemCount,
      method: best.extraction.method,
      source_url: best.extraction.source_url,
      confidence: best.quality.score,
      attempts: ctx.attempts,
    };
  }

  // The handler already answered and logged this restaurant as cut off;
  // publishing now would contradict the response it sent.
  if (options.abandoned()) {
    return {
      success: false,
      items_count: 0,
      error: "Response deadline reached before saving",
      attempts: ctx.attempts,
    };
  }

  const saved = await saveMenuToDatabase(restaurant.id, best);
  return { ...saved, attempts: ctx.attempts };
}

function hasResult(ctx: RunContext): boolean {
  return ctx.results.length > 0;
}

/**
 * A result good enough to stop looking.
 *
 * Distinct from `hasResult` on purpose. A homepage's schema.org block often
 * describes three featured dishes — that clears the publication gate but is
 * not the menu, and treating any result as "done" would recreate the
 * first-answer-wins behaviour this rewrite exists to remove. Weak results are
 * kept and merged; only a strong one ends the search.
 */
const STRONG_RESULT_SCORE = 0.5;

function hasStrongResult(ctx: RunContext): boolean {
  return ctx.results.some((r) => r.quality.score >= STRONG_RESULT_SCORE);
}

/**
 * Last resort: extract from the densest page already fetched.
 *
 * Covers the one-page restaurant site, where the whole menu is on the homepage
 * and there is no menu link to discover — common enough among small
 * independents that skipping it would leave a whole category unscraped.
 * Costs nothing extra in fetches; the pages are already in hand.
 */
async function tryDensestFetchedPage(ctx: RunContext): Promise<void> {
  const pages = [...ctx.pages.values()]
    .map((page) => ({ page, signals: menuSignalCount(page.text) }))
    .filter(({ signals }) => signals >= MIN_SIGNALS_FOR_TEXT_EXTRACTION)
    .sort((a, b) => b.signals - a.signals);

  for (const { page, signals } of pages) {
    if (hasResult(ctx) || !canCallLlm(ctx)) break;
    console.log(`  🪧 Last resort: extracting from ${page.url} (${signals} menu signals)`);
    await tryPageText(ctx, page);
  }
}

/** Explain, from the attempt log, why nothing was published. */
function describeFailure(ctx: RunContext): string {
  if (ctx.attempts.length === 0) return "No menu content found";
  const rejected = ctx.attempts.filter((a) => a.outcome === "rejected");
  if (rejected.length > 0) {
    const worst = rejected.sort((a, b) => b.score - a.score)[0];
    return `Found content but quality too low (best: ${worst.items} items, score ${worst.score} via ${worst.method})`;
  }
  const errors = ctx.attempts.filter((a) => a.outcome === "error");
  if (errors.length === ctx.attempts.length) {
    return `All fetches failed (${errors[0]?.detail ?? "unknown"})`;
  }
  return "No menu items could be extracted from any discovered source";
}

/** Read the sitemap (and one level of sitemap index) for menu-shaped URLs. */
async function sitemapCandidates(ctx: RunContext, siteUrl: string): Promise<string[]> {
  const found: string[] = [];
  for (const path of ["/sitemap.xml", "/sitemap_index.xml"]) {
    if (!canFetch(ctx)) break;
    ctx.fetchesLeft--;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), fetchTimeout(ctx, 10_000));
      const response = await fetch(`${siteUrl}${path}`, {
        headers: BROWSER_HEADERS,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) continue;
      const xml = await response.text();
      found.push(...menuUrlsFromSitemap(xml));
      if (found.length > 0) break;
    } catch {
      // A missing sitemap is the norm, not an error worth reporting.
    }
  }
  if (found.length > 0) console.log(`  🗺️ sitemap suggested ${found.length} menu URL(s)`);
  return found;
}

/**
 * Try candidates in tiers.
 *
 * PDFs first — a linked PDF is usually the complete menu and one Vision call
 * reads all of it. Then platform/embed pages, whose extraction is free when
 * their JSON is readable. Then ordinary pages, whose text costs a Claude call.
 * Images last, because they are the least precise and most likely to be a
 * photo of a burger rather than the menu.
 */
async function processCandidates(ctx: RunContext, candidates: MenuCandidate[]): Promise<void> {
  const pdfs = candidates.filter((c) => c.kind === "pdf").slice(0, 3);
  const pages = candidates.filter((c) => c.kind === "page");
  const images = candidates.filter((c) => c.kind === "image");

  for (const candidate of pdfs) {
    if (!canCallLlm(ctx)) break;
    console.log(`  📄 PDF candidate [${candidate.score}] ${candidate.url}`);
    await tryPdf(ctx, candidate.url);
  }

  // Platform and embed pages first — they are where the readable JSON lives.
  const orderedPages = [
    ...pages.filter((c) => c.platform),
    ...pages.filter((c) => !c.platform),
  ].slice(0, 8);

  /**
   * Section pages ("Burgers", "Brunch", "On Tap") are pieces of one menu, so
   * they are all visited and merged rather than stopping at the first hit.
   * A single non-section menu page is usually the whole menu, so once one of
   * those clears the gate there is nothing more to look for.
   */
  const sectionPages = orderedPages.filter((c) => c.isSection);
  const wholeMenuPages = orderedPages.filter((c) => !c.isSection);

  for (const candidate of wholeMenuPages) {
    if (hasStrongResult(ctx) || !canFetch(ctx)) break;
    const page = await fetchMenuPage(ctx, candidate.url);
    if (!page) continue;
    harvestPage(ctx, page); // JSON-LD / embedded state may resolve it for free
    if (!hasStrongResult(ctx)) await tryPageText(ctx, page);
  }

  const shouldReadSections = sectionPages.length >= 2 && ctx.llmLeft >= 2;
  if (shouldReadSections) {
    console.log(`  📚 Multi-page menu: ${sectionPages.length} section page(s)`);
    for (const candidate of sectionPages.slice(0, 6)) {
      if (!canFetch(ctx) || !canCallLlm(ctx)) break;
      const page = await fetchMenuPage(ctx, candidate.url);
      if (!page) continue;
      harvestPage(ctx, page);
      await tryPageText(ctx, page);
    }
  }

  // Images are worth a call when nothing else worked, or when the top image
  // candidate scored high enough to be the menu itself rather than decoration.
  const topImages = images.slice(0, 6);
  const imagesLookStrong = topImages[0]?.score >= 15;
  if (topImages.length > 0 && (!hasResult(ctx) || imagesLookStrong)) {
    const source = topImages[0].url;
    console.log(`  🖼️ ${topImages.length} image candidate(s), best score ${topImages[0].score}`);
    await tryImages(ctx, topImages, source);
  }
}

/**
 * Combine everything that passed the gate into the menu to publish.
 *
 * The highest-scoring result is authoritative; the others only contribute
 * items it does not already have. That is what makes a split menu whole
 * again without letting a weak extraction dilute a strong one.
 */
function combineResults(results: ScoredResult[]): ScoredResult {
  const ranked = rankExtractions(results);
  let merged = ranked[0].extraction;

  for (const other of ranked.slice(1)) {
    if (other.extraction.source_url === merged.source_url) continue;
    const before = countItems(merged);
    const candidate = mergeExtractions(merged, other.extraction);
    const added = countItems(candidate) - before;
    if (added > 0) {
      console.log(`  ➕ merged ${added} item(s) from ${other.extraction.source_url}`);
      merged = candidate;
    }
  }

  return { extraction: merged, quality: scoreExtraction(merged) };
}

// ─── Persistence ────────────────────────────────────────────────────────────

async function saveMenuToDatabase(
  restaurantId: string,
  result: ScoredResult,
): Promise<RestaurantOutcome> {
  const { extraction, quality } = result;
  const totalItems = countItems(extraction);

  const { data: newMenu, error: menuError } = await supabase
    .from("restaurant_menus")
    .insert({
      restaurant_id: restaurantId,
      is_current: true,
      source_type: "scraped",
      source_url: extraction.source_url.slice(0, 2000),
      captured_at: new Date().toISOString(),
      raw_text: extraction.raw_text,
      extraction_method: extraction.method,
      confidence: quality.score,
      item_count: totalItems,
    })
    .select("id")
    .single();

  if (menuError || !newMenu) {
    return {
      success: false,
      items_count: 0,
      error: `DB insert error: ${menuError?.message}`,
      attempts: [],
    };
  }

  const rows = extraction.sections.flatMap((section) =>
    section.items.map((item, index) => ({
      menu_id: newMenu.id,
      section_name: section.section_name,
      section_sort_order: section.section_sort_order,
      item_name: item.item_name,
      item_description: item.item_description,
      price: item.price,
      price_numeric: item.price_numeric,
      dietary_tags: item.dietary_tags,
      is_popular: item.is_popular,
      sort_order: index,
    })),
  );

  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from("restaurant_menu_items").insert(rows.slice(i, i + 100));
    if (error) {
      console.error(`Error inserting menu items batch ${i}:`, error);
      await supabase.from("restaurant_menus").delete().eq("id", newMenu.id);
      return {
        success: false,
        items_count: 0,
        error: `Items insert error: ${error.message}`,
        attempts: [],
      };
    }
  }

  return {
    success: true,
    items_count: totalItems,
    method: extraction.method,
    source_url: extraction.source_url,
    confidence: quality.score,
    attempts: [],
  };
}

/**
 * Persist the attempt log.
 *
 * Best-effort by design: menu scraping must not fail because diagnostics could
 * not be written, and the table may legitimately not exist yet in an
 * environment where the migration has not been applied.
 */
async function logAttempts(restaurantId: string, outcome: RestaurantOutcome): Promise<void> {
  if (outcome.attempts.length === 0) return;
  try {
    await supabase.from("menu_scrape_attempts").insert(
      outcome.attempts.slice(0, 40).map((attempt) => ({
        restaurant_id: restaurantId,
        url: attempt.url.slice(0, 2000),
        method: attempt.method,
        outcome: attempt.outcome,
        items_found: attempt.items,
        confidence: attempt.score,
        detail: attempt.detail?.slice(0, 500) ?? null,
      })),
    );
  } catch (error) {
    console.warn(`  ⚠️ Could not log scrape attempts: ${(error as Error).message}`);
  }
}

// ─── HTTP handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // The 150s idle limit counts from the request, so the clock starts before
  // the auth check and the restaurant query, not after them.
  const startedAt = Date.now();

  // Runs as service_role and had no caller check. verify_jwt is not a gate:
  // it defaults to true, and true only means "a valid Supabase JWT" - which
  // the publishable anon key is, in every client bundle.
  //
  // Every caller is admin-gated already: RestaurantMenuManager / MenuScrapePanel, mounted at
  // /admin/menus behind <ProtectedRoute requireAdmin>. No cron job posts here.
  // So the route assumed admin and the server did not enforce it; the admin
  // JWT that functions.invoke sends is what requireAdminOrApiKey checks.
  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  const runDeadline = startedAt + RUN_DEADLINE_MS;
  const responseAt = startedAt + RESPONSE_DEADLINE_MS;

  try {
    const body: ScrapeRequest = await req.json().catch(() => ({}));
    const {
      restaurant_id,
      restaurant_ids,
      batch_size = 10,
      force_update = false,
      max_age_days = DEFAULT_MAX_AGE_DAYS,
      dry_run = false,
    } = body;

    const restaurants = await selectRestaurants({
      restaurant_id,
      restaurant_ids,
      batch_size,
      force_update,
      max_age_days,
    });

    if (restaurants.length === 0) {
      return json({ success: true, message: "No restaurants to process", processed: 0 });
    }

    console.log(`Starting menu scrape for ${restaurants.length} restaurant(s)`);

    const batch = newBatch();
    const work = runBatch(restaurants, batch, {
      forceUpdate: force_update,
      maxAgeDays: max_age_days,
      dryRun: dry_run,
      runDeadline,
    });

    // Every fetch and Claude call is bounded by runDeadline, so `work` should
    // finish first. This is the guarantee that does not depend on that being
    // true everywhere: at responseAt the caller gets an answer regardless.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cutoff = new Promise<"cutoff">((resolve) => {
      timer = setTimeout(() => resolve("cutoff"), remainingMs(responseAt, Date.now()));
    });
    const winner = await Promise.race([work.then(() => "done" as const), cutoff]);
    clearTimeout(timer);

    if (winner === "cutoff") {
      console.warn(`⏱️ Response deadline (${RESPONSE_DEADLINE_MS / 1000}s) reached — answering with partial results`);
      await abandonBatch(batch, dry_run);
    }

    console.log(`\nComplete: ${batch.succeeded}/${batch.processed} restaurants, ${batch.totalItems} total items`);

    return json({
      success: true,
      processed: batch.processed,
      succeeded: batch.succeeded,
      total_items: batch.totalItems,
      errors: batch.errors.length > 0 ? batch.errors : undefined,
      // Additive fields — older clients ignore unknown keys.
      dry_run,
      deadline_reached: batch.deadlineHit,
      remaining: restaurants.length - batch.processed,
      elapsed_ms: Date.now() - startedAt,
      results: batch.results,
    });
  } catch (error) {
    console.error("Error in menu scraper:", error);
    return json({ error: "Internal server error", details: (error as Error).message }, 500);
  }
});

/** What the batch has done so far; read by the handler even mid-run. */
interface BatchState {
  processed: number;
  succeeded: number;
  totalItems: number;
  errors: string[];
  results: Array<Record<string, unknown>>;
  deadlineHit: boolean;
  /** Set when the handler answered without waiting; the loop stops writing. */
  abandoned: boolean;
  /** The restaurant in progress and the attempt log it is filling. */
  current: { restaurant: RestaurantRow; attempts: AttemptRecord[] } | null;
}

function newBatch(): BatchState {
  return {
    processed: 0,
    succeeded: 0,
    totalItems: 0,
    errors: [],
    results: [],
    deadlineHit: false,
    abandoned: false,
    current: null,
  };
}

async function runBatch(
  restaurants: RestaurantRow[],
  batch: BatchState,
  options: { forceUpdate: boolean; maxAgeDays: number; dryRun: boolean; runDeadline: number },
): Promise<void> {
  for (const restaurant of restaurants) {
    if (batch.abandoned) return;
    // A restaurant started with less time than one Claude call needs would
    // only fetch pages it cannot read.
    if (remainingMs(options.runDeadline, Date.now()) < MIN_LLM_WINDOW_MS) {
      batch.deadlineHit = true;
      console.warn(`⏱️ Run deadline reached — ${restaurants.length - batch.processed} restaurant(s) not attempted`);
      return;
    }

    console.log(`\nProcessing: ${restaurant.name} (${restaurant.website ?? restaurant.menu_url})`);

    const attempts: AttemptRecord[] = [];
    batch.current = { restaurant, attempts };

    let outcome: RestaurantOutcome;
    try {
      outcome = await scrapeRestaurantMenu(restaurant, {
        ...options,
        attempts,
        abandoned: () => batch.abandoned,
      });
    } catch (error) {
      // One pathological site must not abort the batch.
      outcome = {
        success: false,
        items_count: 0,
        error: `Unhandled error: ${(error as Error).message}`,
        attempts,
      };
      console.error(`  💥 ${restaurant.name}:`, error);
    }

    // The handler has already reported and logged this restaurant.
    if (batch.abandoned) return;
    batch.current = null;

    batch.processed++;
    batch.results.push({
      restaurant_id: restaurant.id,
      name: restaurant.name,
      success: outcome.success && outcome.items_count > 0,
      skipped: outcome.skipped ?? false,
      items_count: outcome.items_count,
      method: outcome.method,
      source_url: outcome.source_url,
      confidence: outcome.confidence,
      error: outcome.error,
      attempts: outcome.attempts,
    });

    if (outcome.success && outcome.items_count > 0) {
      batch.succeeded++;
      batch.totalItems += outcome.items_count;
      console.log(
        `  ✅ ${restaurant.name}: ${outcome.items_count} items via ${outcome.method} (confidence ${outcome.confidence})`,
      );
    } else if (outcome.skipped) {
      console.log(`  ⏭️ ${restaurant.name}: ${outcome.error}`);
    } else {
      const message = `${restaurant.name}: ${outcome.error ?? "Unknown error"}`;
      console.log(`  ❌ ${message}`);
      batch.errors.push(message);
    }

    if (!options.dryRun) await logAttempts(restaurant.id, outcome);
  }
}

/** How long the attempt-log write may hold the response after the cutoff. */
const ABANDON_LOG_MS = 4_000;

/**
 * Close out the restaurant still running at the response deadline: report it
 * as cut off and persist what it had tried, so the attempt log shows the
 * timeout instead of nothing.
 */
async function abandonBatch(batch: BatchState, dryRun: boolean): Promise<void> {
  batch.abandoned = true;
  batch.deadlineHit = true;
  const current = batch.current;
  batch.current = null;
  if (!current) return;

  const { restaurant, attempts } = current;
  attempts.push({
    url: restaurant.menu_url ?? restaurant.website ?? "",
    method: "deadline",
    outcome: "error",
    items: 0,
    score: 0,
    detail: `response sent at ${RESPONSE_DEADLINE_MS / 1000}s with this restaurant still running`,
  });
  const snapshot = [...attempts];
  const message = `${restaurant.name}: response deadline reached mid-restaurant`;

  batch.processed++;
  batch.errors.push(message);
  batch.results.push({
    restaurant_id: restaurant.id,
    name: restaurant.name,
    success: false,
    skipped: false,
    items_count: 0,
    error: "Response deadline reached mid-restaurant",
    attempts: snapshot,
  });

  if (!dryRun) {
    await withDeadline(
      logAttempts(restaurant.id, { success: false, items_count: 0, attempts: snapshot }),
      ABANDON_LOG_MS,
      undefined,
    );
  }
}

async function selectRestaurants(params: {
  restaurant_id?: string;
  restaurant_ids?: string[];
  batch_size: number;
  force_update: boolean;
  max_age_days: number;
}): Promise<RestaurantRow[]> {
  const columns = "id, name, website, menu_url";

  if (params.restaurant_id) {
    const { data, error } = await supabase
      .from("restaurants")
      .select(columns)
      .eq("id", params.restaurant_id)
      .maybeSingle();
    // Returning [] means "this restaurant has no scrapeable URL", which is a
    // statement about the row, not about our ability to read it.
    if (error) throw new Error(`Could not read restaurant ${params.restaurant_id}: ${error.message}`);
    return data && (data.website || data.menu_url) ? [data as RestaurantRow] : [];
  }

  if (params.restaurant_ids?.length) {
    const { data, error } = await supabase.from("restaurants").select(columns).in("id", params.restaurant_ids);
    if (error) throw new Error(`Could not read the requested restaurants: ${error.message}`);
    return ((data ?? []) as RestaurantRow[]).filter((r) => r.website || r.menu_url);
  }

  let query = supabase
    .from("restaurants")
    .select(columns)
    .eq("menu_scrape_enabled", true)
    .order("popularity_score", { ascending: false, nullsFirst: false })
    .limit(params.batch_size);

  if (!params.force_update) {
    const cutoff = new Date(Date.now() - params.max_age_days * 86_400_000).toISOString();
    const { data: recent, error: recentError } = await supabase
      .from("restaurant_menus")
      .select("restaurant_id")
      .eq("is_current", true)
      .gte("captured_at", cutoff);

    // THE EXCLUSION LIST IS THE WHOLE POINT OF THIS BRANCH. An empty list means
    // "nothing has been scraped recently", so a failed read removed the filter
    // entirely and the batch went back out to every restaurant's website inside
    // the freshness window. That is a large, outward-facing side effect caused
    // by an internal query failing, so it stops the run instead.
    if (recentError) {
      throw new Error(`Could not read recently scraped menus: ${recentError.message}`);
    }

    const excludeIds = (recent ?? []).map((m) => m.restaurant_id);
    if (excludeIds.length > 0) {
      query = query.not("id", "in", `(${excludeIds.join(",")})`);
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(`Could not read restaurants to scrape: ${error.message}`);
  return ((data ?? []) as RestaurantRow[]).filter((r) => r.website || r.menu_url);
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
