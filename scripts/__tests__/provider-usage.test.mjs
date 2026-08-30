#!/usr/bin/env node
/**
 * Offline checks for the provider-spend pricing (AOS-MANAGE-005).
 *
 *   npx tsx scripts/__tests__/provider-usage.test.mjs
 *
 * The database call is not covered - this container has no Supabase
 * credentials. What IS covered is every part that decides a number, because a
 * budget watchdog fed a wrong number is worse than one fed no number: nobody
 * checks a figure that looks plausible.
 *
 * _shared/providerUsage.ts has no imports, so it loads under tsx unchanged.
 */
import {
  priceForModel,
  anthropicCostUsd,
  recordProviderUsage,
} from '../../supabase/functions/_shared/providerUsage.ts';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name} ${detail}`); failures++; }
};
const near = (a, b) => Math.abs(a - b) < 1e-9;

console.log('exact model ids');
check('opus 5', priceForModel('claude-opus-5').inPerM === 5 && priceForModel('claude-opus-5').outPerM === 25);
check('sonnet 5', priceForModel('claude-sonnet-5').inPerM === 2 && priceForModel('claude-sonnet-5').outPerM === 10);
check('fable 5', priceForModel('claude-fable-5').inPerM === 10 && priceForModel('claude-fable-5').outPerM === 50);
check('haiku 4.5', priceForModel('claude-haiku-4-5').inPerM === 1 && priceForModel('claude-haiku-4-5').outPerM === 5);
check('sonnet 4.6 is not sonnet 5', priceForModel('claude-sonnet-4-6').inPerM === 3);
check('opus 4.8', priceForModel('claude-opus-4-8').inPerM === 5);

console.log('\ndated ids resolve like their alias');
// This is what aiConfig actually stores - a dated id, never a bare alias.
check('claude-haiku-4-5-20251001', priceForModel('claude-haiku-4-5-20251001').inPerM === 1);
check('claude-sonnet-4-5-20250929 falls back to the sonnet family',
  priceForModel('claude-sonnet-4-5-20250929').inPerM === 3);

console.log('\nprefix order');
// "claude-opus-4-8" must be tested before any shorter opus prefix, or a 4.8 id
// would price as whatever the shorter row says.
check('opus-4-8 does not collide with opus-4-6', priceForModel('claude-opus-4-8').outPerM === 25);
check('sonnet-4-6 does not match the sonnet-5 row', priceForModel('claude-sonnet-4-6').outPerM === 15);

console.log('\nunknown ids over-report rather than under-report');
check('unknown opus', priceForModel('claude-opus-9-fictional').inPerM === 15);
check('unknown sonnet', priceForModel('claude-sonnet-nope').inPerM === 3);
check('no family at all', priceForModel('gpt-4').inPerM === 15);
check('empty string', priceForModel('').inPerM === 15);
check('undefined does not throw', priceForModel(undefined).inPerM === 15);
check('case insensitive', priceForModel('Claude-Opus-5').inPerM === 5);

console.log('\ncost math');
check('1M in + 1M out on sonnet 5 is $12',
  near(anthropicCostUsd('claude-sonnet-5', { input_tokens: 1_000_000, output_tokens: 1_000_000 }), 12));
check('output is priced separately from input',
  near(anthropicCostUsd('claude-opus-5', { input_tokens: 0, output_tokens: 1_000_000 }), 25));
check('an empty usage object costs nothing',
  anthropicCostUsd('claude-opus-5', {}) === 0);

console.log('\ncache tiers');
// The bug this guards: agentRuntime used to add cache reads into input_tokens at
// the full input rate. discover-chat re-reads a cached system prompt on all six
// steps, so that overstated its cost by 10x on the cached portion.
check('a cache read is a tenth of a fresh input token',
  near(anthropicCostUsd('claude-sonnet-5', { cache_read_input_tokens: 1_000_000 }), 0.2));
check('a cache write is 1.25x',
  near(anthropicCostUsd('claude-sonnet-5', { cache_creation_input_tokens: 1_000_000 }), 2.5));
check('cached reads are cheaper than treating them as input',
  anthropicCostUsd('claude-sonnet-5', { cache_read_input_tokens: 500_000 }) <
  anthropicCostUsd('claude-sonnet-5', { input_tokens: 500_000 }));
check('all four counts add up',
  near(
    anthropicCostUsd('claude-sonnet-5', {
      input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    }),
    2 + 0.2 + 2.5 + 10,
  ));

console.log('\nrecordProviderUsage never throws');
// The money is already spent by the time this runs. Anything it does other than
// return would turn a bookkeeping failure into a failed user request.
const rows = [];
const okClient = { from: () => ({ insert: (row) => { rows.push(row); return { error: null }; } }) };
const errClient = { from: () => ({ insert: () => ({ error: { message: '42P01' } }) }) };
const throwClient = { from: () => { throw new Error('network down'); } };

const quiet = console.error;
console.error = () => {};
const okResult = await recordProviderUsage(okClient, { provider: 'anthropic', costUsd: 1.5, source: 't' });
const errResult = await recordProviderUsage(errClient, { provider: 'anthropic', costUsd: 1.5, source: 't' });
const throwResult = await recordProviderUsage(throwClient, { provider: 'anthropic', costUsd: 1.5, source: 't' });
const nanResult = await recordProviderUsage(okClient, { provider: 'anthropic', costUsd: NaN, source: 't' });
const negResult = await recordProviderUsage(okClient, { provider: 'anthropic', costUsd: -3, source: 't' });
console.error = quiet;

check('a successful insert reports true', okResult === true);
check('a PostgREST error reports false rather than throwing', errResult === false);
check('a thrown client reports false rather than throwing', throwResult === false);
check('NaN is recorded as 0, not as NaN', nanResult === true && rows[1].cost_usd === 0);
check('a negative cost is clamped to 0', negResult === true && rows[2].cost_usd === 0);
check('the row carries the provider', rows[0].provider === 'anthropic');
check('the row carries the source in meta', rows[0].meta.source === 't');

console.log('\nmeta carries no prompt text');
// provider_usage is admin-readable. A prompt is user content and must not land
// in a cost row.
rows.length = 0;
await recordProviderUsage(okClient, {
  provider: 'anthropic',
  costUsd: 0.01,
  source: 'discover-chat',
  model: 'claude-sonnet-5',
  usage: { input_tokens: 10, output_tokens: 20 },
  extra: { tier: 'insider', outcome: 'ok' },
});
const meta = rows[0].meta;
check('token counts are recorded', meta.input_tokens === 10 && meta.output_tokens === 20);
check('missing cache counts default to 0', meta.cache_read_input_tokens === 0);
check('extra context is merged', meta.tier === 'insider' && meta.outcome === 'ok');
check('nothing in meta looks like free text',
  Object.values(meta).every((v) => typeof v !== 'string' || v.length < 80));

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
