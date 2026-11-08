/**
 * IOS-DD-PLATFORM-18: log-error only lets internal callers claim
 * source "edge", and error-triage opens at most MAX_NEW_TASKS_PER_RUN tasks
 * per run. Offline; pure functions only.
 */
import { assertEquals } from 'jsr:@std/assert@1';
import {
  MAX_NEW_TASKS_PER_RUN,
  pickClustersToCreate,
  resolveErrorUserId,
  resolveSource,
  shouldVerifyBearer,
} from '../_shared/errorPolicy.ts';

Deno.test('a public caller claiming source edge is stored as client', () => {
  assertEquals(resolveSource('edge', false), 'client');
  assertEquals(resolveSource('edge', true), 'edge');
  assertEquals(resolveSource('client', true), 'client');
  assertEquals(resolveSource(undefined, true), 'client');
});

Deno.test('forty new clusters create twenty-five tasks, most frequent first', () => {
  const clusters = Array.from({ length: 40 }, (_, i) => ({ key: `error:s${i}`, frequency: i }));
  const picked = pickClustersToCreate(clusters, new Set(), MAX_NEW_TASKS_PER_RUN);
  assertEquals(MAX_NEW_TASKS_PER_RUN, 25);
  assertEquals(picked.length, 25);
  assertEquals(picked[0], 'error:s39');
  assertEquals(picked[24], 'error:s15');
});

Deno.test('clusters with an open task are not created again and do not use the cap', () => {
  const clusters = [
    { key: 'error:a', frequency: 9 },
    { key: 'error:b', frequency: 5 },
    { key: 'error:c', frequency: 1 },
  ];
  assertEquals(pickClustersToCreate(clusters, new Set(['error:a']), 2), ['error:b', 'error:c']);
});

// WEB-SEC-063: user_id comes from a verified session or a machine caller.
const VICTIM = '11111111-2222-4333-8444-555555555555';
const SIGNED_IN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

Deno.test('an anonymous request naming a foreign userId stores user_id null', () => {
  assertEquals(resolveErrorUserId(VICTIM, { internal: false, verifiedUserId: null }), null);
});

Deno.test('a signed-in caller is stored as themselves, whatever body.userId says', () => {
  assertEquals(resolveErrorUserId(VICTIM, { internal: false, verifiedUserId: SIGNED_IN }), SIGNED_IN);
  assertEquals(resolveErrorUserId(undefined, { internal: false, verifiedUserId: SIGNED_IN }), SIGNED_IN);
});

Deno.test('a machine caller may attribute to the user it names, if the id is well formed', () => {
  assertEquals(resolveErrorUserId(VICTIM, { internal: true, verifiedUserId: null }), VICTIM);
  assertEquals(resolveErrorUserId('not-a-uuid', { internal: true, verifiedUserId: null }), null);
  assertEquals(resolveErrorUserId(42, { internal: true, verifiedUserId: null }), null);
});

Deno.test('the anon key and a missing bearer are not sent to auth.getUser', () => {
  assertEquals(shouldVerifyBearer(undefined, 'anon'), false);
  assertEquals(shouldVerifyBearer('', 'anon'), false);
  assertEquals(shouldVerifyBearer('anon', 'anon'), false);
  assertEquals(shouldVerifyBearer('user.jwt.token', 'anon'), true);
  assertEquals(shouldVerifyBearer('user.jwt.token', undefined), true);
});

Deno.test('log-error reads body.userId only through resolveErrorUserId', async () => {
  const src = await Deno.readTextFile(new URL('../log-error/index.ts', import.meta.url));
  const reads = src.match(/body\.userId/g) ?? [];
  assertEquals(reads.length, 1, 'body.userId should be read in exactly one place');
  assertEquals(/resolveErrorUserId\(body\.userId,/.test(src), true);
  assertEquals(/user_id:\s*userId\b/.test(src), true);
});
