#!/usr/bin/env node
/**
 * A creative may only be auto-approved when every check RAN (WEB-ADS-006 AC4).
 *
 *   npx tsx scripts/__tests__/creative-auto-review-decision.test.mjs
 *
 * THE BUG THIS PINS. brandSafe() returned `safe: true` on three paths that
 * moderated nothing - no ANTHROPIC_API_KEY, a non-2xx from the API, and any
 * throw - and two of them said "failed open" in their own note. The verdict was
 * `reasons.length === 0`, so an environment without the key auto-approved every
 * ad creative on a public site and wrote `creative_auto_approved` to
 * security_audit_logs for each one. Silent, default in an unprovisioned
 * environment, and the evidence it left said the check passed.
 *
 * The second half is the one that is easy to lose in a refactor: a check that
 * could not run is NOT a rejection. index.ts had one list feeding both
 * is_approved and rejection_reason, so "we could not check your ad" and "your
 * ad failed" were the same message to the advertiser.
 *
 * decision.ts imports nothing, so this runs in npm run test:offline, which CI
 * runs without Deno.
 */
import {
  brandSafetyFinding,
  autoReviewOutcome,
} from '../../supabase/functions/campaign-creative-review/decision.ts';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

console.log('\nbrand safety: ran and passed, ran and failed, did not run');
{
  check('a clean verdict is neither a failure nor unavailable',
    Object.keys(brandSafetyFinding({ safe: true, checked: true, note: 'ok' })).length === 0);

  const flagged = brandSafetyFinding({ safe: false, checked: true, note: 'flagged by Claude' });
  check('flagged copy is a FAILURE the advertiser can act on', !!flagged.failure && !flagged.unavailable, JSON.stringify(flagged));

  // The three that used to be approvals.
  for (const note of ['skipped (no ANTHROPIC_API_KEY)', 'claude error 529', 'claude exception: fetch failed']) {
    const f = brandSafetyFinding({ safe: false, checked: false, note });
    check(`"${note}" is UNAVAILABLE, not a failure`, !!f.unavailable && !f.failure, JSON.stringify(f));
    check(`  and the note reaches the admin queue`, f.unavailable.includes(note), f.unavailable);
  }
}
{
  // The shape that would restore the original bug most easily: a caller that
  // sets safe:true but forgets checked.
  const f = brandSafetyFinding({ safe: true, checked: false, note: 'skipped (no ANTHROPIC_API_KEY)' });
  check('safe:true with checked:false is still unavailable', !!f.unavailable, JSON.stringify(f));
}

console.log('\nthe three outcomes');
{
  const o = autoReviewOutcome([], []);
  check('everything ran and passed -> approved', o.approved === true);
  check('  audit says approved', o.auditAction === 'creative_auto_approved');
  check('  and nothing needs a human', o.needsHuman === false);
}
{
  const o = autoReviewOutcome(['Image 600x90 below 728x90 minimum for top_banner'], []);
  check('a real failure -> not approved', o.approved === false);
  check('  audit says rejected', o.auditAction === 'creative_auto_rejected');
  check('  the failure is available for rejection_reason', o.failures.length === 1);
  check('  and it is in the summary', o.summary.join().includes('728x90'));
}
{
  const o = autoReviewOutcome([], ['Brand-safety check did not run: skipped (no ANTHROPIC_API_KEY)']);
  check('an unchecked check -> NOT approved', o.approved === false);
  check('  and NOT rejected: no failures to write to rejection_reason', o.failures.length === 0);
  check('  audit says deferred, not approved and not rejected', o.auditAction === 'creative_review_deferred', o.auditAction);
  check('  a human is needed', o.needsHuman === true);
  check('  the admin queue is told what went unchecked', o.summary[0].includes('ANTHROPIC_API_KEY'));
}
{
  // Both at once: the rejection wins for the advertiser-facing message, because
  // there IS something they can fix.
  const o = autoReviewOutcome(['Missing target URL'], ['Campaign standing could not be checked']);
  check('a failure alongside an unchecked check is a rejection', o.auditAction === 'creative_auto_rejected');
  check('  and needsHuman is false - the advertiser acts first', o.needsHuman === false);
  check('  but the summary still carries both', o.summary.length === 2, JSON.stringify(o.summary));
  check('  failures come first in the summary', o.summary[0] === 'Missing target URL');
}

console.log('\nthe callers that must stay wired');
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(
    new URL('../../supabase/functions/campaign-creative-review/index.ts', import.meta.url),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(?<!:)\/\/.*$/, ''))
    .join('\n');

  // COMMENTS STRIPPED. The module header now recounts the old fail-open
  // behaviour to explain it, and a check that fires on the sentence explaining
  // it is a trap this repo has walked into a dozen times.
  check('no code path still returns safe:true without checking',
    !/safe: true, note: `claude/.test(src) && !/return \{ safe: true, note: 'skipped/.test(src), 'a fail-open return survived');
  check('the verdict comes from decision.ts', /autoReviewOutcome\(reasons, unavailable\)/.test(src));
  check('rejection_reason is set only from real failures',
    /rejection_reason: outcome\.failures\.length > 0/.test(src));
  check('auto_review_reasons carries the full summary', /auto_review_reasons: outcome\.approved \? null : outcome\.summary/.test(src));
  check('the audit log distinguishes all three', /action: outcome\.auditAction/.test(src));
  check('a failed standing lookup no longer reads as good standing',
    /unavailable\.push\('Campaign standing could not be checked'\)/.test(src));
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
