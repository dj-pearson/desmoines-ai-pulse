/**
 * IOS-DD-PLATFORM-18: log-error only lets internal callers claim
 * source "edge", and error-triage opens at most MAX_NEW_TASKS_PER_RUN tasks
 * per run. Offline; pure functions only.
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  MAX_NEW_TASKS_PER_RUN,
  pickClustersToCreate,
  resolveSource,
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
