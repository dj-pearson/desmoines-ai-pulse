// nlp-search core: parse a query into an intent, turn the intent into
// PostgREST queries, and report which parts of the intent became a predicate.
//
// Everything with a side effect (the Supabase client, the Claude fetch, the
// clock, CORS, rate limiting, EdgeRuntime.waitUntil) comes in through
// SearchDeps, so handler.test.ts and search.test.ts run offline with stubs.
// This file must not import anything remote: index.ts wires the real deps.
//
// docs/page-plans/search.md WP1.

import { sanitizePostgrestPattern } from "../_shared/validation.ts";
import { centralTodayStartUtc, type NlpDateFilter, nlpDateWindow } from "./dateWindow.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const CONTENT_TYPES = ["events", "restaurants", "attractions", "hotels"] as const;
export type ContentType = typeof CONTENT_TYPES[number];

/** What a caller that sends no contentTypes gets. Hotels are opt-in. */
export const DEFAULT_CONTENT_TYPES: ContentType[] = ["events", "restaurants", "attractions"];

const DATE_FILTERS = ["today", "tomorrow", "this_weekend", "this_week", "next_week", "specific"] as const;
const TIMES_OF_DAY = ["morning", "afternoon", "evening", "night"] as const;
const PRICE_RANGES = ["free", "cheap", "moderate", "expensive", "any"] as const;
const SORTS = ["relevance", "date", "rating", "price", "distance"] as const;

export interface ParsedSearchIntent {
  contentTypes: ContentType[];
  keywords: string[];
  category?: string;
  cuisine?: string;
  location?: string;
  neighborhood?: string;
  nearDowntown?: boolean;
  dateFilter?: NlpDateFilter;
  specificDate?: string;
  timeOfDay?: typeof TIMES_OF_DAY[number];
  priceRange?: typeof PRICE_RANGES[number];
  maxBudget?: number;
  familyFriendly?: boolean;
  kidFriendly?: boolean;
  dateFriendly?: boolean;
  groupFriendly?: boolean;
  petFriendly?: boolean;
  outdoorSeating?: boolean;
  liveMusic?: boolean;
  parking?: boolean;
  dietary?: string[];
  sortBy?: typeof SORTS[number];
  confidence: number;
  originalQuery: string;
}

export type AppliedFilterKey =
  | "type"
  | "when"
  | "price"
  | "area"
  | "cuisine"
  | "category"
  | "kid"
  | "budget"
  | "keywords";

export interface AppliedFilter {
  key: AppliedFilterKey;
  label: string;
  /** The content types this predicate was applied to. Additive to the WP1 contract. */
  types: ContentType[];
}

export type MatchType = "understood" | "keyword";
export type ErrorCode = "ai_unavailable" | "bad_request" | "internal";
export type DegradedCode = "ai_timeout" | "ai_unavailable";

export interface PgError {
  code?: string;
  message?: string;
}

export interface QueryResult {
  data: unknown[] | null;
  error: PgError | null;
}

/**
 * The slice of the postgrest-js filter builder this function uses. The real
 * builder is a thenable with `then` and no `catch` (postgrest-js 2.116), and
 * the stubs in the tests are built the same way on purpose.
 */
export interface QueryBuilder extends PromiseLike<QueryResult> {
  eq(column: string, value: unknown): QueryBuilder;
  neq(column: string, value: unknown): QueryBuilder;
  is(column: string, value: null | boolean): QueryBuilder;
  in(column: string, values: readonly unknown[]): QueryBuilder;
  gte(column: string, value: string): QueryBuilder;
  lte(column: string, value: string): QueryBuilder;
  ilike(column: string, pattern: string): QueryBuilder;
  or(filters: string): QueryBuilder;
  textSearch(column: string, query: string, options: { type: "websearch"; config: string }): QueryBuilder;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): QueryBuilder;
  limit(count: number): QueryBuilder;
}

export interface SearchClient {
  from(table: string): {
    select(columns: string): QueryBuilder;
    insert(row: Record<string, unknown>): PromiseLike<{ error: PgError | null }>;
  };
  auth: {
    getUser(jwt: string): Promise<{ data: { user: { id: string } | null }; error?: unknown }>;
  };
}

