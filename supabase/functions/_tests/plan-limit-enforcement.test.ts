/**
 * Plan limits enforced server-side (WEB-FEAT-017).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/plan-limit-enforcement.test.ts
 *
 * Favorites (3 on free), saved searches (0) and alerts (0) were checked in the
 * browser and nowhere else. RLS on content_favorites, user_event_interactions
 * and saved_searches is own-row with no count, so a session token and curl beat
 * every cap; saved-search-alerts then mailed every row in saved_searches
 * regardless of whether its owner was entitled to alerts at all.
 *
 * Two halves, tested differently:
 *   - the triggers, asserted against the migration SQL, because no Postgres is
 *     reachable from CI here;
 *   - the alert filter, exercised as behaviour against a fake Supabase client.
 */

import {
  assert,
  assertEquals,
  assertFalse,
  assertRejects,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  GRACE_PERIOD_DAYS,
  hasFeatureAccess,
  resolveEntitledTiers,
} from '../_shared/entitlements.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

const MIGRATION = await read('supabase/migrations/20260918000001_enforce_plan_limits.sql');
const ALERTS = await read('supabase/functions/saved-search-alerts/index.ts');

// --------------------------------------------------------------------------
// The triggers
// --------------------------------------------------------------------------

Deno.test('every favorite table is capped, and both are counted together', () => {
  // Event favorites live in user_event_interactions and everything else in
  // content_favorites. Counting one table alone doubles the advertised cap.
  assert(/BEFORE INSERT ON public\.content_favorites/.test(MIGRATION));
  assert(/BEFORE INSERT ON public\.user_event_interactions/.test(MIGRATION));
  assert(
    /FROM public\.content_favorites WHERE user_id = NEW\.user_id\)\s*\n\s*\+ \(SELECT count\(\*\) FROM public\.user_event_interactions/
      .test(MIGRATION),
    'the count must span both favorite tables',
  );
  assert(/BEFORE INSERT ON public\.saved_searches/.test(MIGRATION));
});

Deno.test('only favorites are capped on user_event_interactions', () => {
  // Views and clicks share that table and are analytics; capping them would
  // silently stop collecting data at three rows per user.
  assert(
    /WHEN \(NEW\.interaction_type = 'favorite'\)/.test(MIGRATION),
    'the interaction trigger must be scoped to favorites',
  );
});

Deno.test('the refusal is typed, not a message the UI has to string-match', () => {
  const raises = MIGRATION.match(/ERRCODE = 'PT402'/g) ?? [];
  assertEquals(raises.length, 2, 'favorites and saved searches each raise typed');
  assert(/HINT = 'upgrade_required'/.test(MIGRATION));
  assert(/DETAIL = 'favorites'/.test(MIGRATION));
  assert(/DETAIL = 'saved_searches'/.test(MIGRATION));
});

Deno.test('-1 means unlimited and beats any finite limit', () => {
  // A user holding web=insider (favorites -1) and ios=free must resolve to -1.
  // max() over (-1, 3) is 3, which would cap a paying subscriber at the free
  // limit -- the most expensive possible direction for this bug to fail.
  assert(
    /CASE WHEN bool_or\(lim = -1\) THEN -1 ELSE max\(lim\) END/.test(MIGRATION),
    'unlimited must win explicitly, not through max()',
  );
  const unlimitedGuards = MIGRATION.match(/IF v_limit < 0 THEN/g) ?? [];
  assertEquals(unlimitedGuards.length, 2, 'both triggers must short-circuit on unlimited');
});

Deno.test('the limit is read from subscription_plans, not hardcoded again', () => {
  assert(/\(sp\.limits ->> p_limit_key\)::integer/.test(MIGRATION));
  assert(
    /FROM public\.subscription_plans WHERE name = 'free'/.test(MIGRATION),
    'the free fallback must come from the same table the UI reads',
  );
});

Deno.test('the grace window matches the one _shared/entitlements.ts applies', () => {
  // Three copies of this number exist (here, entitlements.ts, useSubscription).
  // A trigger with a shorter window revokes a past_due subscriber early.
  assertEquals(GRACE_PERIOD_DAYS, 14);
  assert(
    new RegExp(`interval '${GRACE_PERIOD_DAYS} days'`).test(MIGRATION),
    'the SQL grace window must equal GRACE_PERIOD_DAYS',
  );
  assert(/us\.status IN \('active', 'trialing'\)/.test(MIGRATION));
});

