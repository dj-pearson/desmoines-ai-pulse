#!/usr/bin/env tsx
/**
 * AI citation baseline (SEO-049).
 *
 * Reads the prompt table in docs/seo/ai-citation-prompts.md and, for each
 * prompt, records whether desmoinesinsider.com and catchdesmoines.com appear
 * among the sources an engine returns. Writes one CSV row per prompt x engine.
 *
 * Engines it runs itself:
 *   bing        Bing web results, top 10. Retrieval proxy: ChatGPT search and
 *               Copilot ground on Bing.
 *   duckduckgo  DuckDuckGo HTML results, top 10. Same proxy, mostly Bing-sourced.
 *   anthropic   claude-opus-5-5 with the web_search server tool. Records the
 *               URLs the answer actually cites. Needs ANTHROPIC_API_KEY (or
 *               CLAUDE_API_KEY) and @anthropic-ai/sdk installed; otherwise it
 *               writes "not run" rows with the reason.
 *
 * Engines that need a browser (Perplexity, Google AI Mode, ChatGPT, Gemini) are
 * written as "not run" rows. Pass --skip "engine:reason" to record why, then
 * fill the rows by hand after running the prompts in a browser.
 *
 * An engine stops at its first captcha or HTTP 429; the remaining prompts for
 * that engine become "not run". Nothing is retried around a block.
 *
 * Usage:
 *   npx tsx scripts/ai-citation-check.ts --out docs/seo/ai-citation-baseline-YYYY-MM.csv
 *     [--engines bing,duckduckgo,anthropic] [--skip "perplexity:no browser"]
 */
import { readFileSync, writeFileSync } from "node:fs";

const PROMPTS_FILE = "docs/seo/ai-citation-prompts.md";
const OUR_DOMAIN = "desmoinesinsider.com";
const CVB_DOMAIN = "catchdesmoines.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const DELAY_MS = 2000;
const MANUAL_ENGINES = ["perplexity", "google-ai-mode", "chatgpt", "gemini"];

interface Prompt {
  n: number;
  prompt: string;
  target: string;
}

interface Row {
  prompt: string;
  engine: string;
  date: string;
  cited_us: string;
  cited_catchdesmoines: string;
  other_sources: string;
  notes: string;
}

class BlockedError extends Error {}

function parseArgs(argv: string[]) {
  let out = "";
  let engines = ["bing", "duckduckgo", "anthropic"];
  const skips = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out = argv[++i];
    else if (a === "--engines") engines = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--skip") {
      const [engine, ...reason] = argv[++i].split(":");
      skips.set(engine.trim(), reason.join(":").trim());
    }
  }
  if (!out) throw new Error("--out <file.csv> is required");
  return { out, engines, skips };
}

function loadPrompts(): Prompt[] {
  const md = readFileSync(PROMPTS_FILE, "utf8");
  const prompts: Prompt[] = [];
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
    if (m) prompts.push({ n: Number(m[1]), prompt: m[2], target: m[3] });
  }
  if (prompts.length === 0) throw new Error(`no prompt rows found in ${PROMPTS_FILE}`);
  return prompts;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#x2F;/g, "/").replace(/&quot;/g, '"');
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US" } });
  const body = await res.text();
  if (res.status === 429 || /captcha|unusual traffic|anomaly-modal/i.test(body)) {
    throw new BlockedError(`HTTP ${res.status}, blocked or captcha page`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return body;
}

interface Hit {
  url: string;
  title: string;
}

const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, "")).trim();