/** What index.ts resolves from _shared/aiConfig.ts for one model call. */
export interface AiSetup {
  endpoint: string;
  headers: Record<string, string>;
  model: string;
  body: unknown;
  extractText: (json: unknown) => { ok: true; text: string } | { ok: false; reason: string; detail: string };
}

export interface SearchDeps {
  client: SearchClient;
  fetch: typeof fetch;
  now: () => Date;
  cors: {
    preflight: (req: Request) => Response | null;
    headers: (req: Request) => Record<string, string>;
  };
  /** Returns a ready 429 (with CORS) when the caller is over the limit, else null. */
  rateLimit: (req: Request, userId: string | null) => Promise<Response | null>;
  /** null when no Anthropic key is configured. */
  loadAi: (prompt: string) => Promise<AiSetup | null>;
  /** EdgeRuntime.waitUntil when the runtime has it; otherwise the insert is awaited. */
  waitUntil?: (promise: Promise<unknown>) => void;
  /** Model deadline. 3.5s in production; tests shorten it. */
  aiTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_QUERY_LENGTH = 200;
export const AI_TIMEOUT_MS = 3_500;
/** Below this, the parse is not trusted with category, date or location. */
export const FACET_MIN_CONFIDENCE = 0.5;
const RESULT_LIMIT = 20;
const MAX_TOKENS = 6;

/**
 * Must equal FREE_PRICE_FILTER in src/lib/eventPrice.ts; search.test.ts reads
 * that file and compares. No `price.is.null`: an event with no listed price is
 * not free.
 */
export const FREE_PRICE_FILTER = "price.ilike.%free%,price.eq.$0,price.eq.0";

export const HOTEL_COLUMNS =
  "id, name, slug, area, city, short_description, image_url, avg_nightly_rate, star_rating, latitude, longitude";

const TYPE_LABELS: Record<ContentType, string> = {
  events: "Events",
  restaurants: "Restaurants",
  attractions: "Attractions",
  hotels: "Hotels",
};

const WHEN_LABELS: Record<Exclude<NlpDateFilter, "specific">, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  this_weekend: "This weekend",
  this_week: "This week",
  next_week: "Next week",
};

/**
 * Words that say what kind of thing, when, or where, rather than what it is
 * about. Left in, they turn "things to do this weekend" into a text search
 * for "things" and nothing matches.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "for", "with", "by", "from",
  "near", "me", "my", "i", "we", "us", "is", "are", "be", "do", "what", "where", "when",
  "some", "any", "best", "good", "great", "top", "things", "thing", "stuff", "place", "places",
  "spot", "spots", "find", "show", "looking", "want", "go", "going", "out", "around", "this",
  "that", "these", "next", "event", "events", "restaurant", "restaurants", "attraction",
  "attractions", "hotel", "hotels", "today", "tonight", "tomorrow", "weekend", "week", "now",
  "des", "moines", "iowa", "dsm", "under", "over",
]);

// ---------------------------------------------------------------------------
// Input normalisation
// ---------------------------------------------------------------------------

/** Collapse whitespace and clamp. Clamp, don't reject: a new 400 would tighten validation. */
export function normalizeQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH).trim();
}

export function coerceContentTypes(raw: unknown): ContentType[] {
  if (!Array.isArray(raw)) return [...DEFAULT_CONTENT_TYPES];
  const out = CONTENT_TYPES.filter((t) => raw.includes(t));
  return out.length > 0 ? out : [...DEFAULT_CONTENT_TYPES];
}

/** The words of a query worth searching for. */
export function queryTokens(text: string): string[] {
  const out: string[] = [];
  for (const word of text.toLowerCase().split(/\s+/)) {
    const clean = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (clean.length < 2 || STOPWORDS.has(clean) || !/\p{L}/u.test(clean)) continue;
    if (!out.includes(clean)) out.push(clean);
  }
  return out;
}

function str(v: unknown, max = 60): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim().slice(0, max);
  if (!t || t.toLowerCase() === "null" || t.toLowerCase() === "none") return undefined;
  return t;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

