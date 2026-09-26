/**
 * No price is decided in the browser (NON_CORE_REVIEW_2026-09 WP3; CLAUDE.md
 * "Money is decided on the server").
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/campaign-no-client-price.test.ts
 *
 * Three leftovers each held a second formula for one price:
 *   - the admin "pricing override" wrote campaigns.total_cost, which
 *     create-campaign-checkout recomputes from the rate card and ignores, so
 *     the admin saw a new price and the advertiser was charged the old one;
 *   - placementTotalPrice() mirrored an SQL overload a migration had dropped,
 *     with no caller left;
 *   - getCurrentPricing() fell back to hardcoded daily rates on any error.
 */
import { assert, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

Deno.test('there is no client price override', async () => {
  const hook = await read('src/hooks/useAdminCampaigns.ts');
  assertFalse(/createPricingOverride/.test(hook));
  assertFalse(/pricing_overrides/.test(hook));
  const page = await read('src/pages/AdminCampaignDetail.tsx');
  assertFalse(/createPricingOverride|overridePrice|Apply Override/.test(page));
});

Deno.test('useCampaigns has no price formula and no hardcoded rate', async () => {
  const hook = await read('src/hooks/useCampaigns.ts');
  assertFalse(/export function placementTotalPrice/.test(hook), 'the dead mirror is gone');
  assertFalse(/defaultPrices/.test(hook), 'no fallback rate table');
  const fn = hook.slice(hook.indexOf('const getCurrentPricing = async ('), hook.indexOf('const createCampaign = async ('));
  assert(fn.length > 0);
  assert(/if \(error\) throw error;/.test(fn), 'an RPC error is thrown, not priced');
  assertFalse(/catch \(/.test(fn), 'and not swallowed into a guess');
});

Deno.test('CLAUDE.md points at the quote the page actually uses', async () => {
  const doc = await read('CLAUDE.md');
  const para = doc.slice(doc.indexOf('### Money is decided on the server'), doc.indexOf('### Branch first'));
  assert(/useCampaignQuote\(\)/.test(para));
  assertFalse(/placementTotalPrice/.test(para));
});
