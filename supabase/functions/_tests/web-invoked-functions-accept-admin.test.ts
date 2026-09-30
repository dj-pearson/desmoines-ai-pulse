/**
 * A function the web app invokes must accept an admin's JWT.
 *
 * supabase.functions.invoke() sends the signed-in user's JWT. requireApiKey
 * accepts only EDGE_FUNCTION_API_KEY, which the browser never has, so a
 * function gated by it alone answers 401 to every click. Three admin tools
 * (generate-seo-content, bulk-update-restaurants, publish-article-webhook) sat
 * in that state. requireAdminOrApiKey accepts the key AND an admin JWT.
 */

import { assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);

async function* sourceFiles(dir: URL): AsyncGenerator<URL> {
  for await (const e of Deno.readDir(dir)) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const child = new URL(e.name + (e.isDirectory ? '/' : ''), dir);
    if (e.isDirectory) yield* sourceFiles(child);
    else if (/\.(ts|tsx)$/.test(e.name)) yield child;
  }
}

Deno.test('no web-invoked function is gated by the API key alone', async () => {
  const invoked = new Set<string>();
  for await (const file of sourceFiles(new URL('src/', REPO))) {
    const text = await Deno.readTextFile(file);
    for (const m of text.matchAll(/functions\.invoke\(\s*['"]([a-z0-9-]+)['"]/g)) invoked.add(m[1]);
  }
  assert(invoked.size > 20, `found only ${invoked.size} invoked functions; the scan is broken`);

  const keyOnly: string[] = [];
  for (const name of invoked) {
    let src: string;
    try {
      src = await Deno.readTextFile(new URL(`supabase/functions/${name}/index.ts`, REPO));
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) continue;
      throw e;
    }
    if (/\brequireApiKey\(/.test(src)) keyOnly.push(name);
  }
  assert(
    keyOnly.length === 0,
    `invoked from src/ with a user JWT but gated by requireApiKey: ${keyOnly.join(', ')}. ` +
      'Use requireAdminOrApiKey.',
  );
});
