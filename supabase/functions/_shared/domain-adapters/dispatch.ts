/**
 * Adapter dispatch loop, split out from index.ts so it can be unit-tested
 * without pulling in every adapter (several import deno_dom's wasm build).
 */

import type { AdapterResult, DomainAdapter } from "./types.ts";

/**
 * Run every adapter that claims `url` + `category`, in order, until one returns
 * items. Returns null when none match or all come up empty.
 *
 * Trying ALL matching adapters (rather than only the first) is what lets a cheap
 * probe hand off to a broader strategy: a WordPress "The Events Calendar" REST
 * request that 404s because the site does not run the plugin must fall through
 * to the profile crawler, not abandon the site to the Claude path.
 */
export async function runAdapters(
  adapters: readonly DomainAdapter[],
  url: string,
  category: string,
): Promise<AdapterResult | null> {
  const candidates = adapters.filter(
    (a) => a.matches(url) && a.supports(category),
  );
  if (candidates.length === 0) return null;

  console.log(
    `🎯 ${candidates.length} domain adapter(s) matched: ${
      candidates.map((a) => a.name).join(", ")
    }`,
  );

  for (const adapter of candidates) {
    try {
      const result = await adapter.fetch(url, category);
      if (!result.success) {
        console.log(
          `⚠️ ${adapter.name} adapter failed (${result.error}); trying next candidate`,
        );
        continue;
      }
      if (result.items.length === 0) {
        console.log(
          `⚠️ ${adapter.name} adapter returned 0 items; trying next candidate`,
        );
        continue;
      }
      console.log(
        `✅ ${adapter.name} adapter returned ${result.items.length} item(s)`,
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `❌ ${adapter.name} adapter threw: ${message}; trying next candidate`,
      );
    }
  }

  console.log(
    `⚠️ All matching adapters exhausted for ${url}; falling through to generic scraper`,
  );
  return null;
}
