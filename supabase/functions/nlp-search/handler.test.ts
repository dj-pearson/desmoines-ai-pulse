// Run with: deno test supabase/functions/nlp-search/handler.test.ts
// Offline. handleSearch gets a stub Supabase client whose builders are
// thenables with `then` and no `catch` (the postgrest-js 2.116 shape that
// turned every search into a 500) and a stubbed Claude fetch.
import {
  type AiSetup,
  handleSearch,
  type PgError,
  type QueryBuilder,
  type QueryResult,
  type SearchClient,
  type SearchDeps,
} from "./search.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
}

interface Chain {
  table: string;
  calls: { method: string; args: unknown[] }[];
}

function stubClient(rows: (chain: Chain) => QueryResult = (c) => ({ data: [{ id: `${c.table}-1` }], error: null })) {
  const chains: Chain[] = [];
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
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
              return Promise.resolve(rows(chain)).then(onFulfilled, onRejected);
            },
          };
          return b;
        },
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row });
          // then only. Calling .catch on this is a TypeError, as in production.
          return {
            then(onFulfilled, onRejected) {
              return Promise.resolve({ error: null as PgError | null }).then(onFulfilled, onRejected);
            },
          };
        },
      };
    },
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
  };
  return { client, chains, inserts };
}

function claudeBody(intent: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({ content: [{ type: "text", text: JSON.stringify(intent) }], stop_reason: "end_turn" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const extractText: AiSetup["extractText"] = (json) => {
  const r = json as { content?: { type?: string; text?: string }[] };
  const t = r.content?.find((b) => b.type === "text")?.text;
  return t ? { ok: true, text: t } : { ok: false, reason: "empty", detail: "no text" };
};

interface Harness {
  deps: SearchDeps;
  chains: Chain[];
  inserts: { table: string; row: Record<string, unknown> }[];
  prompts: string[];
  fetchCalls: number;
}

function harness(opts: {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  rows?: (chain: Chain) => QueryResult;
  rateLimited?: boolean;
  aiTimeoutMs?: number;
  waitUntil?: (p: Promise<unknown>) => void;
} = {}): Harness {
  const { client, chains, inserts } = stubClient(opts.rows);
  const h: Harness = { deps: undefined as unknown as SearchDeps, chains, inserts, prompts: [], fetchCalls: 0 };
  const f = opts.fetch ??
    (() => Promise.resolve(claudeBody({ contentTypes: ["events"], keywords: ["jazz"], confidence: 0.9 })));
  h.deps = {
    client,
    fetch: (input, init) => {
      h.fetchCalls++;
      return f(input, init);
    },
    now: () => new Date("2026-09-25T02:00:00Z"),
    cors: {
      preflight: (req) => (req.method === "OPTIONS" ? new Response(null, { status: 204 }) : null),
      headers: () => ({ "Access-Control-Allow-Origin": "https://example.test" }),
    },
    rateLimit: () =>
      Promise.resolve(opts.rateLimited ? new Response(JSON.stringify({ error: "slow down" }), { status: 429 }) : null),
    loadAi: (prompt) => {
      h.prompts.push(prompt);
      return Promise.resolve({ endpoint: "https://claude.test/v1/messages", headers: {}, model: "haiku-test", body: {}, extractText });
    },
    aiTimeoutMs: opts.aiTimeoutMs ?? 1_000,
    waitUntil: opts.waitUntil,
  };
  return h;
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://fn.test/nlp-search", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

Deno.test("a parse with a catch-less insert builder answers 200 and logs once", async () => {
  const h = harness();
  const res = await handleSearch(post({ query: "jazz tonight" }), h.deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.matchType, "understood");
  assertEquals(body.results.events.length, 1);
  assertEquals(h.inserts.length, 1);
  assertEquals(h.inserts[0].table, "search_analytics");
  assertEquals(h.inserts[0].row.user_id, null);
  assert(!("degraded" in body), "not degraded");
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://example.test");
});

Deno.test("the analytics insert goes to waitUntil when the runtime has it", async () => {
  const pending: Promise<unknown>[] = [];
  const h = harness({ waitUntil: (p) => pending.push(p) });
  const res = await handleSearch(post({ query: "jazz tonight" }, { Authorization: "Bearer jwt" }), h.deps);
  assertEquals(res.status, 200);
  assertEquals(pending.length, 1);
  await Promise.all(pending);
  assertEquals(h.inserts.length, 1);
  assertEquals(h.inserts[0].row.user_id, "user-1");
});

Deno.test("a request without hotels gets no results.hotels key", async () => {
  const h = harness();
  const body = await (await handleSearch(post({ query: "jazz tonight" }), h.deps)).json();
  assert(!("hotels" in body.results), "hotels key present without asking");
  assertEquals(Object.keys(body.results).sort(), ["attractions", "events", "restaurants"]);
  assert(!h.chains.some((c) => c.table === "hotels"), "hotels queried without asking");
});

Deno.test("a request with hotels queries active hotels and returns the key", async () => {
  const h = harness({
    fetch: () => Promise.resolve(claudeBody({ contentTypes: ["hotels"], keywords: ["suites"], confidence: 0.9 })),
  });
  const body = await (await handleSearch(post({ query: "suites downtown", contentTypes: ["events", "hotels"] }), h.deps))
    .json();
  assertEquals(body.results.hotels.length, 1);
  assert(h.prompts[0].includes("events, hotels"), "prompt should list the requested types");
  const hotels = h.chains.find((c) => c.table === "hotels");
  assert(hotels?.calls.some((c) => c.method === "eq" && c.args[0] === "is_active"), "hotels is_active");
});

Deno.test("a slow model degrades to keyword search with 200", async () => {
  const h = harness({
    aiTimeoutMs: 30,
    fetch: (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
  });
  const res = await handleSearch(post({ query: "jazz brunch this weekend" }), h.deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.degraded, true);
  assertEquals(body.code, "ai_timeout");
  assertEquals(body.matchType, "keyword");
  assertEquals(body.parsedIntent.keywords, ["jazz", "brunch"]);
  assertEquals(body.appliedFilters.map((f: { key: string }) => f.key), ["keywords"]);
});

Deno.test("a model error or unparseable reply degrades the same way", async () => {
  for (
    const reply of [
      () => new Response("overloaded", { status: 529 }),
      () => new Response(JSON.stringify({ content: [{ type: "text", text: "sorry, no JSON" }] }), { status: 200 }),
      () => new Response(JSON.stringify({ content: [] }), { status: 200 }),
    ]
  ) {
    const h = harness({ fetch: () => Promise.resolve(reply()) });
    const res = await handleSearch(post({ query: "jazz brunch" }), h.deps);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.degraded, true);
    assertEquals(body.code, "ai_unavailable");
    assertEquals(body.matchType, "keyword");
  }
});

Deno.test("no Anthropic key degrades instead of failing", async () => {
  const h = harness();
  h.deps.loadAi = () => Promise.resolve(null);
  const body = await (await handleSearch(post({ query: "jazz" }), h.deps)).json();
  assertEquals(body.success, true);
  assertEquals(body.degraded, true);
  assertEquals(h.fetchCalls, 0);
});

Deno.test("a supplied intent skips the model but not the rate limit", async () => {
  const h = harness();
  const intent = { contentTypes: ["events"], keywords: ["jazz"], priceRange: "free", confidence: 0.9 };
  const body = await (await handleSearch(post({ query: "free jazz", intent }), h.deps)).json();
  assertEquals(h.fetchCalls, 0);
  assertEquals(h.prompts.length, 0);
  assertEquals(body.matchType, "understood");
  assert(body.appliedFilters.some((f: { key: string }) => f.key === "price"), "price chip");

  const limited = harness({ rateLimited: true });
  const res = await handleSearch(post({ query: "free jazz", intent }), limited.deps);
  assertEquals(res.status, 429);
  assertEquals(limited.chains.length, 0);
});

Deno.test("a model reply without keywords does not throw", async () => {
  const h = harness({ fetch: () => Promise.resolve(claudeBody({ contentTypes: ["events"], confidence: 0.9 })) });
  const res = await handleSearch(post({ query: "trivia nights" }), h.deps);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).parsedIntent.keywords, ["trivia", "nights"]);
});

Deno.test("query is clamped and collapsed before the prompt and the log", async () => {
  const h = harness();
  const long = "jazz   \n  " + "a".repeat(400);
  await handleSearch(post({ query: long }), h.deps);
  const logged = h.inserts[0].row.search_query as string;
  assertEquals(logged.length, 200);
  assert(logged.startsWith("jazz a"), "whitespace collapsed");
  assert(h.prompts[0].includes(JSON.stringify(logged)), "prompt carries the clamped query");
});

Deno.test("bad input keeps its status codes and gains a code", async () => {
  const h = harness();
  const nonString = await handleSearch(post({ query: 42 }), h.deps);
  assertEquals(nonString.status, 400);
  assertEquals((await nonString.json()).code, "bad_request");

  const short = await handleSearch(post({ query: "  a  " }), h.deps);
  assertEquals(short.status, 400);
  await short.body?.cancel();

  const notJson = await handleSearch(post("{not json"), h.deps);
  assertEquals(notJson.status, 500);
  assertEquals(await notJson.json(), { success: false, error: "Search failed", code: "bad_request" });
});

Deno.test("an unexpected throw is a 500 with a code, not the message", async () => {
  const h = harness();
  h.deps.client = {
    ...h.deps.client,
    from: () => {
      throw new Error("secret internals");
    },
  };
  const res = await handleSearch(post({ query: "jazz" }), h.deps);
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { success: false, error: "Search failed", code: "internal" });
});

Deno.test("a query with nothing to search for says so", async () => {
  const h = harness({
    fetch: () => Promise.resolve(claudeBody({ contentTypes: ["events"], keywords: [], confidence: 0.9 })),
  });
  const body = await (await handleSearch(post({ query: "things to do" }), h.deps)).json();
  assertEquals(body.reason, "unparsed");
  assertEquals(body.matchType, "keyword");
  assertEquals(body.metadata.totalResults, 0);
  assertEquals(h.chains.length, 0);
});

Deno.test("OPTIONS is answered by the CORS preflight", async () => {
  const h = harness();
  const res = await handleSearch(new Request("https://fn.test/nlp-search", { method: "OPTIONS" }), h.deps);
  assertEquals(res.status, 204);
});