async function bingHits(q: string): Promise<Hit[]> {
  const html = await fetchHtml(`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=en-US&cc=US`);
  const hits: Hit[] = [];
  for (const block of html.split('class="b_algo"').slice(1)) {
    const m = block.match(/<h2[^>]*>\s*<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (m) hits.push({ url: unwrapBing(decodeEntities(m[1])), title: stripTags(m[2]) });
  }
  return hits;
}

const STOPWORDS = new Set(["the", "in", "a", "an", "of", "to", "do", "is", "near", "with", "for", "this", "and", "now", "open", "best", "new", "things"]);

// A SERP counts as a measurement only if at least 3 results match 2+ of the
// query's content words in title or URL. Bing, scraped without cookies, often
// answers with dictionary/shopping results for a single word of the query
// ("contrary" -> merriam-webster). Logging those as "not cited" would be false.
function serpLooksValid(q: string, hits: Hit[]): boolean {
  const words = q
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const need = Math.min(2, words.length);
  const relevant = hits.filter((h) => {
    const hay = `${h.title} ${h.url}`.toLowerCase();
    return words.filter((w) => hay.includes(w)).length >= need;
  });
  return relevant.length >= 3;
}

// Bing wraps result links as bing.com/ck/a?...&u=a1<base64url of the real URL>.
function unwrapBing(href: string): string {
  const u = href.match(/[?&]u=a1([^&]+)/);
  if (!u) return href;
  try {
    return Buffer.from(u[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return href;
  }
}

async function ddgHits(q: string): Promise<Hit[]> {
  const html = await fetchHtml(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
  const hits: Hit[] = [];
  for (const m of html.matchAll(/class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const href = decodeEntities(m[1]);
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    const real = uddg ? decodeURIComponent(uddg[1]) : href;
    // Skip DuckDuckGo's own ad redirects.
    if (/duckduckgo\.com\/y\.js/.test(real)) continue;
    hits.push({ url: real, title: stripTags(m[2]) });
  }
  return hits;
}

interface AnthropicBlock {
  type: string;
  citations?: Array<{ url?: string }> | null;
}
interface AnthropicMessage {
  stop_reason: string | null;
  content: AnthropicBlock[];
}
interface AnthropicClient {
  beta: { messages: { create(params: Record<string, unknown>): Promise<AnthropicMessage> } };
}

async function makeAnthropic(): Promise<AnthropicClient | string> {
  const key = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!key) return "no ANTHROPIC_API_KEY or CLAUDE_API_KEY in environment";
  const specifier = "@anthropic-ai/sdk";
  try {
    const mod = (await import(specifier)) as { default: new (opts: { apiKey: string }) => AnthropicClient };
    return new mod.default({ apiKey: key });
  } catch {
    return "@anthropic-ai/sdk not installed (npm i -D @anthropic-ai/sdk)";
  }
}

async function anthropicUrls(client: AnthropicClient, q: string): Promise<string[]> {
  const messages: Array<Record<string, unknown>> = [{ role: "user", content: q }];
  const cited: string[] = [];
  for (let turn = 0; turn < 4; turn++) {
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
      messages,
    });
    for (const block of res.content) {
      if (block.type === "text" && block.citations) {
        for (const c of block.citations) if (c.url) cited.push(c.url);
      }
    }
    if (res.stop_reason === "refusal") throw new Error("refusal");
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  return [...new Set(cited)];
}

function rowFromUrls(p: Prompt, engine: string, date: string, urls: string[], extraNote: string): Row {
  const hosts = urls.map(hostOf);
  const usIdx = hosts.findIndex((h) => h === OUR_DOMAIN || h.endsWith(`.${OUR_DOMAIN}`));
  const cvbIdx = hosts.findIndex((h) => h === CVB_DOMAIN || h.endsWith(`.${CVB_DOMAIN}`));
  const others = [...new Set(hosts.filter((h) => h && h !== OUR_DOMAIN && h !== CVB_DOMAIN))];
  const notes: string[] = [];
  if (usIdx >= 0) {
    const ourPath = new URL(urls[usIdx]).pathname;
    notes.push(`us at #${usIdx + 1} (${ourPath})${ourPath === p.target ? "" : `, target ${p.target}`}`);
  } else notes.push(`target ${p.target} absent`);
  if (cvbIdx >= 0) notes.push(`catchdesmoines at #${cvbIdx + 1}`);
  notes.push(`${urls.length} sources`);
  if (extraNote) notes.push(extraNote);
  return {
    prompt: p.prompt,
    engine,
    date,
    cited_us: usIdx >= 0 ? "yes" : "no",
    cited_catchdesmoines: cvbIdx >= 0 ? "yes" : "no",
    other_sources: others.join(" "),
    notes: notes.join("; "),
  };
}

function notRun(p: Prompt, engine: string, date: string, reason: string): Row {
  return {
    prompt: p.prompt,
    engine,
    date,
    cited_us: "not run",
    cited_catchdesmoines: "not run",
    other_sources: "",
    notes: reason,
  };
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { out, engines, skips } = parseArgs(process.argv.slice(2));
  const prompts = loadPrompts();
  const date = new Date().toISOString().slice(0, 10);
  const rows: Row[] = [];

  for (const engine of engines) {
    if (skips.has(engine)) {
      for (const p of prompts) rows.push(notRun(p, engine, date, skips.get(engine) || "skipped"));
      continue;
    }
    let runner: ((q: string) => Promise<Hit[]>) | null = null;
    let label = engine;
    let note = "";
    if (engine === "bing") {
      runner = bingHits;
      label = "bing-top10-proxy";
      note = "SERP retrieval proxy, not an AI answer";
    } else if (engine === "duckduckgo") {
      runner = ddgHits;
      label = "duckduckgo-top10-proxy";
      note = "SERP retrieval proxy, not an AI answer";
    } else if (engine === "anthropic") {
      label = "anthropic-api-web-search";
      const client = await makeAnthropic();
      if (typeof client === "string") {
        for (const p of prompts) rows.push(notRun(p, label, date, client));
        continue;
      }
      runner = async (q) => (await anthropicUrls(client, q)).map((url) => ({ url, title: "" }));
      note = "URLs cited in the answer text";
    } else {
      throw new Error(`unknown engine ${engine}`);
    }

    let blocked = "";
    for (const p of prompts) {
      if (blocked) {
        rows.push(notRun(p, label, date, `engine blocked earlier in run: ${blocked}`));
        continue;
      }
      try {
        const isSerp = engine !== "anthropic";
        const hits = (await runner(p.prompt)).slice(0, isSerp ? 10 : undefined);
        const urls = hits.map((h) => h.url);
        if (isSerp && !serpLooksValid(p.prompt, hits)) {
          const row = notRun(p, label, date, "degraded SERP: results unrelated to the query (fewer than 3 match 2+ query words); not a measurement");
          row.other_sources = [...new Set(urls.map(hostOf))].join(" ");
          rows.push(row);
          process.stderr.write(`${label} #${p.n} degraded\n`);
        } else {
          rows.push(rowFromUrls(p, label, date, urls, note));
          process.stderr.write(`${label} #${p.n} ok (${urls.length})\n`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (err instanceof BlockedError) blocked = msg;
        rows.push(notRun(p, label, date, `error: ${msg}`));
      }
      await sleep(DELAY_MS);
    }
  }

  for (const engine of MANUAL_ENGINES) {
    if (engines.includes(engine)) continue;
    const reason = skips.get(engine) || "manual engine: run in a browser and fill this row";
    for (const p of prompts) rows.push(notRun(p, engine, date, reason));
  }
  for (const [engine, reason] of skips) {
    if (engines.includes(engine) || MANUAL_ENGINES.includes(engine)) continue;
    for (const p of prompts) rows.push(notRun(p, engine, date, reason));
  }

  const header: Array<keyof Row> = [
    "prompt",
    "engine",
    "date",
    "cited_us",
    "cited_catchdesmoines",
    "other_sources",
    "notes",
  ];
  const lines = [header.join(","), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(","))];
  writeFileSync(out, lines.join("\n") + "\n");

  const ran = rows.filter((r) => r.cited_us !== "not run");
  process.stdout.write(
    `${rows.length} cells, ${ran.length} ran, cited_us yes ${ran.filter((r) => r.cited_us === "yes").length}, ` +
      `catchdesmoines yes ${ran.filter((r) => r.cited_catchdesmoines === "yes").length}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
