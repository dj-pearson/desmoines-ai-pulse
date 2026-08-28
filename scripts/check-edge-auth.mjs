#!/usr/bin/env node
/**
 * An edge function that runs as service_role must check who is calling it.
 *
 * FOUND THE HARD WAY, 2026-08-28. dispatch-scheduled-newsletters had a
 * docstring promising an admin-bearer check and no code performing one, and
 * backfill-all-coordinates had no auth references at all. Both build a
 * service-role client; one dispatches mail through Resend, the other geocodes
 * four tables at a cost per address.
 *
 * THE TRAP IS verify_jwt. Neither function has a config.toml entry, so
 * verify_jwt defaults to TRUE, which reads like a gate and is not one:
 *
 *     verify_jwt = true  ->  "a valid Supabase JWT"
 *     the publishable ANON KEY is a valid Supabase JWT
 *     the anon key ships in every client bundle
 *
 * Verified against production: no Authorization header answers 401 at the
 * gateway, and an anon-key bearer answers 200 and runs the job. So verify_jwt
 * separates "somebody who loaded the site" from "nobody", and nothing else.
 * Only the function can tell an admin or a cron from a visitor.
 *
 * WHAT COUNTS AS CHECKING, and this list is deliberately generous - the first
 * version of this sweep reported 52 functions and was wrong, because it did not
 * know that assign-role verifies the caller with admin.auth.getUser(bearer)
 * rather than with a helper. A false positive in a gate is worse than a gap:
 *   requireAdminOrApiKey and friends   the shared helpers
 *   auth.getUser                       resolve the bearer to a user
 *   EDGE_FUNCTION_API_KEY / x-api-key  shared-secret callers
 *   a webhook signature check          Stripe, Resend, Play, App Store
 *
 * A BASELINE, NOT A GATE ON WHAT EXISTS. The remaining entries are triage, not
 * 24 vulnerabilities - og-image renders a public card and log-error is a
 * telemetry sink, and both are meant to be reachable. Each needs its callers
 * enumerated before it is guarded, exactly as the two fixed ones did, and
 * guarding one blindly breaks whatever legitimately calls it. What this stops
 * is the list GROWING.
 *
 *   node scripts/check-edge-auth.mjs            # check
 *   node scripts/check-edge-auth.mjs --write    # re-baseline
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS = join(ROOT, 'supabase', 'functions');
const BASELINE = join(ROOT, '.github', 'edge-auth-baseline.json');
const WRITE = process.argv.includes('--write');

if (!existsSync(FUNCTIONS)) {
  console.error('[edge-auth] supabase/functions not found - refusing to pass.');
  process.exit(1);
}

/** Builds a client with the service-role key, i.e. bypasses RLS entirely. */
const PRIVILEGED = /SUPABASE_SERVICE_ROLE_KEY/;

/** Any means of establishing who the caller is. Generous on purpose. */
const VERIFIES_CALLER = new RegExp(
  [
    'requireAdminOrApiKey',
    'requireAdmin',
    'requireApiKey',
    'verifyApiKey',
    'checkAdmin',
    'requireServiceRole',
    'assertAdmin',
    'requireAuth',
    'auth[.]getUser',
    'EDGE_FUNCTION_API_KEY',
    'x-api-key',
    'CRON_SECRET',
    'verifySignature',
    'WEBHOOK_SECRET',
    'constructEvent',
    'signature',
  ].join('|'),
  'i',
);

const names = readdirSync(FUNCTIONS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => d.name)
  .sort();

if (names.length === 0) {
  console.error('[edge-auth] no function directories found - refusing to pass.');
  process.exit(1);
}

const unguarded = [];
let privileged = 0;
for (const name of names) {
  const entry = join(FUNCTIONS, name, 'index.ts');
  if (!existsSync(entry)) continue;
  const raw = readFileSync(entry, 'utf8');
  // COMMENTS ARE STRIPPED BEFORE ANY MATCHING, and the control is why. The
  // first version tested the raw source, so removing the guard CALL from
  // backfill-all-coordinates while leaving the comment that explains it still
  // passed - the regex matched the word requireAdminOrApiKey in prose. A
  // function whose docstring promises a check it does not perform is exactly
  // the defect this exists for: dispatch-scheduled-newsletters documented an
  // admin-bearer check and had none.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  if (!PRIVILEGED.test(src)) continue;
  privileged++;
  if (!VERIFIES_CALLER.test(src)) unguarded.push(name);
}

// A SCAN THAT MATCHED NOTHING IS NOT A CLEAN CODEBASE. Several checks in this
// repo have reported success while reading zero inputs; see check-edge-types.
if (privileged === 0) {
  console.error('[edge-auth] no function uses a service-role client - refusing to pass on that.');
  process.exit(1);
}

// Annotations survive a re-baseline. The list of NAMES is regenerated; the
// `notes` map beside it is hand-written triage - why an entry is here, and
// whether it should be guarded at all. Losing that on every --write would mean
// re-deriving it, and at least one entry is a deliberate design decision:
// log-content-metrics is public on purpose (anonymous visitors report metrics)
// and is bounded by a rate limit instead, which its own header explains.
const priorNotes = existsSync(BASELINE)
  ? (JSON.parse(readFileSync(BASELINE, 'utf8')).notes ?? {})
  : {};

if (WRITE) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        _comment:
          'Edge functions that build a service-role client and verify no caller. TRIAGE, not a vulnerability list - some are public by design. Each needs its callers enumerated before being guarded. This list must only ever shrink. See scripts/check-edge-auth.mjs.',
        generated: new Date().toISOString().slice(0, 10),
        unguarded: unguarded.sort(),
        notes: priorNotes,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`[edge-auth] baseline written: ${unguarded.length} unguarded of ${privileged} privileged.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('[edge-auth] no baseline. Create one with --write.');
  process.exit(1);
}

const known = new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).unguarded ?? []);
const fresh = unguarded.filter((n) => !known.has(n));
const fixed = [...known].filter((n) => !unguarded.includes(n));

console.log(
  `[edge-auth] ${privileged} function(s) run as service_role; ${unguarded.length} verify no caller (${known.size} baselined).`,
);

if (fixed.length) {
  console.log(`\n${fixed.length} now verify the caller - re-baseline to lock it in:`);
  for (const n of fixed) console.log(`  ${n}`);
}

if (fresh.length === 0) {
  console.log('\nOK No new service-role function without a caller check.');
  process.exit(0);
}

console.error(`\nX ${fresh.length} new service-role function(s) verify no caller:`);
for (const n of fresh) console.error(`  ${n}`);
console.error(
  '\n  verify_jwt does not help here. It defaults to true, and true only means "a\n' +
    '  valid Supabase JWT" - which the publishable anon key is, in every client\n' +
    '  bundle. Only the function can tell an admin or a cron from a visitor.\n' +
    '\n' +
    '  Use requireAdminOrApiKey from _shared/apiKeyAuth.ts: it accepts\n' +
    '  EDGE_FUNCTION_API_KEY, the service-role key that pg_cron sends, or an admin\n' +
    '  user JWT. Enumerate the callers first - see the two worked examples in\n' +
    '  dispatch-scheduled-newsletters and backfill-all-coordinates.\n',
);
process.exit(1);
