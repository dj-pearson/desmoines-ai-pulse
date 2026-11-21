/**
 * oauth-callback stays inert (WEB-SEC-078).
 *
 * The endpoint is public and exchanged a caller-chosen code with a stored
 * client_secret on unsigned state, then discarded the tokens. It has no
 * caller. It now answers 410 and must never again read oauth_providers or
 * hold a service-role client. If an OAuth callback is ever needed here, build
 * it as a new endpoint with HMAC-signed, single-use state.
 */

import { assert, assertFalse } from 'jsr:@std/assert@1';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

const FN = 'supabase/functions/oauth-callback/index.ts';

// Strip comments so the header that explains the old behaviour does not
// satisfy or trip the checks below.
async function code(): Promise<string> {
  const src = await read(FN);
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

Deno.test('oauth-callback never reads oauth_providers', async () => {
  const src = await code();
  assertFalse(src.includes('oauth_providers'), 'must not read provider config');
  assertFalse(src.includes('client_secret'), 'must not touch a client secret');
});

Deno.test('oauth-callback holds no service-role client and makes no outbound call', async () => {
  const src = await code();
  assertFalse(src.includes('SUPABASE_SERVICE_ROLE_KEY'), 'must not use the service role key');
  assertFalse(src.includes('createClient'), 'must not create a Supabase client');
  assertFalse(/\bfetch\s*\(/.test(src), 'must not call out to a token endpoint');
});

Deno.test('oauth-callback answers 410 and points at gsc-oauth', async () => {
  const src = await code();
  assert(src.includes('status: 410'), 'must answer 410 Gone');
  assert(src.includes('gsc-oauth'), 'must name the endpoint that does the real flow');
});