/**
 * Turn whatever the model (or a caller's `intent` field) sent into a
 * ParsedSearchIntent this file can trust: known enum values only, keywords
 * defaulted from the query when absent, contentTypes limited to what was
 * requested, confidence clamped to 0-1.
 */
export function coerceIntent(raw: unknown, requestedTypes: ContentType[], query: string): ParsedSearchIntent {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;

  const asked = Array.isArray(r.contentTypes)
    ? requestedTypes.filter((t) => (r.contentTypes as unknown[]).includes(t))
    : [];
  const contentTypes = asked.length > 0 ? asked : [...requestedTypes];

  const keywords = Array.isArray(r.keywords)
    ? r.keywords.map((k) => str(k, 50)).filter((k): k is string => !!k).slice(0, 8)
    : queryTokens(query);

  const conf = typeof r.confidence === "number" && Number.isFinite(r.confidence) ? r.confidence : 0.5;
  const specificDate = typeof r.specificDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.specificDate)
    ? r.specificDate
    : undefined;
  const maxBudget = typeof r.maxBudget === "number" && Number.isFinite(r.maxBudget) && r.maxBudget > 0
    ? Math.round(r.maxBudget)
    : undefined;
  const dietary = Array.isArray(r.dietary)
    ? r.dietary.map((d) => str(d, 30)).filter((d): d is string => !!d).slice(0, 5)
    : [];

  const intent: ParsedSearchIntent = {
    contentTypes,
    keywords,
    category: str(r.category),
    cuisine: str(r.cuisine),
    location: str(r.location),
    neighborhood: str(r.neighborhood),
    dateFilter: oneOf(r.dateFilter, DATE_FILTERS),
    specificDate,
    timeOfDay: oneOf(r.timeOfDay, TIMES_OF_DAY),
    priceRange: oneOf(r.priceRange, PRICE_RANGES) ?? "any",
    maxBudget,
    dietary,
    sortBy: oneOf(r.sortBy, SORTS) ?? "relevance",
    confidence: Math.min(1, Math.max(0, conf)),
    originalQuery: query,
  };
  for (const flag of [
    "nearDowntown", "familyFriendly", "kidFriendly", "dateFriendly", "groupFriendly",
    "petFriendly", "outdoorSeating", "liveMusic", "parking",
  ] as const) {
    if (r[flag] === true) intent[flag] = true;
  }
  return intent;
}

// ---------------------------------------------------------------------------
// Prompt and model call
// ---------------------------------------------------------------------------

export function buildPrompt(query: string, types: ContentType[], now: Date): string {
  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Chicago" });
  const date = now.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago",
  });
  return `You are a search query parser for Des Moines, Iowa local discovery app. Parse the user's natural language query into structured search parameters.

CURRENT CONTEXT:
- Today is ${dayOfWeek}, ${date}
- Location: Des Moines, Iowa metro area
- Available neighborhoods: East Village, Court Avenue, Downtown, Ingersoll, Beaverdale, Highland Park, Drake, Sherman Hill, Valley Junction, West Des Moines, Ankeny, Urbandale, Johnston, Clive, Waukee

USER QUERY (JSON string): ${JSON.stringify(query)}

PARSE INSTRUCTIONS:
1. Identify what type of content they want (one or more of: ${types.join(", ")})
2. Extract date/time intent (today, tomorrow, this weekend, etc.)
3. Extract location preferences (downtown, specific neighborhoods)
4. Extract price constraints (free, under $X, cheap, expensive)
5. Extract audience filters (family, kids, date night, groups)
6. Extract food preferences (cuisine type, dietary restrictions)
7. Extract amenity preferences (outdoor seating, live music, parking)
8. Put only the subject words in keywords (what it is about), not dates, prices, places or content types
9. Determine sorting preference

RESPONSE FORMAT (JSON only, no explanation):
{
  "contentTypes": ${JSON.stringify(types)},
  "keywords": ["extracted", "search", "terms"],
  "category": "Music|Food|Sports|Arts|Family|Outdoor|Nightlife|etc or null",
  "cuisine": "Italian|Mexican|American|etc or null",
  "location": "specific location mentioned or null",
  "neighborhood": "recognized neighborhood or null",
  "nearDowntown": true/false,
  "dateFilter": "today|tomorrow|this_weekend|this_week|next_week|specific|null",
  "specificDate": "YYYY-MM-DD if mentioned or null",
  "timeOfDay": "morning|afternoon|evening|night|null",
  "priceRange": "free|cheap|moderate|expensive|any",
  "maxBudget": number or null,
  "familyFriendly": true/false/null,
  "kidFriendly": true/false/null,
  "dateFriendly": true/false/null,
  "groupFriendly": true/false/null,
  "petFriendly": true/false/null,
  "outdoorSeating": true/false/null,
  "liveMusic": true/false/null,
  "parking": true/false/null,
  "dietary": ["vegan", "gluten-free", etc] or [],
  "sortBy": "relevance|date|rating|price|distance",
  "confidence": 0.0-1.0
}

Return ONLY the JSON object, no other text.`;
}

