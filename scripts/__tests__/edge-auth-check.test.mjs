#!/usr/bin/env node
/**
 * Counter-test for scripts/check-edge-auth.mjs.
 *
 *   npx tsx scripts/__tests__/edge-auth-check.test.mjs
 *
 * A gate that passes is only evidence if it can fail. Each case plants a
 * service-role function in a throwaway tree (EDGE_AUTH_ROOT) with an empty
 * baseline and asserts what the sweep says about it.
 *
 * The case this was written for: until 2026-11-08 the sweep counted the bare
 * word "signature" as a caller check, so log-error - a public sink that
 * computes an error cluster signature and verifies nobody - was reported as
 * guarded. The two "signature" cases fail if that word comes back.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CHECKER = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-edge-auth.mjs');

let bad = 0;
const ck = (name, ok, detail = '') => {
  if (ok) console.log(`  ok    ${name}`);
  else {
    bad++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};

const SERVICE =
  'const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);\n';

/** Runs the checker against a tree holding `files` and an empty baseline. */
function sweep(files) {
  const root = mkdtempSync(join(tmpdir(), 'edge-auth-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      const p = join(root, 'supabase', 'functions', rel);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, body);
    }
    mkdirSync(join(root, '.github'), { recursive: true });
    writeFileSync(
      join(root, '.github', 'edge-auth-baseline.json'),
      JSON.stringify({ unguarded: [], notes: {} }),
    );
    const r = spawnSync(process.execPath, [CHECKER], {
      env: { ...process.env, EDGE_AUTH_ROOT: root },
      encoding: 'utf8',
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** True when the sweep reports `name` as a new unguarded function. */
const flags = (r, name) => r.code === 1 && new RegExp(`^\\s+${name}$`, 'm').test(r.out);

console.log('a variable named signature is not a caller check');
{
  const r = sweep({
    'sink/index.ts':
      SERVICE +
      'const signature = await errorSignature(component, action, message);\n' +
      'await db.from("error_events").insert({ signature });\n',
  });
  ck('flags the sink', flags(r, 'sink'), r.out);
}

console.log('signing an outgoing JWT is not a caller check');
{
  const r = sweep({
    'signer/index.ts':
      SERVICE + 'const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data);\n',
  });
  ck('flags the signer', flags(r, 'signer'), r.out);
}

console.log('a guard named only in a comment does not count');
{
  const r = sweep({ 'prose/index.ts': SERVICE + '// guarded by requireAdminOrApiKey upstream\n' });
  ck('flags the function', flags(r, 'prose'), r.out);
}

console.log('a function without the service role is out of scope');
{
  const r = sweep({
    'anon/index.ts': 'const db = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!);\n',
    'admin/index.ts': SERVICE + 'const fail = await requireAdminOrApiKey(req, corsHeaders);\n',
  });
  ck('exit 0', r.code === 0, r.out);
}

console.log('real verifiers still count');
{
  const r = sweep({
    'admin/index.ts': SERVICE + 'const fail = await requireAdminOrApiKey(req, corsHeaders);\n',
    'pubsub/index.ts': SERVICE + 'await verifyOidcToken(token, audience, account);\n',
    'sns/index.ts': SERVICE + 'const r = await handle(req, { verifySignature: verifySnsMessage });\n',
    'stripe/index.ts':
      SERVICE + 'const event = await stripe.webhooks.constructEventAsync(body, sig, secret);\n',
    'user/index.ts': SERVICE + 'const { data } = await db.auth.getUser(token);\n',
  });
  ck('exit 0', r.code === 0, r.out);
}

console.log('the real tree passes against its baseline');
{
  const env = { ...process.env };
  delete env.EDGE_AUTH_ROOT;
  const r = spawnSync(process.execPath, [CHECKER], { encoding: 'utf8', env });
  ck('exit 0', r.status === 0, `${r.stdout}${r.stderr}`);
  // Listed under "now verify the caller" would mean the sweep counts it as
  // guarded again, which is the regression this suite exists for.
  ck('log-error is not counted as guarded', !/^\s+log-error$/m.test(r.stdout), r.stdout);
}

if (bad) {
  console.log(`\n${bad} check(s) failed.`);
  process.exit(1);
}
console.log('\nall checks passed.');
