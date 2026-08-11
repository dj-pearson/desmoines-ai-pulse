/**
 * Account-deletion client/server contract (XPLAT-001, AC6).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/account-deletion-contract.test.ts
 *
 * WHAT WENT WRONG, AND WHY THIS TEST EXISTS
 * SEC-025 turned delete-user-account into a two-step flow — POST
 * {action:"request"} for a token, then POST {action:"confirm", confirmation_token}.
 * Neither mobile client was changed. Both kept POSTing an empty body, which the
 * new server rejected with 400, so account deletion was silently broken on every
 * shipped iOS and Android binary. That is an App Store Review 5.1.1(v)
 * violation, and nothing in the repo noticed for the entire time it was live.
 *
 * The drift was possible because the contract lived in three files that never
 * referenced each other. This test is the reference: it reads all three and
 * fails if they stop agreeing. It is deliberately static — no network, no
 * Supabase, no simulator — so it runs on every PR in the same lane as the other
 * edge-function tests rather than only when someone builds the apps.
 *
 * Wired into .github/workflows/subscription-sync-tests.yml.
 */

import { assert, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const read = (rel: string) => Deno.readTextFile(new URL(rel, import.meta.url));

const SERVER = '../delete-user-account/index.ts';
const IOS_SERVICE = '../../../ios/DesMoinesInsider/Services/AccountDeletionService.swift';
const IOS_VIEWMODEL = '../../../ios/DesMoinesInsider/ViewModels/ProfileViewModel.swift';
const IOS_SETTINGS = '../../../ios/DesMoinesInsider/Views/Profile/SettingsView.swift';
const ANDROID_VIEWMODEL =
  '../../../android/app/src/main/java/com/desmoines/aipulse/ui/screens/profile/ProfileViewModel.kt';

// -----------------------------------------------------------------------------
// 1. The server still speaks both steps
// -----------------------------------------------------------------------------

Deno.test('server handles action=request and returns confirmation_token', async () => {
  const source = await read(SERVER);
  assertStringIncludes(source, 'action === "request"');
  assertStringIncludes(
    source,
    'confirmation_token: confirmationToken',
    'the request step must return the token under the snake_case key the clients decode',
  );
});

Deno.test('server handles action=confirm and validates the token before deleting', async () => {
  const source = await read(SERVER);
  assertStringIncludes(source, 'action === "confirm"');
  assert(
    /\.eq\("token", confirmation_token\)/.test(source),
    'the confirm step must look the token up rather than trusting the caller',
  );
});

// -----------------------------------------------------------------------------
// 2. The legacy no-body branch survives until MIN_SUPPORTED_APP_VERSION drops it
// -----------------------------------------------------------------------------

Deno.test('server still accepts the legacy no-action body shipped binaries send', async () => {
  const source = await read(SERVER);
  assert(
    /action === undefined \|\| action === null/.test(source),
    'Removing the legacy branch breaks account deletion on every binary that ' +
      'predates the two-step flow. Per the CLAUDE.md deprecation flow, bump ' +
      'MIN_SUPPORTED_APP_VERSION to exclude those binaries first, then delete ' +
      'this test case in the same change.',
  );
});

Deno.test('the docstring describes the branches that actually exist', async () => {
  const source = await read(SERVER);
  const docstring = source.slice(0, source.indexOf('import '));
  // The docstring claimed a legacy branch for months while the code returned
  // 400 for that exact request. Keeping them in sync is the cheap half of the fix.
  for (const claim of ['action: "request"', 'action: "confirm"', 'Legacy']) {
    assertStringIncludes(docstring, claim);
  }
});

// -----------------------------------------------------------------------------
// 3. Both clients speak the two-step flow
// -----------------------------------------------------------------------------

Deno.test('iOS sends request then confirm with the snake_case token key', async () => {
  const source = await read(IOS_SERVICE);
  assertStringIncludes(source, '"delete-user-account"');
  assertStringIncludes(source, 'action: "request"');
  assertStringIncludes(source, 'action: "confirm"');
  assertStringIncludes(
    source,
    'confirmationToken = "confirmation_token"',
    'Swift must encode/decode the token as confirmation_token — Codable will not ' +
      'guess the snake_case key and the server does not accept camelCase',
  );
});

Deno.test('both iOS entry points route through AccountDeletionService', async () => {
  // Two call sites invoked the function independently, which is how they drifted.
  for (const path of [IOS_VIEWMODEL, IOS_SETTINGS]) {
    const source = await read(path);
    assertStringIncludes(
      source,
      'AccountDeletionService.shared.deleteAccount()',
      `${path} must call the shared service, not invoke the edge function directly`,
    );
    assert(
      !/functions\.invoke\(\s*"delete-user-account"/.test(source),
      `${path} invokes delete-user-account directly — that is the drift this story fixed`,
    );
  }
});

Deno.test('Android sends request then confirm and reads confirmation_token', async () => {
  const source = await read(ANDROID_VIEWMODEL);
  assertStringIncludes(source, '"delete-user-account"');
  assertStringIncludes(source, '"request"');
  assertStringIncludes(source, '"confirm"');
  assertStringIncludes(source, 'confirmation_token');
});

// -----------------------------------------------------------------------------
// 4. Neither client signs out before the server confirms
// -----------------------------------------------------------------------------

Deno.test('clients do not sign out unless deletion succeeded', async () => {
  // Signing out on a failed delete is what made this invisible: the user saw a
  // sign-out and assumed the account was gone. Both clients must throw first.
  const ios = await read(IOS_SERVICE);
  assertStringIncludes(ios, 'DeletionError.notConfirmed');

  const android = await read(ANDROID_VIEWMODEL);
  assert(
    android.indexOf('signOut') > android.indexOf('"confirm"'),
    'Android must confirm deletion server-side before signing the user out',
  );
});
