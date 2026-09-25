// Run with: deno test --allow-read supabase/functions/nlp-search/search.test.ts
// Offline: search.ts imports nothing remote. --allow-read is for the two
// files under src/ this suite compares against.
import {
  type AppliedFilter,
  type AppliedFilterKey,
  coerceIntent,
  type ContentType,
  executePlan,
  FREE_PRICE_FILTER,
  HOTEL_COLUMNS,
  normalizeQuery,
  type PgError,
  planSearch,
  type QueryBuilder,
  type QueryResult,
  queryTokens,
  type SearchClient,
} from "./search.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
}

// ---------------------------------------------------------------------------
// Recording stub. Builders are thenables with `then` and no `catch`, the same
// shape as postgrest-js 2.116.
// ---------------------------------------------------------------------------

interface Call {
  method: string;
  args: unknown[];
}
interface Chain {
  table: string;
  calls: Call[];
}

type RowsFor = (chain: Chain) => QueryResult;

function recordingClient(rowsFor: RowsFor = (c) => ({ data: [{ id: `${c.table}-1` }], error: null })) {
  const chains: Chain[] = [];
  const client: SearchClient = {
    from(table: string) {
      return {
        select(columns: string): QueryBuilder {
          const chain: Chain = { table, calls: [{ method: "select", args: [columns] }] };
          chains.push(chain);
          const rec = (method: string, args: unknown[]): QueryBuilder => {
            chain.calls.push({ method, args });
            return b;
          };
          const b: QueryBuilder = {
            eq: (...a) => rec("eq", a),
            neq: (...a) => rec("neq", a),
            is: (...a) => rec("is", a),
            in: (...a) => rec("in", a),
            gte: (...a) => rec("gte", a),
            lte: (...a) => rec("lte", a),
            ilike: (...a) => rec("ilike", a),
            or: (...a) => rec("or", a),
            textSearch: (...a) => rec("textSearch", a),
            order: (...a) => rec("order", a),
            limit: (...a) => rec("limit", a),
            then(onFulfilled, onRejected) {
              return Promise.resolve(rowsFor(chain)).then(onFulfilled, onRejected);
            },
          };
          return b;
        },
        insert() {
          return {
            then(onFulfilled, onRejected) {
              return Promise.resolve({ error: null as PgError | null }).then(onFulfilled, onRejected);
            },
          };
        },
      };
    },
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  };
  return { client, chains };
}

const has = (chain: Chain, method: string, pred: (args: unknown[]) => boolean = () => true) =>
  chain.calls.some((c) => c.method === method && pred(c.args));

// Thursday Sep 24 2026, 9:00 PM CDT.
const NOW = new Date("2026-09-25T02:00:00Z");
const ALL: ContentType[] = ["events", "restaurants", "attractions"];

// ---------------------------------------------------------------------------
// Drift guards
// ---------------------------------------------------------------------------

Deno.test("FREE_PRICE_FILTER is the same string as src/lib/eventPrice.ts", async () => {
  const src = await Deno.readTextFile(new URL("../../../src/lib/eventPrice.ts", import.meta.url));
  const m = src.match(/export const FREE_PRICE_FILTER\s*=\s*"([^"]+)"/);
  assert(m, "FREE_PRICE_FILTER not found in eventPrice.ts");
  assertEquals(FREE_PRICE_FILTER, m[1]);
  assert(!FREE_PRICE_FILTER.includes("is.null"), "a missing price is not free");
});

Deno.test("no attraction filter names the column attractions does not have", async () => {
  const bad = new RegExp("category" + "\\.ilike");
  for await (const entry of Deno.readDir(new URL(".", import.meta.url))) {
    if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
    const text = await Deno.readTextFile(new URL(entry.name, import.meta.url));
    assert(!bad.test(text), `${entry.name} still filters on it`);
  }
});

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

Deno.test("normalizeQuery collapses whitespace and clamps to 200", () => {
  assertEquals(normalizeQuery("  live \n\t music  "), "live music");
  assertEquals(normalizeQuery("x".repeat(500)).length, 200);
});

Deno.test("queryTokens drops filler, dates and type words", () => {
  assertEquals(queryTokens("Free things to do this weekend with kids"), ["free", "kids"]);
  assertEquals(queryTokens("Live music events tonight!"), ["live", "music"]);
  assertEquals(queryTokens("under $50"), []);
});

