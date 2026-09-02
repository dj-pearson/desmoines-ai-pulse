/**
 * Event social fan-out (WEB-PERF-030).
 *
 * SocialEventCard falls back to useEventSocial(event.id) whenever a page does
 * not hand it batch data, and that hook ran three queries and opened three
 * postgres_changes channels per event. Six landing pages passed nothing, and
 * FreeEvents and KidsEvents fetch up to 100 events each, so a single anonymous
 * visit could issue three hundred queries and open three hundred subscriptions
 * -- for a preview that visitor cannot interact with, because posting requires
 * an account.
 *
 * Two things have to hold, and one of them is the durable fix: every page feeds
 * the card batch data, AND the hook refuses to open sockets unless a caller
 * asks and a user is signed in. The second is what stops the next page that
 * renders this card from reintroducing the problem.
 */

import { assert, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

/** Every page that renders SocialEventCard in a list. */
const LANDING_PAGES = [
  'src/pages/FreeEvents.tsx',
  'src/pages/KidsEvents.tsx',
  'src/pages/DateNightEvents.tsx',
  'src/pages/EventsByLocation.tsx',
  'src/pages/EventsToday.tsx',
  'src/pages/EventsThisWeekend.tsx',
];

Deno.test('realtime is opt-in, so the card fallback can never open a socket', async () => {
  const hook = await read('src/hooks/useEventSocial.ts');

  assert(
    /options: \{ realtime\?: boolean \} = \{\},/.test(hook),
    'the hook must take an explicit opt-in',
  );
  assert(
    /const realtimeEnabled = options\.realtime === true && !!user;/.test(hook),
    'and it must require BOTH the opt-in and a signed-in user',
  );
  assert(
    /if \(!eventId \|\| !realtimeEnabled\) return;/.test(hook),
    'the subscription effect must bail out when it is not enabled',
  );
  assert(/\}, \[eventId, realtimeEnabled\]\);/.test(hook), 'and re-run when that changes');

  // Defaulting to on is the shape of the original bug.
  assertFalse(
    /realtime\?: boolean \} = \{ realtime: true \}/.test(hook),
    'the default must be off',
  );
});

Deno.test('only the expanded, interactive surface opts in', async () => {
  const hub = await read('src/components/EventSocialHub.tsx');
  assert(
    /useEventSocial\(eventId, \{ realtime: true \}\)/.test(hub),
    'EventSocialHub is where a live view is actually rendered',
  );

  const card = await read('src/components/SocialEventCard.tsx');
  assertFalse(
    /realtime: true/.test(card),
    'a card preview must never subscribe: it shows a snapshot',
  );
});

Deno.test('every landing page hands the card batch data', async () => {
  for (const page of LANDING_PAGES) {
    const src = await read(page);
    assert(
      /useBatchEventSocial\(batchSocialIds\)/.test(src),
      `${page} must batch its social data`,
    );
    assert(
      /socialData=\{batchSocialData\?\.\[event\.id\]\}/.test(src),
      `${page} must pass the batch row to the card`,
    );
    assert(
      /socialDataPending=\{batchSocialPending\}/.test(src),
      `${page} must pass the pending flag, or the card fetches individually while the batch is in flight`,
    );
  }
});

Deno.test('no landing page renders the card bare any more', async () => {
  // The exact shape that produced the fan-out, on all six pages.
  for (const page of LANDING_PAGES) {
    const src = await read(page);
    assertFalse(
      /<SocialEventCard key=\{event\.id\} event=\{event\} onViewDetails=\{\(\) => \{\}\} \/>/.test(src),
      `${page} still renders SocialEventCard without batch data`,
    );
  }
});

Deno.test('the card only falls back when there is genuinely nothing batched', async () => {
  const card = await read('src/components/SocialEventCard.tsx');
  // Passing '' disables the hook. Both conditions matter: without the pending
  // check, every card fetches individually for as long as the batch is in
  // flight, which is most of the page load.
  assert(
    /useEventSocial\(socialData \|\| socialDataPending \? '' : event\.id\)/.test(card),
    'the fallback must be disabled while batch data is present OR pending',
  );
});

Deno.test('the ids fed to the batch are the ids that get rendered', async () => {
  // A mismatch here is silent: the batch returns rows for events the page does
  // not show, and every card it does show falls back to an individual fetch.
  const pairs: Array<[string, string]> = [
    ['src/pages/FreeEvents.tsx', 'freeEvents'],
    ['src/pages/KidsEvents.tsx', 'kidsEvents'],
    ['src/pages/DateNightEvents.tsx', 'dateEvents'],
    ['src/pages/EventsByLocation.tsx', 'visibleEvents'],
    ['src/pages/EventsToday.tsx', 'todaysEvents'],
  ];
  for (const [page, arr] of pairs) {
    const src = await read(page);
    assert(
      new RegExp(`const batchSocialIds = useMemo\\(\\(\\) => \\(${arr} \\?\\? \\[\\]\\)`).test(src),
      `${page} must key the batch on ${arr}, the array it maps over`,
    );
    assert(
      new RegExp(`\\{${arr}\\.map\\(\\(event\\) => \\(`).test(src),
      `${page} must still render from ${arr}`,
    );
  }

  // This one caps the rendered list, so the batch has to cap identically.
  const weekend = await read('src/pages/EventsThisWeekend.tsx');
  assert(
    /const batchSocialIds = useMemo\(\(\) => \(filteredEvents\.slice\(0, VISIBLE_EVENTS\) \?\? \[\]\)/.test(weekend),
    'EventsThisWeekend renders a slice, so the batch must use the same slice',
  );
});
