/**
 * Storage purge on account deletion (WEB-LEGAL-003).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/purge-user-storage.test.ts
 *
 * WHY THESE CASES
 * The obvious implementation - list(userId), remove(what came back) - passes a
 * casual review and deletes almost nothing, because four of the five buckets
 * nest under the user folder and Supabase's list() returns only immediate
 * children. It also silently strands anything past the first 100 entries. Both
 * failures look like success: no error, no files. So the fake client below
 * models real list() semantics (folders carry a null id, pages are capped) and
 * the tests assert on which paths were actually handed to remove().
 */

import {
  assertEquals,
  assert,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { purgeUserStorage, USER_UPLOAD_BUCKETS } from '../_shared/purgeUserStorage.ts';

const PAGE = 100;
const USER = 'user-abc';

interface FakeOpts {
  /** bucket -> full object paths that exist in it */
  files: Record<string, string[]>;
  /** buckets whose list() should fail */
  listFails?: Record<string, string>;
  /** buckets whose remove() should fail */
  removeFails?: Record<string, string>;
}

/** Models Supabase storage list()/remove() closely enough to catch the real bugs. */
function fakeClient(opts: FakeOpts) {
  const removed: Record<string, string[]> = {};

  return {
    removed,
    storage: {
      from(bucket: string) {
        return {
          // deno-lint-ignore no-explicit-any
          list(prefix: string, { limit, offset }: any) {
            if (opts.listFails?.[bucket]) {
              return Promise.resolve({ data: null, error: { message: opts.listFails[bucket] } });
            }
            const all = opts.files[bucket] ?? [];
            const base = prefix ? `${prefix}/` : '';
            const names = new Map<string, boolean>(); // name -> isFolder
            for (const path of all) {
              if (!path.startsWith(base)) continue;
              const rest = path.slice(base.length);
              if (!rest) continue;
              const slash = rest.indexOf('/');
              if (slash === -1) names.set(rest, false);
              else names.set(rest.slice(0, slash), true);
            }
            const entries = [...names.entries()]
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([name, isFolder]) => ({ name, id: isFolder ? null : `id-${name}` }));
            return Promise.resolve({
              data: entries.slice(offset, offset + limit),
              error: null,
            });
          },
          remove(paths: string[]) {
            if (opts.removeFails?.[bucket]) {
              return Promise.resolve({ data: null, error: { message: opts.removeFails[bucket] } });
            }
            (removed[bucket] ??= []).push(...paths);
            return Promise.resolve({ data: paths, error: null });
          },
        };
      },
    },
  };
}

Deno.test('every user-writable bucket is covered, and ad-creatives is not', () => {
  assertEquals([...USER_UPLOAD_BUCKETS].sort(), [
    'event-photos',
    'media',
    'review-photos',
    'thumbnails',
    'videos',
  ]);
  assert(
    !(USER_UPLOAD_BUCKETS as readonly string[]).includes('ad-creatives'),
    'ad-creatives is excluded on purpose; see purgeUserStorage.ts',
  );
});

Deno.test('removes flat files (review-photos layout)', async () => {
  const c = fakeClient({ files: { 'review-photos': [`${USER}/a.jpg`, `${USER}/b.jpg`] } });
  const results = await purgeUserStorage(c, USER);
  assertEquals(c.removed['review-photos']?.sort(), [`${USER}/a.jpg`, `${USER}/b.jpg`]);
  assertEquals(results.find((r) => r.bucket === 'review-photos')?.removed, 2);
});

Deno.test('recurses into nested folders (event-photos / media / videos layout)', async () => {
  const c = fakeClient({
    files: {
      'event-photos': [`${USER}/event-1/1.jpg`, `${USER}/event-1/2.jpg`, `${USER}/event-2/3.jpg`],
      'media': [`${USER}/gallery/x.png`],
      'videos': [`${USER}/clips/v.mp4`],
      'thumbnails': [`${USER}/clips/v_thumb.jpg`],
    },
  });
  await purgeUserStorage(c, USER);
  assertEquals(c.removed['event-photos']?.length, 3, 'a flat list() would have removed 0 here');
  assertEquals(c.removed['media'], [`${USER}/gallery/x.png`]);
  assertEquals(c.removed['videos'], [`${USER}/clips/v.mp4`]);
  assertEquals(c.removed['thumbnails'], [`${USER}/clips/v_thumb.jpg`]);
});

Deno.test('pages past the list() limit instead of stranding the remainder', async () => {
  const many = Array.from({ length: PAGE * 2 + 7 }, (_, i) => `${USER}/p${String(i).padStart(4, '0')}.jpg`);
  const c = fakeClient({ files: { 'review-photos': many } });
  const results = await purgeUserStorage(c, USER);
  assertEquals(c.removed['review-photos']?.length, many.length);
  assertEquals(results.find((r) => r.bucket === 'review-photos')?.removed, many.length);
});

Deno.test('never touches another user\'s files', async () => {
  const c = fakeClient({
    files: { 'review-photos': [`${USER}/mine.jpg`, 'someone-else/theirs.jpg'] },
  });
  await purgeUserStorage(c, USER);
  assertEquals(c.removed['review-photos'], [`${USER}/mine.jpg`]);
});

Deno.test('one failing bucket does not abort the others', async () => {
  const c = fakeClient({
    files: {
      'review-photos': [`${USER}/a.jpg`],
      'event-photos': [`${USER}/e/1.jpg`],
      'media': [`${USER}/m/x.png`],
    },
    listFails: { 'event-photos': 'bucket unavailable' },
  });
  const results = await purgeUserStorage(c, USER);
  assertEquals(c.removed['review-photos'], [`${USER}/a.jpg`]);
  assertEquals(c.removed['media'], [`${USER}/m/x.png`]);
  const failed = results.find((r) => r.bucket === 'event-photos');
  assertEquals(failed?.removed, 0);
  assertEquals(failed?.error, 'bucket unavailable');
});

Deno.test('a remove() failure is reported, not swallowed', async () => {
  const c = fakeClient({
    files: { 'review-photos': [`${USER}/a.jpg`] },
    removeFails: { 'review-photos': 'permission denied' },
  });
  const results = await purgeUserStorage(c, USER);
  const r = results.find((x) => x.bucket === 'review-photos');
  assertEquals(r?.removed, 0);
  assertEquals(r?.error, 'permission denied');
});

Deno.test('an empty account purges cleanly and reports zero', async () => {
  const c = fakeClient({ files: {} });
  const results = await purgeUserStorage(c, USER);
  assertEquals(results.length, USER_UPLOAD_BUCKETS.length);
  assert(results.every((r) => r.removed === 0 && !r.error));
});
