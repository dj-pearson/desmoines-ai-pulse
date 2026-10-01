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
  // What matters is that the two arrays are the SAME one, not what it is
  // called: FreeEvents moved from freeEvents to a capped visibleEvents for
  // both, which kept the invariant and broke a test that pinned the name.
  const pages = [
    'src/pages/FreeEvents.tsx',
    'src/pages/KidsEvents.tsx',
    'src/pages/DateNightEvents.tsx',
    'src/pages/EventsByLocation.tsx',
    'src/pages/EventsToday.tsx',
  ];
  for (const page of pages) {
    const src = await read(page);
    const batch =
      src.match(/const batchSocialIds = useMemo\(\(\) => \((\w+) \?\? \[\]\)/) ??
      src.match(/const batchSocialIds = useMemo\(\(\) => (\w+)\.map\(\(\w+\) => \w+\.id\)/);
    assert(batch, `${page} must derive batchSocialIds from the array it renders`);
    const arr = batch[1];
    // EventsToday renders by group; its array is exactly the groups flattened.
    const flattenedGroups =
      new RegExp(`const ${arr} = useMemo\\(\\(\\) => groups\\.flatMap\\(\\(group\\) => group\\.events\\)`).test(src) &&
      /\{group\.events\.map\(\(event\) => /.test(src);
    assert(
      new RegExp(`\\{${arr}\\.map\\(\\(event(?:, \\w+)?\\) => \\(`).test(src) || flattenedGroups,
      `${page} keys the batch on ${arr} but does not render from it`,
    );
  }

  // This one renders by day, with past days collapsed. The batch has to cover
  // exactly the days that are open, events and still-running alike.
  const weekend = await read('src/pages/EventsThisWeekend.tsx');
  assert(
    /const batchSocialIds = useMemo\(\(\) => renderedEvents\.map\(\(e\) => e\.id\)/.test(weekend),
    'EventsThisWeekend must batch the events it renders',
  );
  assert(
    /\.filter\(\(day\) => day\.phase !== "past" \|\| openPast\.has\(day\.id\)\)\s*\.flatMap\(\(day\) => \[\.\.\.day\.events, \.\.\.day\.running\]\)/.test(weekend),
    'renderedEvents must be the open days, events and running both',
  );
  assert(/\{day\.events\.map\(/.test(weekend) && /\{day\.running\.map\(/.test(weekend));
});