Deno.test('the resolver can see subscriptions the caller cannot', () => {
  // Under RLS a user reads only their own user_subscriptions row, and a trigger
  // that cannot see it reads every paying user as free.
  assert(/SECURITY DEFINER/.test(MIGRATION));
  assert(/SET search_path = public, pg_temp/.test(MIGRATION));
  assertFalse(
    /GRANT EXECUTE ON FUNCTION public\.entitled_plan_limit\(uuid, text\) TO PUBLIC/.test(MIGRATION),
    'a SECURITY DEFINER function must not be executable by anon',
  );
});

// --------------------------------------------------------------------------
// The alert filter
// --------------------------------------------------------------------------

function fakeSupabase(rows: unknown[] | null, error: unknown = null) {
  return {
    from() {
      const builder = {
        select: () => builder,
        in: () => builder,
        then: (resolve: (v: unknown) => void) => resolve({ data: rows, error }),
      };
      return builder;
    },
  };
}

const ACTIVE = (userId: string, plan: string) => ({
  user_id: userId,
  status: 'active',
  current_period_end: null,
  plan: { name: plan },
});

Deno.test('resolveEntitledTiers keeps the highest tier per user', async () => {
  const tiers = await resolveEntitledTiers(
    // deno-lint-ignore no-explicit-any
    fakeSupabase([ACTIVE('u1', 'insider'), ACTIVE('u1', 'vip'), ACTIVE('u2', 'insider')]) as any,
    ['u1', 'u2'],
  );
  assertEquals(tiers.get('u1'), 'vip');
  assertEquals(tiers.get('u2'), 'insider');
});

Deno.test('a user with no entitled row is absent, and reads as free', async () => {
  // deno-lint-ignore no-explicit-any
  const tiers = await resolveEntitledTiers(fakeSupabase([]) as any, ['u1']);
  assertEquals(tiers.get('u1'), undefined);
  assertFalse(hasFeatureAccess(tiers.get('u1') ?? 'free', 'create_alerts'));
});

Deno.test('a past_due row beyond the grace window does not keep alerts alive', async () => {
  const longAgo = new Date(Date.now() - (GRACE_PERIOD_DAYS + 5) * 86400_000).toISOString();
  const tiers = await resolveEntitledTiers(
    // deno-lint-ignore no-explicit-any
    fakeSupabase([{ user_id: 'u1', status: 'past_due', current_period_end: longAgo, plan: { name: 'insider' } }]) as any,
    ['u1'],
  );
  assertFalse(hasFeatureAccess(tiers.get('u1') ?? 'free', 'create_alerts'));
});

Deno.test('a failed read throws, so a broken night is not a quiet one', async () => {
  // resolveEntitledTier returns 'free' on error, which is right for one request
  // and wrong for a batch: it would make "we could not look" and "nobody is
  // entitled" produce the same empty map and the same silent zero-send run.
  await assertRejects(
    // deno-lint-ignore no-explicit-any
    () => resolveEntitledTiers(fakeSupabase(null, { message: 'boom' }) as any, ['u1']),
    Error,
    'user_subscriptions read failed',
  );
});

Deno.test('alerts are an insider feature and free never had them', () => {
  assert(hasFeatureAccess('insider', 'create_alerts'));
  assert(hasFeatureAccess('vip', 'create_alerts'));
  assertFalse(hasFeatureAccess('free', 'create_alerts'));
});

Deno.test('saved-search-alerts filters by entitlement before sending', () => {
  assert(/resolveEntitledTiers\(supabase, ownerIds\)/.test(ALERTS));
  assert(
    /hasFeatureAccess\(tiers\.get\(s\.user_id\) \?\? "free", "create_alerts"\)/.test(ALERTS),
    'the filter must run over every saved search, not per recipient later',
  );
  // An empty map means the read failed OR nobody is entitled. Sending to
  // everyone and sending to nobody are both wrong answers to a question we
  // could not ask.
  assertFalse(
    /tiers\.size === 0 && ownerIds\.length > 0/.test(ALERTS),
    'the empty-map guard was replaced by the resolver throwing -- a genuinely '
      + 'unentitled night must report zero sends, not fail the run',
  );
  assert(/skippedUnentitled/.test(ALERTS), 'the skipped count must reach the run summary');
});
