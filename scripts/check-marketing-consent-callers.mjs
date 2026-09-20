#!/usr/bin/env node
/**
 * Every marketing send must pass a consent gate (WEB-LEGAL-012).
 *
 *   npm run check-marketing-consent
 *
 * supabase/functions/_shared/sendNurtureEmail.ts says it in its own header:
 *
 *     "Callers MUST have already checked consent/unsubscribe - this records
 *      the send, it doesn't decide policy."
 *
 * That is an invariant enforced by nothing. The helper cannot enforce it
 * itself and should not try: the opt-out it must honour differs by audience.
 * The four user-facing families gate on
 * profiles.lifecycle_signals.messagingAllowed; outreach-sequencer mails
 * business contacts from crm_leads, whose opt-out is the outreach_suppression
 * list, and asserting messagingAllowed there would demand the wrong control.
 *
 * So the check is per CALLER, and it is a GATE rather than a ratchet because
 * all thirteen callers comply today. A ratchet on zero is a gate with extra
 * steps; what this stops is the fourteenth.
 *
 * WHAT IT CANNOT SEE, stated so the coverage is not overclaimed: a file with
 * two marketing sends that gates one of them passes here. The per-agent
 * behaviour - opted out reaches no send, opted in reaches the send path - is
 * run by supabase/functions/_tests/marketing-optout-agents.test.ts, one agent
 * per family, each assertion paired. This check is the other half: it catches
 * the sender that is added later and never checks at all, which running five
 * named agents cannot.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS = join(ROOT, 'supabase', 'functions');
const HELPER = 'supabase/functions/_shared/sendNurtureEmail.ts';

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/**
 * Comments are stripped before anything is matched. These files EXPLAIN their
 * consent gates at length, and a check that passes on the sentence describing
 * a gate instead of on the gate is the trap this repo has hit eleven times.
 */
export function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Classify one file's use of the marketing send helper.
 * Exported so the rules have a test rather than a reading.
 */
export function classify(src) {
  const code = codeOnly(src);
  const calls = [...code.matchAll(/\bsendNurtureEmail\s*\(/g)].length;
  if (calls === 0) return null;

  const transactional = [...code.matchAll(/category:\s*["']transactional["']/g)].length;
  // The two opt-out mechanisms, and the ledger one agent consults instead.
  const gates = [];
  if (/messagingAllowed/.test(code)) gates.push('messagingAllowed');
  if (/outreach_suppression/.test(code)) gates.push('outreach_suppression');
  if (/user_email_preferences/.test(code)) gates.push('user_email_preferences');

  return {
    calls,
    transactional,
    marketing: calls - transactional,
    gates,
    ok: calls === transactional || gates.length > 0,
  };
}

function main() {
  const findings = [];
  let checked = 0;

  for (const file of walk(FUNCTIONS)) {
    const rel = relative(ROOT, file).split('\\').join('/');
    if (rel === HELPER) continue;
    // Tests drive the agents deliberately, including the opted-out cases.
    if (rel.includes('/_tests/') || rel.includes('/__tests__/')) continue;

    const verdict = classify(readFileSync(file, 'utf8'));
    if (!verdict) continue;
    checked += 1;
    if (!verdict.ok) findings.push({ file: rel, ...verdict });
  }

  if (checked === 0) {
    // An empty scan means the helper was renamed or moved, not that every
    // sender is compliant. Several checks in this repo have had that failure
    // mode; this one refuses to pass on it.
    console.error('[marketing-consent] found no callers of sendNurtureEmail - refusing to pass.');
    console.error('If the helper was renamed, update HELPER and this scan.');
    process.exit(1);
  }

  console.log(`[marketing-consent] ${checked} caller(s) of sendNurtureEmail.`);

  if (findings.length) {
    console.error('\nX These files send marketing email with no consent gate:\n');
    for (const f of findings) {
      console.error(`  ${f.file}\n    ${f.marketing} marketing send(s), ${f.transactional} transactional, no gate found`);
    }
    console.error(
      '\nsendNurtureEmail records a send; it does not decide policy, and says so in its\n' +
        'header. A marketing sender must consult the opt-out its audience uses:\n' +
        '  profiles.lifecycle_signals.messagingAllowed   for users\n' +
        '  outreach_suppression                          for crm_leads business contacts\n' +
        'or mark the send `category: "transactional"` if the recipient genuinely cannot\n' +
        'opt out of it - billing and account mail only.',
    );
    process.exit(1);
  }

  console.log('OK Every marketing sender consults an opt-out.');
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]).endsWith('check-marketing-consent-callers.mjs');
if (invokedDirectly) main();
