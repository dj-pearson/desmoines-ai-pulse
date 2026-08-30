#!/usr/bin/env node
/**
 * Offline checks for the image_url rewrite (WEB-OPS-023).
 *
 *   npx tsx scripts/__tests__/repoint-media-urls.test.mjs
 *
 * The rewrite runs across every content table, so the cases that matter are the
 * ones it must NOT touch: an externally hosted image_url cannot be served from
 * /media, and rewriting it would replace a working image with a 404. The
 * round-trip case is here because --revert is the only undo this has.
 */
import { rewrite, storagePrefix, cdnPrefix } from '../repoint-media-urls.ts';

const SB = 'https://proj.supabase.co';
const CDN = 'https://desmoinesinsider.com';
const from = storagePrefix(SB);
const to = cdnPrefix(CDN);

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name} ${detail}`); failures++; }
};

console.log('prefixes');
check('storage prefix', from === 'https://proj.supabase.co/storage/v1/object/public/media/', from);
check('cdn prefix', to === 'https://desmoinesinsider.com/media/', to);
check('a trailing slash on the base does not double up', cdnPrefix(CDN + '/') === to);

console.log('\nours: rewritten');
const stored = `${from}events/abc-123/hero.jpg`;
check('a stored URL moves to /media', rewrite(stored, from, to) === `${to}events/abc-123/hero.jpg`,
  String(rewrite(stored, from, to)));

console.log('\nnot ours: left alone - the direction that must not break');
for (const [label, url] of [
  ['an externally hosted image', 'https://venue.example.com/poster.jpg'],
  ['a different Supabase project', 'https://other.supabase.co/storage/v1/object/public/media/x.jpg'],
  ['a different bucket', `${SB}/storage/v1/object/public/avatars/x.jpg`],
  ['already on the CDN', `${to}events/abc/hero.jpg`],
  ['null', null],
  ['empty', ''],
  ['a lookalike prefix', `${SB}/storage/v1/object/public/media-old/x.jpg`],
]) check(label, rewrite(url, from, to) === null, `got ${rewrite(url, from, to)}`);

console.log('\nrevert is the exact inverse');
const there = rewrite(stored, from, to);
check('round-trips to the original', rewrite(there, to, from) === stored, String(rewrite(there, to, from)));
check('reverting something already reverted is a no-op', rewrite(stored, to, from) === null);

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
