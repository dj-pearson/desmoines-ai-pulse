/**
 * An advertiser's link_url is never an href unless it is http(s)
 * (NON_CORE_REVIEW_2026-09 WP3, business plan D15).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/campaign-creative-link-url.test.ts
 *
 * AdminCampaignDetail rendered href={creative.link_url} straight from the
 * row, so a javascript: URL ran in the reviewing admin's session on click.
 */
import { assert, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

Deno.test('no page puts a raw link_url in an href', async () => {
  for (const file of ['src/pages/AdminCampaignDetail.tsx', 'src/components/AdBanner.tsx']) {
    const src = await read(file);
    assertFalse(/href=\{[^}]*\.link_url\}/.test(src), `${file} must not render link_url as an href directly`);
    assert(/toSafeExternalUrl\(/.test(src), `${file} must pass it through toSafeExternalUrl`);
  }
});

Deno.test('the database refuses a non-http(s) link_url on new writes', async () => {
  const sql = (await read('supabase/migrations/20261003000004_campaign_creatives_link_url_http.sql'))
    .replace(/--[^\n]*/g, '');
  assert(/ADD CONSTRAINT campaign_creatives_link_url_http\s+CHECK \(link_url IS NULL OR link_url ~\* '\^https\?:\/\/'\) NOT VALID;/.test(sql));
  assert(/IF NOT EXISTS/.test(sql), 'idempotent on re-apply');
});
