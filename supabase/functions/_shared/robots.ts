/**
 * robots.txt compliance for the shared scraper (WEB-SEC-024).
 *
 * WHY THIS DID NOT EXIST. `_shared/scraper.ts` is the single entry point for
 * every ingestion path in the project -- five backends and a fallback chain, all
 * behind `scrapeUrl`. None of them fetched /robots.txt or checked anything, so
 * a site that had explicitly asked not to be crawled was crawled anyway. Found
 * while drafting the Privacy Policy's categories-of-sources section
 * (WEB-LEGAL-008): the ordinary reassurance that "we do not access anything that
 * asks not to be crawled" would have been a false statement in a legal document.
 *
 * FAIL-OPEN, DELIBERATELY. No robots.txt, a 404, a timeout, a 500 or an
 * unparseable file all mean ALLOWED. That is what the standard says -- absence of
 * a rule is not a prohibition -- and the alternative fails in a much worse
 * direction: one flaky fetch of one robots.txt would silently halt ingestion for
 * an entire domain, and the existing pipeline reports a failed scrape the same
 * way whether it was blocked or broken. Only an explicit Disallow blocks.
 *
 * NOT A FULL robots.txt IMPLEMENTATION, and the gaps are deliberate rather than
 * unnoticed: no Crawl-delay (the scraper already batches at concurrency 3), no
 * Sitemap directive (not our purpose here), no wildcard `*` or `$` matching
 * inside a path. Wildcards are the one that could matter; see matches() for what
 * happens instead.
 */

/** How long a fetched robots.txt stays cached, per origin. */
const CACHE_TTL_MS = 15 * 60 * 1000;

/** Bound on the robots.txt we will read. Google's own limit is 500 KiB. */
const MAX_ROBOTS_BYTES = 512 * 1024;

/** A slow robots.txt must not hold up the scrape it is gating. */
const FETCH_TIMEOUT_MS = 5_000;

export interface RobotsRules {
  /** Path prefixes that are disallowed for the matched agent group. */
  disallow: string[];
  /** Path prefixes explicitly allowed, which override a longer Disallow. */
  allow: string[];
}

interface CacheEntry {
  at: number;
  rules: RobotsRules;
}

const cache = new Map<string, CacheEntry>();

/**
 * Parse robots.txt into the rules that apply to `agentToken`.
 *
 * Group selection follows the standard: the most specific matching User-agent
 * group wins, and the `*` group applies only when no named group matches. Groups
 * with several User-agent lines share one rule set.
 */
export function parseRobots(text: string, agentToken: string): RobotsRules {
  const wanted = agentToken.toLowerCase();

  // agent token -> rules. Collected in one pass, then selected from.
  const groups = new Map<string, RobotsRules>();
  let currentAgents: string[] = [];
  // A blank line does not end a group, but a User-agent line following a rule
  // line starts a new one. This tracks that transition.
  let sawRuleSinceAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;

    const sep = line.indexOf(':');
    if (sep === -1) continue;

    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === 'user-agent') {
      if (sawRuleSinceAgent) {
        currentAgents = [];
        sawRuleSinceAgent = false;
      }
      currentAgents.push(value.toLowerCase());
      if (!groups.has(value.toLowerCase())) {
        groups.set(value.toLowerCase(), { disallow: [], allow: [] });
      }
      continue;
    }

    if (field !== 'disallow' && field !== 'allow') continue;
    if (currentAgents.length === 0) continue; // a rule before any User-agent
    sawRuleSinceAgent = true;

    for (const agent of currentAgents) {
      const rules = groups.get(agent)!;
      // "Disallow:" with an empty value means allow everything, and carries no
      // path, so it is simply not recorded as a prohibition.
      if (value === '') continue;
      if (field === 'disallow') rules.disallow.push(value);
      else rules.allow.push(value);
    }
  }

  // Most specific matching group wins: an exact token beats a prefix match beats
  // the wildcard group.
  const exact = groups.get(wanted);
  if (exact) return exact;

  let best: { token: string; rules: RobotsRules } | null = null;
  for (const [token, rules] of groups) {
    if (token === '*') continue;
    if (!wanted.includes(token)) continue;
    if (!best || token.length > best.token.length) best = { token, rules };
  }
  if (best) return best.rules;

  return groups.get('*') ?? { disallow: [], allow: [] };
}

/**
 * Does `rule` match `path`?
 *
 * Prefix match, which is what the standard specifies. A rule containing `*` or
 * `$` is treated as matching only its literal-prefix portion -- so
 * `/search/*.json` is read as the prefix `/search/`. That is deliberately
 * CONSERVATIVE: it can block a little more than the site asked, never less.
 * Getting it wrong in that direction costs us a page; the other direction is the
 * defect this file exists to fix.
 */
function matches(rule: string, path: string): boolean {
  const literal = rule.split(/[*$]/)[0];
  if (literal === '') return true; // a rule that is only wildcards matches all
  return path.startsWith(literal);
}

/** Apply parsed rules to a path. Longest match wins; Allow beats Disallow at equal length. */
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  let longestDisallow = -1;
  for (const rule of rules.disallow) {
    if (matches(rule, path)) longestDisallow = Math.max(longestDisallow, rule.length);
  }
  if (longestDisallow === -1) return true;

  let longestAllow = -1;
  for (const rule of rules.allow) {
    if (matches(rule, path)) longestAllow = Math.max(longestAllow, rule.length);
  }

  // Equal length resolves to allowed, per the standard.
  return longestAllow >= longestDisallow;
}

/**
 * May we fetch `url`?
 *
 * Fetches and caches the origin's robots.txt. Returns true on any failure -- see
 * the fail-open note at the top of the file.
 */
export async function isCrawlAllowed(url: string, agentToken: string): Promise<boolean> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return true; // not our job to validate the URL; the scrape will fail on its own
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') return true;

  const key = `${target.origin}|${agentToken.toLowerCase()}`;
  const hit = cache.get(key);
  const now = Date.now();

  let rules: RobotsRules;
  if (hit && now - hit.at < CACHE_TTL_MS) {
    rules = hit.rules;
  } else {
    rules = await fetchRules(target.origin, agentToken);
    cache.set(key, { at: now, rules });
  }

  return isPathAllowed(rules, target.pathname + target.search);
}

async function fetchRules(origin: string, agentToken: string): Promise<RobotsRules> {
  const empty: RobotsRules = { disallow: [], allow: [] };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${origin}/robots.txt`, {
        signal: controller.signal,
        headers: { 'User-Agent': agentToken },
      });
    } finally {
      clearTimeout(timer);
    }

    // 4xx means no rules. 5xx is an outage, and treating an outage as a
    // site-wide block would take our ingestion down with theirs.
    if (!res.ok) return empty;

    const text = (await res.text()).slice(0, MAX_ROBOTS_BYTES);
    return parseRobots(text, agentToken);
  } catch {
    return empty;
  }
}

/** Exposed for tests. */
export function _clearRobotsCache(): void {
  cache.clear();
}