class AiFailure extends Error {
  constructor(readonly code: DegradedCode, detail: string) {
    super(detail);
  }
}

/**
 * One model call under a hard deadline. Throws AiFailure on a timeout, a
 * non-OK status, an unusable body or unparseable JSON; the caller degrades.
 */
async function parseWithModel(
  deps: SearchDeps,
  query: string,
  types: ContentType[],
): Promise<{ intent: ParsedSearchIntent; model: string }> {
  const timeoutMs = deps.aiTimeoutMs ?? AI_TIMEOUT_MS;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AiFailure("ai_timeout", `model did not answer in ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const attempt = (async () => {
    const setup = await deps.loadAi(buildPrompt(query, types, deps.now()));
    if (!setup) throw new AiFailure("ai_unavailable", "no Anthropic key configured");
    const res = await deps.fetch(setup.endpoint, {
      method: "POST",
      headers: setup.headers,
      body: JSON.stringify(setup.body),
      signal: controller.signal,
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new AiFailure("ai_unavailable", `model answered ${res.status}`);
    }
    const extracted = setup.extractText(await res.json());
    if (!extracted.ok) throw new AiFailure("ai_unavailable", `model response ${extracted.reason}`);
    const match = extracted.text.match(/\{[\s\S]*\}/);
    if (!match) throw new AiFailure("ai_unavailable", "no JSON in model response");
    let raw: unknown;
    try {
      raw = JSON.parse(match[0]);
    } catch {
      throw new AiFailure("ai_unavailable", "model JSON did not parse");
    }
    return { intent: coerceIntent(raw, types, query), model: setup.model };
  })();

  try {
    return await Promise.race([attempt, deadline]);
  } catch (err) {
    if (err instanceof AiFailure) throw err;
    if (controller.signal.aborted) throw new AiFailure("ai_timeout", "model call aborted");
    throw new AiFailure("ai_unavailable", err instanceof Error ? err.name : "unknown");
  } finally {
    clearTimeout(timer);
    // The losing promise must not surface as an unhandled rejection.
    attempt.catch(() => {});
    deadline.catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Query planning
// ---------------------------------------------------------------------------

type Apply = (q: QueryBuilder) => QueryBuilder;

/** A predicate plus, when it narrows by something the reader asked for, its chip. */
interface Facet {
  key: Exclude<AppliedFilterKey, "type" | "keywords">;
  label: string;
  apply: Apply;
}

interface TypePlan {
  type: ContentType;
  table: string;
  columns: string;
  /** Visibility and ordering: always applied, never labelled. */
  base: Apply;
  facets: Facet[];
  /** Full-text predicate, or null when the table has no search_vector. */
  fts: ((text: string) => Apply) | null;
  /** Columns each token must hit at least one of (ILIKE, ANDed across tokens). */
  tokenColumns: string[];
}

export interface SearchPlan {
  intent: ParsedSearchIntent;
  requestedTypes: ContentType[];
  types: TypePlan[];
  tokens: string[];
  ftsText: string;
  keywordLabel: string;
  unapplied: string[];
}

function priceLabel(p: ParsedSearchIntent["priceRange"]): string {
  switch (p) {
    case "free": return "Free";
    case "cheap": return "$ to $$";
    case "moderate": return "$$ to $$$";
    case "expensive": return "$$$ to $$$$";
    default: return "";
  }
}

function whenLabel(intent: ParsedSearchIntent): string {
  if (intent.dateFilter === "specific" && intent.specificDate) {
    const d = new Date(`${intent.specificDate}T12:00:00Z`);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  }
  return intent.dateFilter && intent.dateFilter !== "specific" ? WHEN_LABELS[intent.dateFilter] : "";
}

const RESTAURANT_PRICE_BANDS: Partial<Record<NonNullable<ParsedSearchIntent["priceRange"]>, string[]>> = {
  cheap: ["$", "$$"],
  moderate: ["$$", "$$$"],
  expensive: ["$$$", "$$$$"],
};

/**
 * Decide every predicate before any query runs. Each chip label is built in
 * the same object as the call that applies it, so a label cannot exist
 * without its predicate.
 */
export function planSearch(intent: ParsedSearchIntent, requestedTypes: ContentType[], now: Date): SearchPlan {
  const trusted = intent.confidence >= FACET_MIN_CONFIDENCE;
  const tokens = queryTokens(intent.keywords.join(" "))
    .map((t) => sanitizePostgrestPattern(t, 40))
    .filter((t) => t.length >= 2)
    .slice(0, MAX_TOKENS);
  const ftsText = tokens.map((t) => t.replace(/[^\p{L}\p{N}'-]+/gu, " ")).join(" ").replace(/\s+/g, " ").trim();

  const areaRaw = intent.neighborhood || intent.location;
  const area = trusted && areaRaw ? sanitizePostgrestPattern(areaRaw, 60) : "";
  const window = trusted && intent.dateFilter
    ? nlpDateWindow(intent.dateFilter, now, intent.specificDate)
    : null;
  const category = trusted && intent.category ? sanitizePostgrestPattern(intent.category, 60) : "";
  const cuisine = intent.cuisine ? sanitizePostgrestPattern(intent.cuisine, 60) : "";
  const fts = (text: string): Apply => (q) =>
    q.textSearch("search_vector", text, { type: "websearch", config: "english" });

  const plans: TypePlan[] = [];
  for (const type of intent.contentTypes) {
    const facets: Facet[] = [];
    if (type === "events") {
      if (window) {
        facets.push({ key: "when", label: whenLabel(intent), apply: (q) => q.gte("date", window.start).lte("date", window.end) });
      }
      if (category) {
        facets.push({ key: "category", label: intent.category as string, apply: (q) => q.ilike("category", `%${category}%`) });
      }
      if (area) {
        facets.push({ key: "area", label: areaRaw as string, apply: (q) => q.or(`location.ilike.%${area}%,venue.ilike.%${area}%`) });
      }
      if (intent.priceRange === "free") {
        facets.push({ key: "price", label: "Free", apply: (q) => q.or(FREE_PRICE_FILTER) });
      }
      plans.push({
        type,
        table: "events",
        columns: "*",
        // Same visibility predicate as the web app's applyEventVisibility():
        // the service-role key bypasses RLS, so this is the only thing hiding
        // merged, hidden and archived rows. Without a date window, today onward.
        base: (q) => {
          let b = q.neq("is_merged", true).neq("is_hidden", true).is("archived_at", null);
          if (!window) b = b.gte("date", centralTodayStartUtc(now));
          return b.order("date", { ascending: true }).limit(RESULT_LIMIT);
        },
        facets,
        fts,
        tokenColumns: ["title", "venue"],
      });
    } else if (type === "restaurants") {
      if (cuisine) {
        facets.push({ key: "cuisine", label: intent.cuisine as string, apply: (q) => q.ilike("cuisine", `%${cuisine}%`) });
      }
      if (area) {
        facets.push({ key: "area", label: areaRaw as string, apply: (q) => q.ilike("location", `%${area}%`) });
      }
      const band = intent.priceRange ? RESTAURANT_PRICE_BANDS[intent.priceRange] : undefined;
      if (band) {
        facets.push({ key: "price", label: priceLabel(intent.priceRange), apply: (q) => q.in("price_range", band) });
      }
      plans.push({
        type,
        table: "restaurants",
        columns: "*",
        // is_merged is NOT NULL DEFAULT false. status can be NULL, and a bare
        // neq('status','closed') would drop every NULL row too.
        base: (q) =>
          q.neq("is_merged", true)
            .or("status.is.null,status.neq.closed")
            .order("rating", { ascending: false, nullsFirst: false })
            .limit(RESULT_LIMIT),
        facets,
        fts,
        tokenColumns: ["name", "cuisine", "location"],
      });
    } else if (type === "attractions") {
      if (area) {
        facets.push({ key: "area", label: areaRaw as string, apply: (q) => q.ilike("location", `%${area}%`) });
      }
      if (intent.priceRange === "free") {
        facets.push({ key: "price", label: "Free", apply: (q) => q.eq("is_free", true) });
      }
      if (intent.kidFriendly) {
        facets.push({ key: "kid", label: "Kid-friendly", apply: (q) => q.eq("is_kid_friendly", true) });
      }
      plans.push({
        type,
        table: "attractions",
        columns: "*",
        base: (q) => q.eq("is_active", true).order("name", { ascending: true }).limit(RESULT_LIMIT),
        facets,
        fts: null,
        // Same columns as attractionSearchFilter (src/hooks/useAttractions.ts).
        // The table has `type`, not the column the old code filtered on.
        tokenColumns: ["name", "type", "location", "description"],
      });
    } else if (type === "hotels") {
      if (area) {
        facets.push({ key: "area", label: areaRaw as string, apply: (q) => q.or(`area.ilike.%${area}%,city.ilike.%${area}%`) });
      }
      plans.push({
        type,
        table: "hotels",
        columns: HOTEL_COLUMNS,
        base: (q) => q.eq("is_active", true).order("name", { ascending: true }).limit(RESULT_LIMIT),
        facets,
        fts: null,
        tokenColumns: ["name", "area", "short_description"],
      });
    }
  }

  // Parsed but not turned into SQL anywhere. The page prints these as
  // "Not filtered: ...", so none of them may also appear as a chip.
  const applies = (key: Facet["key"]) => plans.some((p) => p.facets.some((f) => f.key === key));
  const unapplied: string[] = [];
  const add = (label: string | undefined) => {
    if (label && !unapplied.includes(label)) unapplied.push(label);
  };
  if (intent.dateFilter && !applies("when")) add(whenLabel(intent) || intent.dateFilter.replace(/_/g, " "));
  if (intent.timeOfDay) add(intent.timeOfDay);
  if (areaRaw && !applies("area")) add(areaRaw);
  if (intent.nearDowntown) add("near downtown");
  if (intent.category && !applies("category")) add(intent.category);
  if (intent.cuisine && !applies("cuisine")) add(intent.cuisine);
  if (intent.priceRange && intent.priceRange !== "any" && !applies("price")) add(priceLabel(intent.priceRange));
  if (intent.maxBudget) add(`under $${intent.maxBudget}`);
  if (intent.kidFriendly && !applies("kid")) add("kid-friendly");
  if (intent.familyFriendly) add("family-friendly");
  if (intent.dateFriendly) add("date night");
  if (intent.groupFriendly) add("groups");
  if (intent.petFriendly) add("pet-friendly");
  if (intent.outdoorSeating) add("outdoor seating");
  if (intent.liveMusic) add("live music");
  if (intent.parking) add("parking");
  for (const d of intent.dietary ?? []) add(d);

  // A parsed flag the keywords already search for is not "unfiltered".
  const keywordText = ` ${tokens.join(" ")} `;
  const covered = (label: string) => {
    const words = queryTokens(label);
    return words.length > 0 && words.every((w) => keywordText.includes(` ${w} `));
  };

  return {
    intent,
    requestedTypes,
    types: plans,
    tokens,
    ftsText,
    keywordLabel: tokens.length > 0 ? `"${tokens.join(" ")}"` : "",
    unapplied: unapplied.filter((l) => !covered(l)),
  };
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export interface SearchOutcome {
  results: Partial<Record<ContentType, unknown[]>>;
  appliedFilters: AppliedFilter[];
  unappliedFilters: string[];
  errors: Partial<Record<ContentType, string>>;
  unparsed: boolean;
}

function tokenPredicates(columns: string[], tokens: string[]): Apply {
  return (q) => tokens.reduce((b, t) => b.or(columns.map((c) => `${c}.ilike.%${t}%`).join(",")), q);
}

async function runType(
  client: SearchClient,
  plan: SearchPlan,
  tp: TypePlan,
): Promise<{ rows: unknown[]; error?: string }> {
  const build = (keyword: Apply | null) => {
    let q = tp.base(client.from(tp.table).select(tp.columns));
    for (const f of tp.facets) q = f.apply(q);
    return keyword ? keyword(q) : q;
  };

  const hasKeywords = plan.tokens.length > 0;
  if (hasKeywords && tp.fts && plan.ftsText) {
    const first = await build(tp.fts(plan.ftsText));
    if (first.error) {
      console.warn(`nlp-search: ${tp.type} full-text query failed (${first.error.code ?? "no code"}), trying ILIKE`);
    } else if (first.data && first.data.length > 0) {
      return { rows: first.data };
    }
  }
  const { data, error } = await build(hasKeywords ? tokenPredicates(tp.tokenColumns, plan.tokens) : null);
  if (error) {
    console.warn(`nlp-search: ${tp.type} query failed (${error.code ?? "no code"})`);
    return { rows: [], error: "query_failed" };
  }
  return { rows: data ?? [] };
}

/**
 * Run the plan. A type with no narrowing predicate (no keywords and no facet)
 * is not queried: returning the next 20 rows of a table as "results" is what
 * this replaced.
 */
export async function executePlan(client: SearchClient, plan: SearchPlan): Promise<SearchOutcome> {
  const hasKeywords = plan.tokens.length > 0;
  const runnable = plan.types.filter((tp) => hasKeywords || tp.facets.length > 0);

  const settled = await Promise.all(runnable.map((tp) => runType(client, plan, tp)));

  // events, restaurants and attractions are always present, as they were
  // before; hotels only when the caller asked for them (additive key).
  const results: Partial<Record<ContentType, unknown[]>> = { events: [], restaurants: [], attractions: [] };
  if (plan.requestedTypes.includes("hotels")) results.hotels = [];
  const errors: Partial<Record<ContentType, string>> = {};
  const applied: AppliedFilter[] = [];
  const addApplied = (key: AppliedFilterKey, label: string, type: ContentType) => {
    const hit = applied.find((a) => a.key === key && a.label === label);
    if (hit) {
      if (!hit.types.includes(type)) hit.types.push(type);
    } else {
      applied.push({ key, label, types: [type] });
    }
  };

  const narrowed = plan.intent.contentTypes.length < plan.requestedTypes.length;
  runnable.forEach((tp, i) => {
    const out = settled[i];
    results[tp.type] = out.rows;
    if (out.error) errors[tp.type] = out.error;
    if (narrowed) addApplied("type", TYPE_LABELS[tp.type], tp.type);
    for (const f of tp.facets) addApplied(f.key, f.label, tp.type);
    if (hasKeywords) addApplied("keywords", plan.keywordLabel, tp.type);
  });

  return {
    results,
    appliedFilters: applied,
    unappliedFilters: plan.unapplied,
    errors,
    unparsed: runnable.length === 0,
  };
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function failure(code: ErrorCode, status: number, headers: Record<string, string>, error = "Search failed"): Response {
  return json({ success: false, error, code }, status, headers);
}

export async function handleSearch(req: Request, deps: SearchDeps): Promise<Response> {
  const preflight = deps.cors.preflight(req);
  if (preflight) return preflight;
  const headers = deps.cors.headers(req);
  const started = deps.now().getTime();

  try {
    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      body = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch {
      // A body that isn't JSON answered 500 before this file existed; the
      // status stays, the code says why.
      return failure("bad_request", 500, headers);
    }

    const query = typeof body.query === "string" ? normalizeQuery(body.query) : "";
    if (query.length < 3) {
      return failure("bad_request", 400, headers, "Query must be at least 3 characters");
    }
    const requestedTypes = coerceContentTypes(body.contentTypes);

    // Best-effort identity for rate-limit keying (falls back to IP).
    let userId: string | null = null;
    const auth = req.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      try {
        // An invalid or anon-key token is an expected error here, not a
        // failure: the rate limit keys by IP instead.
        const { data, error } = await deps.client.auth.getUser(auth.slice(7));
        userId = error ? null : (data.user?.id ?? null);
      } catch { /* anon key or invalid token: key by IP */ }
    }

    // COST GUARD: rate limit before any model call, including when the
    // caller supplies the intent.
    const limited = await deps.rateLimit(req, userId);
    if (limited) return limited;

    let intent: ParsedSearchIntent;
    let degraded = false;
    let degradedCode: DegradedCode | undefined;
    let modelUsed: string | null = null;
    let source: "given" | "model" | "fallback";

    if (body.intent && typeof body.intent === "object") {
      intent = coerceIntent(body.intent, requestedTypes, query);
      source = "given";
    } else {
      try {
        const parsed = await parseWithModel(deps, query, requestedTypes);
        intent = parsed.intent;
        modelUsed = parsed.model;
        source = "model";
      } catch (err) {
        degradedCode = err instanceof AiFailure ? err.code : "ai_unavailable";
        console.warn(`nlp-search: model unavailable (${degradedCode}), keyword search instead`);
        intent = { ...coerceIntent({}, requestedTypes, query), confidence: 0 };
        degraded = true;
        source = "fallback";
      }
    }

    const plan = planSearch(intent, requestedTypes, deps.now());
    const outcome = await executePlan(deps.client, plan);

    const total = Object.values(outcome.results).reduce((n, rows) => n + (rows?.length ?? 0), 0);
    const matchType: MatchType = !degraded && intent.confidence >= FACET_MIN_CONFIDENCE && !outcome.unparsed
      ? "understood"
      : "keyword";
    const responseTimeMs = deps.now().getTime() - started;

    // Analytics never decides the response. The postgrest builder has no
    // .catch (only then), which is what used to turn every search into a 500.
    const logAnalytics = async () => {
      try {
        const { error: logErr } = await deps.client.from("search_analytics").insert({
          user_id: userId,
          search_query: query,
          results_count: total,
          // search_analytics has no nlp_parsed / model_used / response_time_ms
          // columns; they live in search_filters (jsonb).
          search_filters: {
            type: "nlp",
            source,
            matchType,
            degraded,
            contentTypes: intent.contentTypes,
            dateFilter: intent.dateFilter,
            priceRange: intent.priceRange,
            location: intent.location,
            appliedFilters: outcome.appliedFilters.map((f) => f.key),
            nlpParsed: intent,
            modelUsed,
            responseTimeMs,
          },
        });
        if (logErr) console.warn(`nlp-search: analytics insert failed (${logErr.code ?? "no code"})`);
      } catch (err) {
        console.warn("nlp-search: analytics insert threw", err instanceof Error ? err.name : "unknown");
      }
    };
    if (deps.waitUntil) deps.waitUntil(logAnalytics());
    else await logAnalytics();

    console.log(
      `nlp-search: ${query.length}-char query, ${source}, ${matchType}, ${total} results in ${responseTimeMs}ms`,
    );

    const response: Record<string, unknown> = {
      success: true,
      query,
      parsedIntent: intent,
      results: outcome.results,
      appliedFilters: outcome.appliedFilters,
      unappliedFilters: outcome.unappliedFilters,
      matchType,
      metadata: {
        totalResults: total,
        responseTimeMs,
        modelUsed,
      },
    };
    if (degraded) {
      response.degraded = true;
      response.code = degradedCode;
    }
    if (outcome.unparsed) response.reason = "unparsed";
    if (Object.keys(outcome.errors).length > 0) response.errors = outcome.errors;

    return json(response, 200, headers);
  } catch (err) {
    console.error("nlp-search: unhandled error", err instanceof Error ? err.name : "unknown");
    return failure("internal", 500, headers);
  }
}
