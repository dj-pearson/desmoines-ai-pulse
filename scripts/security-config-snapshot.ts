/**
 * AOS-SEC-006 — security config snapshot.
 *
 * Captures the security-relevant configuration (verify_jwt exemptions, CSP, and
 * CORS allowlist) into a stable JSON so the scheduled drift audit can diff the
 * current tree against the committed baseline (docs/security-config-baseline.json)
 * and alert on drift against the WEB-SEC-001/004 baselines.
 *
 * Run: `tsx scripts/security-config-snapshot.ts`        (writes the baseline)
 *      `tsx scripts/security-config-snapshot.ts --print` (prints to stdout)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();

function readOrEmpty(p: string): string {
  const abs = join(root, p);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : '';
}

function sha(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

// verify_jwt = false exemptions (WEB-SEC-001): the ordered list of functions.
const configToml = readOrEmpty('supabase/config.toml');
const verifyJwtFalse = [...configToml.matchAll(/\[functions\.([a-z0-9-]+)\][^[]*?verify_jwt\s*=\s*false/gis)]
  .map((m) => m[1])
  .sort();

// CSP (WEB-SEC-004): the Content-Security-Policy line from public/_headers.
const headers = readOrEmpty('public/_headers');
const cspLine = (headers.match(/Content-Security-Policy:\s*(.+)/i)?.[1] ?? '').trim();

// CORS allowlist (WEB-SEC-001): hash the allowedOrigins block in cors.ts.
const cors = readOrEmpty('supabase/functions/_shared/cors.ts');
const corsBlock = cors.match(/allowedOrigins[\s\S]{0,1200}?\};/)?.[0] ?? '';

const snapshot = {
  verifyJwtFalse,
  verifyJwtCount: verifyJwtFalse.length,
  cspPresent: cspLine.length > 0,
  cspHash: sha(cspLine),
  corsHash: sha(corsBlock),
};

if (process.argv.includes('--print')) {
  process.stdout.write(JSON.stringify(snapshot, null, 2) + '\n');
} else {
  const out = join(root, 'docs', 'security-config-baseline.json');
  writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`Wrote ${out} (verify_jwt=${verifyJwtFalse.length}, cspPresent=${snapshot.cspPresent})`);
}
