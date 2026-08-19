/**
 * Request contracts for the edge functions more than one client calls
 * (XPLAT-011, AC1).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/multi-client-contract.test.ts
 *
 * WHY THESE FOUR. A function with one caller cannot drift - the caller and the
 * server move together. Drift needs two clients that ship on different
 * schedules, which is exactly what broke account deletion (XPLAT-001): the
 * server grew a required field, web was updated, and both mobile binaries kept
 * POSTing the old shape until an App Store reviewer found it.
 *
 * Enumerating every invoke() name across src/, ios/ and android/ gives six
 * functions with callers on more than one surface. Two already have a contract
 * test - delete-user-account (account-deletion-contract.test.ts) and
 * version-check (version-check.test.ts). These are the other four:
 *
 *   discover-chat          ios + android
 *   generate-itinerary     web + ios + android
 *   get-sponsored-pick     ios + android
 *   register-device-token  ios + android
 *
 * WHAT IT ASSERTS, AND WHAT IT CANNOT. This is a static read of source on both
 * sides - no network, no Supabase, no simulator - so it runs on every PR rather
 * than only when someone builds the apps. It catches the drift that actually
 * happens: a field one client sends that the server never reads (a silent
 * no-op), and a field the server rejects the request without that some client
 * does not send (a hard 400 on one platform only). It cannot catch a type
 * mismatch inside a field, and it is not a substitute for running the function.
 *
 * IMPORTS node:assert RATHER THAN deno.land/std, unlike its siblings in this
 * directory. It needs no network fetch to run, which means it also runs in a
 * sandbox with no route to deno.land. Deno resolves node: specifiers natively;
 * nothing extra is installed.
 */

import assert from 'node:assert/strict';

const read = (rel: string) => Deno.readTextFile(new URL(rel, import.meta.url));

const SERVER = (name: string) => `../${name}/index.ts`;
const IOS = (rel: string) => `../../../ios/DesMoinesInsider/${rel}`;
const ANDROID = (rel: string) =>
  `../../../android/app/src/main/java/com/desmoines/aipulse/${rel}`;
const WEB = (rel: string) => `../../../src/${rel}`;

/** Assert `needle` appears in `haystack`, with a message that says why it matters. */
function includes(haystack: string, needle: string, why: string) {
  assert.ok(
    haystack.includes(needle),
    `${why}\n  expected to find: ${needle}`,
  );
}

// -----------------------------------------------------------------------------
// discover-chat  (ios + android)
// -----------------------------------------------------------------------------

Deno.test('discover-chat: both clients send messages, and the server requires it', async () => {
  const server = await read(SERVER('discover-chat'));
  const ios = await read(IOS('Services/AskPulseService.swift'));
  const android = await read(ANDROID('data/repository/AskPulseRepository.kt'));

  includes(
    server,
    "return new Response(JSON.stringify({ error: 'messages required' })",
    'the server rejects a request with no usable messages, so every client must send them',
  );
  includes(server, 'payload.messages', 'the server must read the field the clients send');
  includes(ios, 'let messages: [RequestMessage]', 'iOS payload must carry messages');
  includes(android, 'putJsonArray("messages")', 'Android payload must carry messages');
});

Deno.test('discover-chat: userLocation is sent by both clients and read by the server', async () => {
  const server = await read(SERVER('discover-chat'));
  const ios = await read(IOS('Services/AskPulseService.swift'));
  const android = await read(ANDROID('data/repository/AskPulseRepository.kt'));

  includes(ios, 'let userLocation: LocationPayload?', 'iOS sends userLocation');
  includes(android, 'putJsonObject("userLocation")', 'Android sends userLocation');
  includes(
    server,
    'payload.userLocation',
    'both clients send userLocation; a server that stopped reading it would silently ignore location without any client noticing',
  );
  for (const key of ['latitude', 'longitude']) {
    includes(server, key, `the server must read userLocation.${key}`);
    includes(ios, key, `iOS must send userLocation.${key}`);
    includes(android, key, `Android must send userLocation.${key}`);
  }
});

// -----------------------------------------------------------------------------
// generate-itinerary  (web + ios + android)
// -----------------------------------------------------------------------------

Deno.test('generate-itinerary: all three clients send the fields the server destructures', async () => {
  const server = await read(SERVER('generate-itinerary'));
  const web = await read(WEB('hooks/useTripPlanner.ts'));
  const ios = await read(IOS('Services/TripPlannerService.swift'));
  const android = await read(ANDROID('data/remote/TripPlannerRemoteDataSource.kt'));

  includes(server, ': TripPlannerRequest = await req.json()', 'the server parses a typed request');

  includes(web, 'body: { startDate, endDate, preferences }', 'web sends the three top-level fields');
  includes(ios, 'let startDate: String', 'iOS sends startDate');
  includes(ios, 'let endDate: String', 'iOS sends endDate');
  includes(ios, 'let preferences: TripPreferences', 'iOS sends preferences');
  includes(android, 'put("startDate", startDate)', 'Android sends startDate');
  includes(android, 'put("endDate", endDate)', 'Android sends endDate');
  includes(android, 'putJsonObject("preferences")', 'Android sends preferences');
});

