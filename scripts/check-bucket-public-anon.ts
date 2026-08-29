#!/usr/bin/env tsx
/**
 * Is a bucket that must be closed actually closed, asked with the ANON key
 * (WEB-LEGAL-011 AC8, WEB-QA-020).
 *
 * WHY THIS EXISTS ALONGSIDE check-bucket-posture.ts. That script asks
 * GET /storage/v1/bucket, which needs a service-role key. In this project the
 * service-role key is an ENVIRONMENT secret scoped to "Scrape", so the only job
 * that can use it is the daily rls-config-audit - and a pull request that
 * reopens a bucket is therefore not caught until the next morning. The anon key
 * is a repository secret that pr-checks.yml already uses, so this runs on the PR.
 *
 * ITS HEADER SAYS ANON CANNOT DO THIS, AND THAT IS TRUE OF THE ENDPOINT IT
 * MEASURED. `GET /storage/v1/bucket` returns [] to anon and
 * `GET /storage/v1/bucket/<id>` returns 400 for every bucket alike. The PUBLIC
 * OBJECT endpoint is a different question and it does discriminate. Measured
 * 2026-08-29:
 *
 *     /storage/v1/object/public/ad-creatives/<missing key>
 *         400 {"error":"not_found","message":"Object not found","code":"NoSuchKey"}
 *     /storage/v1/object/public/ad-creatives-review/<missing key>
 *         400 {"error":"Bucket not found","code":"NoSuchBucket"}
 *
 * A public bucket resolves and then fails on the key. A private one refuses to
 * resolve at all, and so does a bucket that does not exist.
 *
 * WHAT THAT ASYMMETRY MEANS FOR WHAT THIS CAN GATE. It proves PUBLIC positively
 * and cannot tell private from absent. That is the right way round: the failure
 * that matters is a closed bucket becoming readable, and NoSuchKey proves it.
 * The other direction - a PUBLIC_BY_DESIGN bucket that does not answer - is
 * reported and not failed, because "deleted" and "closed" look identical from
 * here and failing on a deleted bucket would be a merge freeze over a rename.
 *
 * The two lists are parsed out of storage-bucket-posture.test.ts, exactly as
 * check-bucket-posture.ts does, so there is one declaration and three checks
 * that cannot drift from it.
 *
 *   npx tsx scripts/check-bucket-public-anon.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POSTURE_TEST = join(ROOT, 'supabase/functions/_tests/storage-bucket-posture.test.ts');

function env(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  const f = join(ROOT, '.env');
  if (!existsSync(f)) return undefined;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    if (line.slice(0, i).trim() === key) return line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

const URL_ = env('SUPABASE_URL') ?? env('VITE_SUPABASE_URL');
const KEY = env('VITE_SUPABASE_ANON_KEY') ?? env('SUPABASE_ANON_KEY');
if (!URL_ || !KEY) {
  console.error('[bucket-anon] SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set - skipping.');
  process.exit(0);
}

if (!existsSync(POSTURE_TEST)) {
  console.error(`[bucket-anon] ${POSTURE_TEST} is missing - it is the declaration this reads.`);
  process.exit(1);
}
const posture = readFileSync(POSTURE_TEST, 'utf8');

/** Keys of the PUBLIC_BY_DESIGN record. Quoted or bare, both appear. */
function publicByDesign(): string[] {
  const block = posture.match(/const PUBLIC_BY_DESIGN[^{]*\{([\s\S]*?)\n\};/);
  if (!block) throw new Error('PUBLIC_BY_DESIGN not found in the posture test');
  return [...block[1].matchAll(/^\s*'?([a-z0-9-]+)'?\s*:/gm)].map((m) => m[1]);
}

function mustNotBePublic(): string[] {
  const m = posture.match(/const MUST_NOT_BE_PUBLIC\s*=\s*\[([^\]]*)\]/);
  if (!m) throw new Error('MUST_NOT_BE_PUBLIC not found in the posture test');
  return [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]);
}

type Verdict = 'public' | 'closed-or-absent' | 'unknown';

async function probe(bucket: string): Promise<{ verdict: Verdict; detail: string }> {
  const url = `${URL_}/storage/v1/object/public/${bucket}/__posture_probe_missing_key__.bin`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { apikey: KEY! } });
  } catch (e) {
    return { verdict: 'unknown', detail: `request failed: ${(e as Error).message}` };
  }
  const body = (await res.text()).slice(0, 200);
  if (/NoSuchKey/.test(body)) return { verdict: 'public', detail: 'resolved the bucket, missing key' };
  if (/Bucket not found|NoSuchBucket/.test(body)) return { verdict: 'closed-or-absent', detail: 'bucket did not resolve' };
  return { verdict: 'unknown', detail: `${res.status} ${body.replace(/\s+/g, ' ')}` };
}

const open = publicByDesign();
const closed = mustNotBePublic();
console.log(`[bucket-anon] ${open.length} declared public, ${closed.length} declared closed.`);

const leaked: string[] = [];
const unexpected: string[] = [];
const unknown: string[] = [];

for (const bucket of closed) {
  const { verdict, detail } = await probe(bucket);
  console.log(`   closed  ${bucket.padEnd(22)} ${verdict}`);
  if (verdict === 'public') leaked.push(bucket);
  if (verdict === 'unknown') unknown.push(`${bucket}: ${detail}`);
}
for (const bucket of open) {
  const { verdict, detail } = await probe(bucket);
  console.log(`   public  ${bucket.padEnd(22)} ${verdict}`);
  if (verdict === 'closed-or-absent') unexpected.push(bucket);
  if (verdict === 'unknown') unknown.push(`${bucket}: ${detail}`);
}

if (unknown.length > 0) {
  console.log('\nBuckets that answered in a shape this check does not recognise:');
  for (const u of unknown) console.log(`   ${u}`);
  console.log('   Not failed on: an unrecognised answer is more likely a storage API change than a leak.');
}

if (unexpected.length > 0) {
  console.log(`\n${unexpected.length} bucket(s) declared public do not resolve anonymously:`);
  for (const b of unexpected) console.log(`   ${b}`);
  console.log(
    '   Reported, not failed: from the anon side a deleted bucket and a closed one are the same\n' +
      '   answer. If one of these is meant to serve images on a public page, it is broken now.',
  );
}

if (leaked.length > 0) {
  console.error('\nA bucket that must stay closed is publicly readable (WEB-LEGAL-011 / WEB-QA-020)\n');
  for (const b of leaked) console.error(`   ${b}`);
  console.error(
    '\nAnyone who can guess an object path can read it with no credentials. For\n' +
      'ad-creatives-review that is unreleased campaign artwork belonging to an\n' +
      'advertiser. Close the bucket, then decide what to do about anything uploaded\n' +
      'while it was open.\n',
  );
  process.exit(1);
}

console.log('\nOK No bucket that must stay closed is publicly readable.');
