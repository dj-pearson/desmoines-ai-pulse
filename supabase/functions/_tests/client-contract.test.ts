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
    clients: [
      'ios/DesMoinesInsider/Services/AccountDeletionService.swift',
      'android/app/src/main/java/com/desmoines/aipulse/ui/screens/profile/ProfileViewModel.kt',
      'src/components/PrivacyControls.tsx',
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
  for (const { fn, clients } of MULTI_CLIENT) {
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