Deno.test("coerceIntent keeps known values only and defaults keywords from the query", () => {
  const i = coerceIntent(
    {
      contentTypes: ["events", "casinos"],
      dateFilter: "someday",
      priceRange: "free",
      timeOfDay: "brunch",
      category: "null",
      confidence: 7,
      kidFriendly: "yes",
      petFriendly: true,
    },
    ALL,
    "jazz brunch downtown",
  );
  assertEquals(i.contentTypes, ["events"]);
  assertEquals(i.keywords, ["jazz", "brunch", "downtown"]);
  assertEquals(i.dateFilter, undefined);
  assertEquals(i.timeOfDay, undefined);
  assertEquals(i.priceRange, "free");
  assertEquals(i.category, undefined);
  assertEquals(i.confidence, 1);
  assertEquals(i.kidFriendly, undefined);
  assertEquals(i.petFriendly, true);
  assertEquals(i.originalQuery, "jazz brunch downtown");
});

Deno.test("coerceIntent falls back to the requested types when the model names none of them", () => {
  assertEquals(coerceIntent({ contentTypes: ["hotels"] }, ALL, "abc").contentTypes, ALL);
  assertEquals(coerceIntent("not an object", ALL, "abc").contentTypes, ALL);
  assertEquals(coerceIntent({ confidence: -3 }, ALL, "abc").confidence, 0);
  // An explicit empty keyword list is kept: the model said "no subject words".
  assertEquals(coerceIntent({ keywords: [] }, ALL, "free events").keywords, []);
});

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

Deno.test("low confidence keeps the text predicate and drops only the facets", async () => {
  const intent = coerceIntent(
    { contentTypes: ["events"], keywords: ["jazz"], confidence: 0.2, category: "Music", dateFilter: "today", location: "Ingersoll" },
    ALL,
    "jazz",
  );
  const { client, chains } = recordingClient();
  const out = await executePlan(client, planSearch(intent, ALL, NOW));
  const events = chains.filter((c) => c.table === "events");
  assertEquals(events.length, 1);
  assert(has(events[0], "textSearch", (a) => a[0] === "search_vector" && a[1] === "jazz"), "text predicate missing");
  assert(!has(events[0], "ilike", (a) => a[0] === "category"), "category applied at low confidence");
  assert(!has(events[0], "lte", (a) => a[0] === "date"), "date window applied at low confidence");
  const keys = out.appliedFilters.map((f) => f.key);
  assert(keys.includes("keywords"), "keywords chip missing");
  for (const k of ["when", "category", "area"] as const) assert(!keys.includes(k), `${k} chip at low confidence`);
  for (const l of ["Today", "Music", "Ingersoll"]) {
    assert(out.unappliedFilters.includes(l), `${l} should be reported as not filtered`);
  }
});

Deno.test("full-text miss falls back to ILIKE per token, ANDed", async () => {
  const intent = coerceIntent({ contentTypes: ["events"], keywords: ["jazz brunch"], confidence: 0.9 }, ALL, "jazz brunch");
  const { client, chains } = recordingClient((c) =>
    has(c, "textSearch") ? { data: [], error: null } : { data: [{ id: "e1" }], error: null }
  );
  const out = await executePlan(client, planSearch(intent, ALL, NOW));
  assertEquals(chains.length, 2);
  const fallback = chains[1];
  const ors = fallback.calls.filter((c) => c.method === "or").map((c) => c.args[0]);
  assert(ors.includes("title.ilike.%jazz%,venue.ilike.%jazz%"), "jazz token missing");
  assert(ors.includes("title.ilike.%brunch%,venue.ilike.%brunch%"), "brunch token missing");
  assertEquals((out.results.events ?? []).length, 1);
});

Deno.test("no keywords and no facets returns nothing, and queries nothing", async () => {
  const intent = coerceIntent({ keywords: [], confidence: 0.9 }, ALL, "stuff");
  const { client, chains } = recordingClient();
  const out = await executePlan(client, planSearch(intent, ALL, NOW));
  assertEquals(chains.length, 0);
  assert(out.unparsed, "should be unparsed");
  assertEquals(out.results, { events: [], restaurants: [], attractions: [] });
});

Deno.test("visibility predicates on every type", async () => {
  const types: ContentType[] = ["events", "restaurants", "attractions", "hotels"];
  const intent = coerceIntent({ keywords: ["pizza"], confidence: 0.9 }, types, "pizza");
  const { client, chains } = recordingClient();
  await executePlan(client, planSearch(intent, types, NOW));
  const by = (t: string) => chains.find((c) => c.table === t) as Chain;
  assert(has(by("events"), "neq", (a) => a[0] === "is_merged"), "events is_merged");
  assert(has(by("events"), "neq", (a) => a[0] === "is_hidden"), "events is_hidden");
  assert(has(by("events"), "is", (a) => a[0] === "archived_at"), "events archived_at");
  assert(has(by("restaurants"), "neq", (a) => a[0] === "is_merged" && a[1] === true), "restaurants is_merged");
  assert(has(by("restaurants"), "or", (a) => a[0] === "status.is.null,status.neq.closed"), "restaurants status keeps NULL");
  assert(has(by("attractions"), "eq", (a) => a[0] === "is_active" && a[1] === true), "attractions is_active");
  assert(has(by("hotels"), "eq", (a) => a[0] === "is_active" && a[1] === true), "hotels is_active");
  assert(has(by("hotels"), "select", (a) => a[0] === HOTEL_COLUMNS), "hotel projection");
  const attractionOr = by("attractions").calls.find((c) => c.method === "or")?.args[0] as string;
  assertEquals(attractionOr, "name.ilike.%pizza%,type.ilike.%pizza%,location.ilike.%pizza%,description.ilike.%pizza%");
});