Deno.test('generate-itinerary: every preference key Android sends exists on the server interface', async () => {
  const server = await read(SERVER('generate-itinerary'));
  const android = await read(ANDROID('data/remote/TripPlannerRemoteDataSource.kt'));

  // Android is the only client that builds the preferences object key by key,
  // so it is the one that can add a key the server never reads. Extract the
  // server's declared preference fields and require Android's keys to be a
  // subset - a key outside that set is accepted, ignored, and invisible.
  const block = server.match(/interface TripPlannerRequest \{[\s\S]*?\n\}/);
  assert.ok(block, 'TripPlannerRequest interface not found - did the server change shape?');
  const serverKeys = new Set(
    [...block[0].matchAll(/^\s{4}([A-Za-z0-9_]+)\??:/gm)].map((m) => m[1]),
  );
  assert.ok(serverKeys.size > 0, 'parsed no preference keys off TripPlannerRequest');

  const prefsBlock = android.match(/putJsonObject\("preferences"\) \{[\s\S]*?\n {12}\}/);
  assert.ok(prefsBlock, 'Android preferences block not found');
  const androidKeys = [
    ...prefsBlock[0].matchAll(/put(?:JsonArray)?\("([A-Za-z0-9_]+)"/g),
  ].map((m) => m[1]);
  assert.ok(androidKeys.length > 0, 'parsed no preference keys off the Android payload');

  const unread = androidKeys.filter((k) => !serverKeys.has(k));
  assert.deepEqual(
    unread,
    [],
    `Android sends preference key(s) generate-itinerary never reads: ${unread.join(', ')}. ` +
      `The request succeeds and the setting is silently dropped. Add the field to ` +
      `TripPlannerRequest.preferences, or stop sending it.`,
  );
});

// -----------------------------------------------------------------------------
// get-sponsored-pick  (ios + android)
// -----------------------------------------------------------------------------

Deno.test('get-sponsored-pick: the surface values the clients send are the ones the server accepts', async () => {
  const server = await read(SERVER('get-sponsored-pick'));
  const ios = await read(IOS('Services/SponsoredPickService.swift'));
  const android = await read(ANDROID('data/remote/SponsoredPickService.kt'));

  const valid = server.match(/const VALID_SURFACES: Surface\[\] = \[([^\]]+)\]/);
  assert.ok(valid, 'VALID_SURFACES not found on the server');
  const accepted = [...valid[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(accepted.length > 0, 'parsed no surfaces off VALID_SURFACES');

  // A surface the server does not accept is a 400 on that platform only.
  for (const [name, source, re] of [
    ['iOS', ios, /case \w+ = "([a-z_]+)"/g],
    ['Android', android, /const val [A-Z_]+ = "([a-z_]+)"/g],
  ] as const) {
    const sent = [...source.matchAll(re)].map((m) => m[1]);
    assert.ok(sent.length > 0, `parsed no surface literals out of the ${name} client`);
    const rejected = sent.filter((s) => !accepted.includes(s));
    assert.deepEqual(
      rejected,
      [],
      `${name} can send surface(s) get-sponsored-pick rejects with 400: ${rejected.join(', ')}. ` +
        `Accepted: ${accepted.join(', ')}.`,
    );
  }
});

Deno.test('get-sponsored-pick: surface is required and both clients send it', async () => {
  const server = await read(SERVER('get-sponsored-pick'));
  const ios = await read(IOS('Services/SponsoredPickService.swift'));
  const android = await read(ANDROID('data/remote/SponsoredPickService.kt'));

  includes(
    server,
    "return json({ error: 'Valid surface required' }, 400)",
    'the server rejects a missing surface, so every client must send one',
  );
  includes(ios, 'let surface: String', 'iOS payload must carry surface');
  includes(android, 'put("surface", surface)', 'Android payload must carry surface');
  includes(server, 'payload.query', 'both clients send an optional query; the server must read it');
});

// -----------------------------------------------------------------------------
// register-device-token  (ios + android)
// -----------------------------------------------------------------------------

Deno.test('register-device-token: each client sends a platform the server accepts', async () => {
  const server = await read(SERVER('register-device-token'));
  const ios = await read(IOS('Services/PushNotificationService.swift'));
  const android = await read(ANDROID('util/PushNotificationService.kt'));

  const valid = server.match(/const VALID_PLATFORMS = \[([^\]]+)\]/);
  assert.ok(valid, 'VALID_PLATFORMS not found on the server');
  const accepted = [...valid[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

  // Each client hardcodes its own platform string. If the server's allowlist
  // ever narrows, push registration dies silently on the excluded platform -
  // both call sites swallow the failure into a log line.
  includes(ios, 'platform: "ios"', 'iOS must identify itself as ios');
  includes(android, 'put("platform", "android")', 'Android must identify itself as android');
  for (const platform of ['ios', 'android']) {
    assert.ok(
      accepted.includes(platform),
      `register-device-token no longer accepts platform "${platform}", but that client still sends it. ` +
        `Accepted: ${accepted.join(', ')}.`,
    );
  }
});

Deno.test('register-device-token: deviceToken is required and both clients send it', async () => {
  const server = await read(SERVER('register-device-token'));
  const ios = await read(IOS('Services/PushNotificationService.swift'));
  const android = await read(ANDROID('util/PushNotificationService.kt'));

  includes(
    server,
    'const { deviceToken, platform } = body',
    'the server reads exactly these two fields',
  );
  includes(
    server,
    'deviceToken is required and must be a non-empty string',
    'the server 400s without deviceToken',
  );
  includes(ios, 'let deviceToken: String', 'iOS payload must carry deviceToken');
  includes(android, 'put("deviceToken", tokenToSync)', 'Android payload must carry deviceToken');
});
