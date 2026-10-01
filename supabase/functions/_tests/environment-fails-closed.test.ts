/**
 * A missing ENVIRONMENT secret must mean production.
 *
 * validateApiKey, getAllowedOrigins and isOriginAllowed each defaulted an
 * unset ENVIRONMENT to 'development'. With EDGE_FUNCTION_API_KEY also unset,
 * validateApiKey let every request through, and CORS accepted lovable.dev
 * preview origins. Both are now strict unless ENVIRONMENT=development is set
 * on purpose.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { runtimeEnvironment } from '../_shared/runtimeEnvironment.ts';
import { getAllowedOrigins, isOriginAllowed } from '../_shared/cors.ts';
import { validateApiKey } from '../_shared/apiKeyAuth.ts';

const KEYS = ['ENVIRONMENT', 'EDGE_FUNCTION_API_KEY', 'ALLOW_LOVABLE_PREVIEWS', 'SITE_URL', 'VITE_SITE_URL'];

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved = new Map(KEYS.map((k) => [k, Deno.env.get(k)]));
  try {
    for (const k of KEYS) Deno.env.delete(k);
    for (const [k, v] of Object.entries(vars)) if (v !== undefined) Deno.env.set(k, v);
    fn();
  } finally {
    for (const [k, v] of saved) v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
  }
}

Deno.test('unset, empty and unknown values all read as production', () => {
  for (const value of [undefined, '', 'prod', 'Production', 'test']) {
    withEnv({ ENVIRONMENT: value }, () => assertEquals(runtimeEnvironment(), 'production', `ENVIRONMENT=${value}`));
  }
  withEnv({ ENVIRONMENT: 'development' }, () => assertEquals(runtimeEnvironment(), 'development'));
  withEnv({ ENVIRONMENT: ' Staging ' }, () => assertEquals(runtimeEnvironment(), 'staging'));
});

Deno.test('with no API key configured and no ENVIRONMENT, validateApiKey rejects', () => {
  withEnv({}, () => {
    const res = validateApiKey(new Request('https://x.test'));
    assertEquals(res.success, false);
  });
});

Deno.test('the development bypass still works when asked for explicitly', () => {
  withEnv({ ENVIRONMENT: 'development' }, () => {
    assertEquals(validateApiKey(new Request('https://x.test')).success, true);
  });
});

Deno.test('with no ENVIRONMENT, CORS allows the production site and not previews or localhost', () => {
  withEnv({}, () => {
    assert(isOriginAllowed('https://desmoinesinsider.com'));
    assert(!isOriginAllowed('https://my-project.lovable.dev'));
    assert(!isOriginAllowed('http://localhost:8080'));
    assert(!getAllowedOrigins().some((o) => o.startsWith('http://localhost')));
  });
});
