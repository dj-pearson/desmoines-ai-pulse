/**
 * Client-to-edge-function contract tests (XPLAT-011).
 *
 * XPLAT-001 was a SEV-1 App Store blocker with a mundane shape: the
 * delete-user-account docstring documented a two-step `{ action }` flow while
 * all three shipped clients POSTed no body at all. Nothing compared the two, so
 * the disagreement survived review and shipped.
 *
 * This asserts the comparison nobody was making: that what a function DOCUMENTS
 * it accepts, what it IMPLEMENTS, and what its clients SEND all agree.
 *
 * Deliberately offline, like the rest of supabase/functions/_tests. It reads
 * sources rather than invoking anything, so it needs no credentials and cannot
 * be broken by a production outage. That is a real limitation: it proves the
 * shapes line up, not that the endpoint works.
 *
 * XPLAT-001 IS RESOLVED as of 2026-08-22 and this test now encodes the
 * resolution. iOS routes both entry points through AccountDeletionService and
 * sends action:"request" then action:"confirm"; Android ProfileViewModel does
 * the same with buildJsonObject; the web PrivacyControls does too. The function
 * parses with `await req.json().catch(() => ({}))`, so a bodyless POST still
 * falls through to the documented legacy direct-deletion branch. Docstring,
 * implementation and all three clients agree. This test is what keeps them that
 * way.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const FUNCTIONS = new URL('../', import.meta.url);
const REPO = new URL('../../../', import.meta.url);

async function read(url: URL): Promise<string> {
  return await Deno.readTextFile(url);
}

/**
 * Functions with more than one client caller, per AC1. Each entry names the
 * clients that call it so a new caller which forgets the contract is caught by
 * the cross-client assertion below rather than at runtime on a user's phone.
 */
const MULTI_CLIENT = [
  {
    fn: 'delete-user-account/index.ts',
    // Every documented action must have a matching branch in the handler.
    documentedActions: ['request', 'confirm'],
    // Fields the handler reads out of the request body. Each client has to send
    // every one of them.
    requestFields: ['action'],
    clients: [
      'ios/DesMoinesInsider/Services/AccountDeletionService.swift',
      'android/app/src/main/java/com/desmoines/aipulse/ui/screens/profile/ProfileViewModel.kt',
      'src/components/PrivacyControls.tsx',
    ],
  },
  {
    fn: 'generate-itinerary/index.ts',
    documentedActions: [],
    requestFields: ['startDate', 'endDate', 'preferences'],
    clients: [
      'ios/DesMoinesInsider/Services/TripPlannerService.swift',
      'android/app/src/main/java/com/desmoines/aipulse/data/remote/TripPlannerRemoteDataSource.kt',
      'src/hooks/useTripPlanner.ts',
    ],
  },
  {
    fn: 'discover-chat/index.ts',
    documentedActions: [],
    requestFields: ['messages'],
    clients: [
      'ios/DesMoinesInsider/Services/AskPulseService.swift',
      'android/app/src/main/java/com/desmoines/aipulse/data/repository/AskPulseRepository.kt',
    ],
  },
  {
    fn: 'get-sponsored-pick/index.ts',
    documentedActions: [],
    requestFields: ['surface'],
    clients: [
      'ios/DesMoinesInsider/Services/SponsoredPickService.swift',
      'android/app/src/main/java/com/desmoines/aipulse/data/remote/SponsoredPickService.kt',
    ],
  },
  {
    fn: 'register-device-token/index.ts',
    documentedActions: [],
    requestFields: ['deviceToken', 'platform'],
    clients: [
      'ios/DesMoinesInsider/Services/PushNotificationService.swift',
      'android/app/src/main/java/com/desmoines/aipulse/util/PushNotificationService.kt',
    ],
  },
  {
    fn: 'log-error/index.ts',
    // No action dispatch: log-error has an `action` FIELD in the payload, which
    // is a label for the failing operation, not a branch selector.
    documentedActions: [],
    // The six every client sends. `userId` is deliberately NOT here: web sends
    // it, and both mobile clients omit it because the id they hold is a 16-char
    // hash while the handler validates a 36-char UUID and drops anything else -
    // sending it would look like attribution while attributing nothing.
    requestFields: ['message', 'component', 'action', 'route', 'severity', 'source'],
    clients: [
      'ios/DesMoinesInsider/Services/ErrorSink.swift',
      'android/app/src/main/java/com/desmoines/aipulse/util/CrashUploader.kt',
      'src/lib/errorHandler.ts',
    ],
  },
  {
    fn: 'version-check/index.ts',
    documentedActions: [],
    requestFields: ['platform', 'version'],
    clients: [
      'ios/DesMoinesInsider/Services/VersionCheckService.swift',
      'android/app/src/main/java/com/desmoines/aipulse/util/VersionCheckService.kt',
    ],
  },
];