Deno.test("a failed type reports a fixed code and does not sink the others", async () => {
  const intent = coerceIntent({ keywords: ["pizza"], confidence: 0.9 }, ALL, "pizza");
  const { client } = recordingClient((c) =>
    c.table === "attractions"
      ? { data: null, error: { code: "42703", message: "column does not exist" } }
      : { data: [{ id: "x" }], error: null }
  );
  const out = await executePlan(client, planSearch(intent, ALL, NOW));
  assertEquals(out.errors, { attractions: "query_failed" });
  assertEquals((out.results.restaurants ?? []).length, 1);
  assertEquals(out.results.attractions, []);
});

Deno.test("free and kid-friendly reach attractions as columns", async () => {
  const intent = coerceIntent(
    { contentTypes: ["events", "attractions"], keywords: [], priceRange: "free", kidFriendly: true, confidence: 0.9 },
    ALL,
    "free with kids",
  );
  const { client, chains } = recordingClient();
  const out = await executePlan(client, planSearch(intent, ALL, NOW));
  const attractions = chains.find((c) => c.table === "attractions") as Chain;
  const events = chains.find((c) => c.table === "events") as Chain;
  assert(has(attractions, "eq", (a) => a[0] === "is_free" && a[1] === true), "is_free");
  assert(has(attractions, "eq", (a) => a[0] === "is_kid_friendly" && a[1] === true), "is_kid_friendly");
  assert(has(events, "or", (a) => a[0] === FREE_PRICE_FILTER), "events free filter");
  const free = out.appliedFilters.find((f) => f.key === "price") as AppliedFilter;
  assertEquals(free.types, ["events", "attractions"]);
  assert(!out.unappliedFilters.includes("kid-friendly"), "kid-friendly was applied");
});

// ---------------------------------------------------------------------------
// appliedFilters never names a filter without a predicate
// ---------------------------------------------------------------------------

// One canned parse per NLP_SEARCH_EXAMPLES entry, shaped like what the model
// returns. A new example without an entry here fails the next test.
const CANNED: Record<string, Record<string, unknown>> = {
  "Family dinner under $50 near downtown Saturday": {
    contentTypes: ["restaurants"], keywords: ["dinner"], familyFriendly: true, nearDowntown: true,
    maxBudget: 50, dateFilter: "specific", specificDate: "2026-09-26", confidence: 0.8,
  },
  "Free things to do this weekend with kids": {
    contentTypes: ["events", "attractions"], keywords: [], priceRange: "free", dateFilter: "this_weekend",
    kidFriendly: true, confidence: 0.9,
  },
  "Best brunch spots with outdoor seating": {
    contentTypes: ["restaurants"], keywords: ["brunch"], outdoorSeating: true, confidence: 0.85,
  },
  "Live music events tonight": {
    contentTypes: ["events"], keywords: ["live music"], liveMusic: true, category: "Music",
    dateFilter: "today", timeOfDay: "night", confidence: 0.9,
  },
  "Romantic dinner date in East Village": {
    contentTypes: ["restaurants"], keywords: ["romantic", "dinner"], dateFriendly: true,
    neighborhood: "East Village", priceRange: "moderate", confidence: 0.8,
  },
  "Dog-friendly restaurants": {
    contentTypes: ["restaurants"], keywords: ["dog-friendly"], petFriendly: true, confidence: 0.7,
  },
  "Things to do tomorrow afternoon": {
    contentTypes: ["events", "attractions"], keywords: [], dateFilter: "tomorrow", timeOfDay: "afternoon",
    confidence: 0.7,
  },
  "Italian food near me": {
    contentTypes: ["restaurants"], keywords: ["italian"], cuisine: "Italian", confidence: 0.8,
  },
  "Kid-friendly attractions": {
    contentTypes: ["attractions"], keywords: [], kidFriendly: true, confidence: 0.9,
  },
  "Events this week under $20": {
    contentTypes: ["events"], keywords: [], dateFilter: "this_week", maxBudget: 20, priceRange: "cheap",
    confidence: 0.8,
  },
};

