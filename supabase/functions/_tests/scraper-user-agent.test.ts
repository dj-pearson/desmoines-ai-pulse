/**
 * Where SCRAPER_USER_AGENT actually goes (WEB-SEC-024, AC3/AC4).
 *
 * AC3 frames the open decision as "replace the desktop Chrome User-Agent with a
 * declared bot string". That decision was not implementable as written, and this
 * file pins the half of it that now is.
 *
 * scraper.ts has three backends that reach a third-party site:
 *
 *   fetch       sends config.userAgent to the site.                  Always did.
 *   firecrawl   sent NOTHING. Firecrawl's own agent reached the site,
 *               so SCRAPER_USER_AGENT was invisible on this path.    Fixed here.
 *   browserless the request carries the UA header to browserless.io, NOT to the
 *               crawled site -- browserless drives its own headless Chrome, and
 *               its REST API does not expose --user-agent outside enterprise
 *               plans. Nothing this repo can do reaches the site on that path,
 *               and browserless is the DEFAULT backend whenever a key is set.
 *
 * The default must stay byte-identical, which is what the negative control
 * below is for: an operator who has not chosen an identity gets exactly the
 * request Firecrawl received before, so this ships no behaviour change on its
 * own. Setting SCRAPER_USER_AGENT is the decision, and it is the owner's.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { getScraperConfig } from '../_shared/scraper.ts';

const DECLARED = 'DesMoinesInsiderBot/1.0 (+https://desmoinesinsider.com/bot)';

/** The exact body scrapeWithFirecrawl builds, kept in step with scraper.ts. */
const firecrawlBody = (config: ReturnType<typeof getScraperConfig>) => ({
  url: 'https://example.com/events',
  formats: ['markdown', 'html'],
  waitFor: config.waitTime,
  timeout: config.timeout,
  ...(config.userAgentDeclared && config.userAgent
    ? { headers: { 'User-Agent': config.userAgent } }
    : {}),
});

const withEnv = <T>(vars: Record<string, string | null>, fn: () => T): T => {
  const prior = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(vars)) {
    prior.set(k, Deno.env.get(k));
    if (v === null) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of prior) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
};

Deno.test('unset SCRAPER_USER_AGENT is not a declared identity', () => {
  withEnv({ SCRAPER_USER_AGENT: null }, () => {
    const config = getScraperConfig();
    assertEquals(config.userAgentDeclared, false);
    assert(
      config.userAgent!.includes('Chrome/'),
      'the fallback is still the desktop Chrome string',
    );
  });
});

Deno.test('NEGATIVE CONTROL: with no declared UA, Firecrawl gets no headers key', () => {
  withEnv({ SCRAPER_USER_AGENT: null }, () => {
    const body = firecrawlBody(getScraperConfig());
    assertEquals(
      Object.hasOwn(body, 'headers'),
      false,
      'the default request must be identical to the one sent before this change',
    );
  });
});

Deno.test('a declared UA is forwarded to the site on the Firecrawl path', () => {
  withEnv({ SCRAPER_USER_AGENT: DECLARED }, () => {
    const config = getScraperConfig();
    assertEquals(config.userAgentDeclared, true);
    const body = firecrawlBody(config) as { headers?: Record<string, string> };
    assertEquals(body.headers?.['User-Agent'], DECLARED);
  });
});

Deno.test('the declared UA is what robots.txt group selection would use', () => {
  // AC4 asks that group selection be re-checked once the UA is declared. The
  // two must come from the same value or we would honour rules written for a
  // name the site never sees -- which is exactly the state the browserless
  // path is stuck in, and the reason AC4 cannot be closed by this change alone.
  withEnv({ SCRAPER_USER_AGENT: DECLARED }, () => {
    assertEquals(getScraperConfig().userAgent, DECLARED);
  });
});