Deno.test('documented actions each have an implemented branch', async () => {
  for (const { fn, documentedActions } of MULTI_CLIENT) {
    const src = await read(new URL(fn, FUNCTIONS));
    for (const action of documentedActions) {
      // The docstring has to actually say it...
      assert(
        new RegExp(`POST \\{ action: "${action}"`).test(src),
        `${fn}: docstring does not document action "${action}"`,
      );
      // ...and the handler has to actually branch on it. This pairing is the
      // whole point: XPLAT-001 was a docstring describing a flow the clients
      // never used.
      assert(
        new RegExp(`action === ["']${action}["']`).test(src),
        `${fn}: documents action "${action}" but no branch implements it`,
      );
    }
  }
});

Deno.test('every implemented action branch is documented', async () => {
  // The reverse direction. An undocumented branch is how a client ends up
  // guessing, which is the other half of how XPLAT-001 happened.
  for (const { fn, documentedActions } of MULTI_CLIENT) {
    const src = await read(new URL(fn, FUNCTIONS));
    const implemented = [...src.matchAll(/action === ["']([a-z_]+)["']/g)].map((m) => m[1]);
    const undocumented = [...new Set(implemented)].filter((a) => !documentedActions.includes(a));
    assertEquals(undocumented, [], `${fn}: branches on undocumented actions: ${undocumented.join(', ')}`);
  }
});

Deno.test('a bodyless POST cannot throw - the legacy path must stay reachable', async () => {
  // Shipped binaries predating the two-step flow POST no body. The docstring
  // promises they still work. `await req.json()` on an empty body REJECTS, so
  // without the catch this is a 500 for every one of them.
  const src = await read(new URL('delete-user-account/index.ts', FUNCTIONS));
  assert(
    /await req\.json\(\)\.catch\(/.test(src),
    'delete-user-account: req.json() is not guarded with .catch(). A bodyless ' +
      'POST from a shipped binary would throw, and the docstring promises the ' +
      'legacy direct-deletion path still works (XPLAT-001).',
  );
  assert(
    /Legacy: POST without an action field/.test(src),
    'delete-user-account: the legacy bodyless behaviour is no longer documented',
  );
});

/**
 * Strip line and block comments before matching.
 *
 * Learned the hard way while writing this: AccountDeletionService.swift
 * DOCUMENTS the contract in a header comment ("POST { action: \"request\" }"),
 * so a naive whole-file regex matched the comment and passed even after the
 * real call site was gutted. A contract test that reads documentation instead
 * of implementation has the exact defect it exists to catch.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');
}

Deno.test('every client sends the documented action field', async () => {
  // The assertion that would have caught XPLAT-001 outright.
  // Only the entries that document an action flow. The other five have no
  // actions; their contract is the field check below.
  for (const { fn, clients, documentedActions } of MULTI_CLIENT) {
    if (documentedActions.length === 0) continue;
    for (const client of clients) {
      let raw: string;
      try {
        raw = await read(new URL(client, REPO));
      } catch {
        throw new Error(
          `${fn}: client ${client} is listed as a caller but the file is missing. ` +
            'If it moved, update MULTI_CLIENT so this contract keeps being checked.',
        );
      }
      const src = stripComments(raw);
      assert(
        /["']?action["']?\s*[:=]\s*["']request["']/.test(src) ||
          /put\("action",\s*"request"\)/.test(src),
        `${client} calls ${fn} but never sends action:"request". This is exactly ` +
          'the XPLAT-001 defect: three clients POSTing no body against a docstring ' +
          'documenting a two-step flow.',
      );
      assert(
        /["']?action["']?\s*[:=]\s*["']confirm["']/.test(src) ||
          /put\("action",\s*"confirm"\)/.test(src),
        `${client} calls ${fn} but never sends action:"confirm"`,
      );
    }
  }
});

/**
 * AC1, the field half: what the function READS out of the body, every client
 * must SEND.
 *
 * The action check above only fits delete-user-account. Five of the six
 * multi-client functions have no action flow at all -- their contract is a set
 * of field names, and a client that omits one gets a 400 or a silently degraded
 * response rather than a crash, which is harder to notice than XPLAT-001 was.
 *
 * Matching is by field NAME, which is deliberately loose: iOS sends Swift
 * Encodable structs, Android builds JsonObjects and the web passes an object
 * literal, so there is no shared syntax to assert on. A name that appears
 * nowhere in the caller is still conclusive -- it cannot be being sent.
 */
Deno.test('every client sends every field the function reads', async () => {
  for (const { fn, requestFields, clients } of MULTI_CLIENT) {
    if (requestFields.length === 0) continue;

    const fnSrc = await read(new URL(fn, FUNCTIONS));
    for (const field of requestFields) {
      // The function must genuinely read it, or the list has gone stale and is
      // asserting a contract nobody implements.
      assert(
        new RegExp(`\\b${field}\\b`).test(stripComments(fnSrc)),
        `${fn}: requestFields lists "${field}" but the handler never reads it`,
      );
    }

    for (const client of clients) {
      const src = stripComments(await read(new URL(client, REPO)));
      for (const field of requestFields) {
        assert(
          new RegExp(`\\b${field}\\b`).test(src),
          `${client} calls ${fn} but never mentions "${field}", which the ` +
            'handler reads out of the request body.',
        );
      }
    }
  }
});

/**
 * The assertion that keeps MULTI_CLIENT from going stale, which is the real
 * risk to AC1: a hand-maintained list of contracts silently stops covering the
 * thing it was written for.
 *
 * Scans the three client trees for edge-function invocations and requires every
 * function called from more than one platform to be listed above. Each platform
 * has its own call syntax and all three are matched:
 *     web      supabase.functions.invoke('name', ...)
 *     iOS      client.functions.invoke(  "name",   -- name on the next line
 *     Android  client.functions(         "name",   -- a call, not .invoke
 * plus a raw /functions/v1/<name> URL anywhere.
 *
 * The Android form is why this matters. A scan written for `.invoke(` alone
 * finds two multi-client functions; adding the Kotlin call form finds six.
 */
Deno.test('every multi-platform edge function is covered by MULTI_CLIENT', async () => {
  const CLIENT_ROOTS: Record<string, string> = { web: 'src', ios: 'ios', android: 'android' };
  const CODE = /\.(ts|tsx|swift|kt)$/;
  const CALL =
    /functions\/v1\/([a-z0-9-]+)|invoke\(\s*["']([a-z0-9-]+)["']|functions\(\s*["']([a-z0-9-]+)["']/g;

  const knownFunctions = new Set<string>();
  for await (const entry of Deno.readDir(FUNCTIONS)) {
    if (entry.isDirectory && !entry.name.startsWith('_')) knownFunctions.add(entry.name);
  }

  async function* walk(dir: URL): AsyncGenerator<URL> {
    for await (const entry of Deno.readDir(dir)) {
      const child = new URL(`${entry.name}${entry.isDirectory ? '/' : ''}`, dir);
      if (entry.isDirectory) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        yield* walk(child);
      } else if (CODE.test(entry.name)) {
        yield child;
      }
    }
  }

  const platformsByFn = new Map<string, Set<string>>();
  for (const [platform, root] of Object.entries(CLIENT_ROOTS)) {
    for await (const file of walk(new URL(`${root}/`, REPO))) {
      const src = await read(file);
      for (const m of src.matchAll(CALL)) {
        const name = m[1] ?? m[2] ?? m[3];
        if (!knownFunctions.has(name)) continue;
        if (!platformsByFn.has(name)) platformsByFn.set(name, new Set());
        platformsByFn.get(name)!.add(platform);
      }
    }
  }

  const covered = new Set(MULTI_CLIENT.map((e) => e.fn.replace('/index.ts', '')));
  const missing = [...platformsByFn.entries()]
    .filter(([name, platforms]) => platforms.size > 1 && !covered.has(name))
    .map(([name, platforms]) => `${name} (${[...platforms].sort().join(', ')})`)
    .sort();

  assertEquals(
    missing,
    [],
    'These edge functions are called from more than one client platform and have ' +
      'no contract entry. Add them to MULTI_CLIENT with the fields their handler ' +
      'reads:\n  ' + missing.join('\n  '),
  );
});