const TABLE: Record<ContentType, string> = {
  events: "events", restaurants: "restaurants", attractions: "attractions", hotels: "hotels",
};

/** Does this chain carry a predicate that implements this chip? */
const PREDICATE: Record<AppliedFilterKey, (chain: Chain, f: AppliedFilter, tokens: string[]) => boolean> = {
  type: (chain) => has(chain, "select"),
  when: (chain) => has(chain, "gte", (a) => a[0] === "date") && has(chain, "lte", (a) => a[0] === "date"),
  price: (chain) =>
    has(chain, "or", (a) => a[0] === FREE_PRICE_FILTER) ||
    has(chain, "in", (a) => a[0] === "price_range") ||
    has(chain, "eq", (a) => a[0] === "is_free" && a[1] === true),
  area: (chain, f) => {
    const needle = `%${f.label}%`;
    return has(chain, "ilike", (a) => a[0] === "location" && a[1] === needle) ||
      has(chain, "or", (a) => typeof a[0] === "string" && a[0].includes(`.ilike.${needle}`));
  },
  cuisine: (chain, f) => has(chain, "ilike", (a) => a[0] === "cuisine" && a[1] === `%${f.label}%`),
  category: (chain, f) => has(chain, "ilike", (a) => a[0] === "category" && a[1] === `%${f.label}%`),
  kid: (chain) => has(chain, "eq", (a) => a[0] === "is_kid_friendly" && a[1] === true),
  budget: () => false,
  keywords: (chain, _f, tokens) =>
    has(chain, "textSearch", (a) => a[1] === tokens.join(" ")) ||
    tokens.every((t) => has(chain, "or", (a) => typeof a[0] === "string" && a[0].includes(`.ilike.%${t}%`))),
};

Deno.test("every appliedFilters label for every example has its predicate in the recorded query", async () => {
  const src = await Deno.readTextFile(new URL("../../../src/hooks/useNLPSearch.ts", import.meta.url));
  const block = src.match(/export const NLP_SEARCH_EXAMPLES\s*=\s*\[([\s\S]*?)\];/);
  assert(block, "NLP_SEARCH_EXAMPLES not found");
  const examples = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert(examples.length >= 5, `only ${examples.length} examples parsed`);

  let checked = 0;
  for (const example of examples) {
    const canned = CANNED[example];
    assert(canned, `no canned intent for example "${example}"; add one to CANNED`);
    const intent = coerceIntent(canned, ALL, example);
    const plan = planSearch(intent, ALL, NOW);
    const { client, chains } = recordingClient();
    const out = await executePlan(client, plan);

    for (const f of out.appliedFilters) {
      for (const type of f.types) {
        const chain = chains.find((c) => c.table === TABLE[type]);
        assert(chain, `"${example}": chip ${f.key}:${f.label} names ${type}, which was never queried`);
        assert(
          PREDICATE[f.key](chain, f, plan.tokens),
          `"${example}": chip ${f.key}:${f.label} has no predicate on ${type}`,
        );
        checked++;
      }
    }
    // Nothing is both a chip and "not filtered".
    for (const label of out.unappliedFilters) {
      assert(!out.appliedFilters.some((f) => f.label === label), `"${example}": ${label} is both`);
    }
    // No type ran without a narrowing predicate.
    for (const chain of chains) {
      const narrowed = out.appliedFilters.some((f) => f.key !== "type" && f.types.some((t) => TABLE[t] === chain.table));
      assert(narrowed, `"${example}": ${chain.table} was queried with nothing narrowing it`);
    }
  }
  assert(checked > 10, `only ${checked} chip/type pairs checked`);
});

Deno.test("parsed flags with no predicate land in unappliedFilters", async () => {
  const intent = coerceIntent(CANNED["Family dinner under $50 near downtown Saturday"], ALL, "x");
  const { client } = recordingClient();
  const out = await executePlan(client, planSearch(intent, ALL, NOW));
  for (const l of ["family-friendly", "near downtown", "under $50", "Sat, Sep 26"]) {
    assert(out.unappliedFilters.includes(l), `missing ${l} in ${JSON.stringify(out.unappliedFilters)}`);
  }
  // "live music" is searched as keywords, so it is not reported as unfiltered.
  const live = coerceIntent(CANNED["Live music events tonight"], ALL, "x");
  const out2 = await executePlan(recordingClient().client, planSearch(live, ALL, NOW));
  assert(!out2.unappliedFilters.includes("live music"), "live music is covered by keywords");
  assert(out2.unappliedFilters.includes("night"), "time of day is not applied");
});
