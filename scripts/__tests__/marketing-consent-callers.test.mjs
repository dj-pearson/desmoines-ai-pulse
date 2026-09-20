#!/usr/bin/env node
/**
 * The per-caller consent rule (WEB-LEGAL-012).
 *
 *   npx tsx scripts/__tests__/marketing-consent-callers.test.mjs
 *
 * The rule has to accept THREE different opt-outs, because the audiences
 * differ: users opt out through profiles.lifecycle_signals.messagingAllowed,
 * business contacts through outreach_suppression, and newsletter recipients
 * through user_email_preferences. A rule that demanded one of them would fail
 * outreach-sequencer for having the correct control.
 */
import { classify, codeOnly } from '../check-marketing-consent-callers.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`);
  }
};

console.log('[marketing-consent] the per-caller rule');

check('a file with no sends is not classified', classify('const x = 1;') === null);

check(
  'a marketing send with no gate fails',
  classify('await sendNurtureEmail(sb, { email, subject });')?.ok === false,
);
check(
  'a marketing send gated on messagingAllowed passes',
  classify('if (signals.messagingAllowed === false) return; await sendNurtureEmail(sb, {});')?.ok === true,
);
check(
  'a marketing send gated on outreach_suppression passes',
  classify('await sb.from("outreach_suppression").select("email"); await sendNurtureEmail(sb, {});')?.ok === true,
);
check(
  'a marketing send gated on user_email_preferences passes',
  classify('await sb.from("user_email_preferences").select("*"); await sendNurtureEmail(sb, {});')?.ok === true,
);
check(
  'an all-transactional file needs no gate',
  classify('await sendNurtureEmail(sb, { category: "transactional" });')?.ok === true,
);

// The mixed file is the shape agent-subscription-nurture actually has.
{
  const mixed = `
    if (signals.messagingAllowed === false) return;
    await sendNurtureEmail(sb, { category: "transactional" });
    await sendNurtureEmail(sb, { subject: "upgrade" });
  `;
  const v = classify(mixed);
  check('a mixed file counts both kinds', v?.calls === 2 && v?.transactional === 1 && v?.marketing === 1, JSON.stringify(v));
  check('and passes when it gates', v?.ok === true);

  const ungated = mixed.replace('if (signals.messagingAllowed === false) return;', '');
  check('a mixed file with no gate fails', classify(ungated)?.ok === false);
}

// THE TRAP THIS REPO KEEPS WALKING INTO. These files explain their gates at
// length; a check that reads the explanation instead of the gate passes on a
// sender that has neither.
{
  const commentOnly = `
    // We used to check signals.messagingAllowed here.
    /* outreach_suppression is consulted upstream, supposedly. */
    await sendNurtureEmail(sb, { subject: "hello" });
  `;
  check('a gate named only in a comment does not count', classify(commentOnly)?.ok === false, JSON.stringify(classify(commentOnly)));
  check('and the call itself is still seen', classify(commentOnly)?.calls === 1);
  check('codeOnly strips block comments', !codeOnly('/* messagingAllowed */ const x=1;').includes('messagingAllowed'));
  check('codeOnly strips line comments', !codeOnly('  // messagingAllowed\nconst x=1;').includes('messagingAllowed'));
}

// The real tree must be clean, since this is a gate and not a ratchet.
{
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const walk = (d, out = []) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (p.endsWith('.ts')) out.push(p);
    }
    return out;
  };
  const files = walk('supabase/functions').filter(
    (f) => !f.includes('_shared/sendNurtureEmail.ts') && !f.includes('/_tests/'),
  );
  const verdicts = files
    .map((f) => ({ f, v: classify(readFileSync(f, 'utf8')) }))
    .filter((x) => x.v);
  check('the tree has callers to check', verdicts.length > 0, String(verdicts.length));
  const bad = verdicts.filter((x) => !x.v.ok);
  check('every caller in the tree is compliant', bad.length === 0, bad.map((x) => x.f).join(', '));
}

if (failures > 0) {
  console.error(`[marketing-consent] ${failures} failure(s)`);
  process.exit(1);
}
console.log('[marketing-consent] all checks passed');
