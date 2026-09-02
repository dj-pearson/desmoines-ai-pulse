/**
 * Both unpublish switches are honoured on every event read (WEB-BE-034 AC3).
 *
 * public.events carries TWO independent hide mechanisms:
 *   is_hidden / hidden_at  -- written by hide_stale_events (WEB-AUTO-006)
 *   archived_at            -- written by agent-link-monitor's expired sweep,
 *                             reversibly, which is why it is a timestamp and
 *                             not a boolean ("set archived_at back to null to
 *                             restore" is the documented undo)
 *
 * They had split cleanly down the middle: every agent surface filtered
 * archived_at and never is_hidden; every web surface filtered is_hidden and
 * never archived_at. So the expired-event unpublish could run exactly as
 * designed and change nothing a visitor or a crawler saw -- the event stayed on
 * /events, in the hubs, and in sitemap-events.xml.
 *
 * The invariant these pin is that the two filters travel together. Adding one
 * without the other is how the halves drifted apart in the first place.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

/** Every file that reads events for a user-visible or crawler-visible surface. */
const EVENT_READ_SURFACES = [
  'src/hooks/useEvents.ts',
  'src/hooks/useEventBySlug.ts',
  'src/hooks/useSupabase.ts',
  'src/hooks/useHomepageStats.ts',
  'src/hooks/useAdvancedSearch.ts',
  'src/hooks/useTrending.ts',
  'src/hooks/useSmartRecommendations.ts',
  'src/hooks/useEnhancedRecommendations.ts',
  'src/hooks/usePersonalizedRecommendations.ts',
  'src/components/SearchSection.tsx',
  'src/components/SearchAutocomplete.tsx',
  'src/pseo/components/sections/PseoLiveListings.tsx',
  'src/lib/sitemap.ts',
  'src/lib/sitemapEnhanced.ts',
  'scripts/generate-dynamic-sitemaps.ts',
];

const HIDDEN = /\.neq\((["'])is_hidden\1,\s*true\)/g;
const ARCHIVED = /\.is\((["'])archived_at\1,\s*null\)/g;

/**
 * Strip comments before counting.
 *
 * Without this the count is wrong in the most confusing way: useHomepageStats
 * opens with a docstring QUOTING `.neq("is_hidden", true)` to explain what the
 * hook must stay in step with, and that quotation counted as a filter. An
 * assertion that reads prose fails on correct code and passes on broken code
 * whose comments happen to line up.
 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

Deno.test('every is_hidden filter is matched by an archived_at filter', async () => {
  for (const rel of EVENT_READ_SURFACES) {
    const src = codeOnly(await read(rel));
    const hidden = (src.match(HIDDEN) || []).length;
    const archived = (src.match(ARCHIVED) || []).length;
    assert(hidden > 0, `${rel} should still filter is_hidden`);
    assertEquals(
      archived,
      hidden,
      `${rel}: ${hidden} is_hidden filter(s) but ${archived} archived_at filter(s) -- ` +
        'an event the link monitor unpublished would still render here',
    );
  }
});

Deno.test('the two sitemap generators filter both', async () => {
  // The crawler-facing half, and the one that matters most: a sitemap entry for
  // a retired event invites a crawl of a page that should be gone.
  for (const rel of ['src/lib/sitemap.ts', 'src/lib/sitemapEnhanced.ts', 'scripts/generate-dynamic-sitemaps.ts']) {
    const src = codeOnly(await read(rel));
    assert(ARCHIVED.test(src), `${rel} must exclude archived events`);
    ARCHIVED.lastIndex = 0;
  }
});

Deno.test('the agent surfaces still filter archived_at', async () => {
  // The other half of the reconciliation. If these ever stop, the sweep stops
  // meaning anything on its own side too.
  for (const rel of [
    'supabase/functions/agent-link-monitor/index.ts',
    'supabase/functions/agent-reengagement/index.ts',
    'supabase/functions/agent-weekly-digest/index.ts',
    'supabase/functions/agent-lead-sourcing/index.ts',
  ]) {
    const src = codeOnly(await read(rel));
    assert(/\.is\(["']archived_at["'],\s*null\)/.test(src), `${rel} must filter archived_at`);
  }
});

Deno.test('the sweep still writes a reversible timestamp', async () => {
  // A boolean would keep the on/off behaviour and lose WHEN, which is what
  // makes an automated unpublish auditable after the fact.
  const src = await read('supabase/functions/agent-link-monitor/index.ts');
  assert(
    /\.update\(\{ archived_at: nowIso \}\)/.test(src),
    'the unpublish must set a timestamp, not a flag',
  );
  assert(
    /set archived_at = null/.test(src),
    'the documented undo must stay documented',
  );
});

Deno.test('the two mechanisms are not collapsed into one', async () => {
  // Deliberate: "a moderator hid this" and "the sweep retired this" are
  // different facts. Merging them would lose the distinction and the timestamp.
  const src = await read('src/hooks/useEvents.ts');
  assert(/is_hidden/.test(src) && /archived_at/.test(src));
  assert(
    /THERE ARE TWO UNPUBLISH SWITCHES/.test(src),
    'the canonical read path must carry the explanation',
  );
});
