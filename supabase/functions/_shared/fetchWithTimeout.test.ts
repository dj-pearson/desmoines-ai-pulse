/**
 * fetchWithTimeout unit tests (WEB-BE-001).
 * Run with: `deno test --allow-net supabase/functions/_shared/fetchWithTimeout.test.ts`
 *
 * Exercises the shared helper against a simulated HUNG upstream (a server that
 * accepts the connection but never responds) to prove a stuck external call is
 * aborted instead of tying up the whole invocation.
 */
import { fetchWithTimeout, FetchTimeoutError } from './fetchWithTimeout.ts';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

Deno.test('aborts a hung upstream with FetchTimeoutError', async () => {
  // Server that never responds — the request hangs until we time out.
  // Held open until the test releases it. A handler that never settles also
  // makes server.shutdown() wait for it forever, so this test used to hang
  // after the assertion it exists for (which is why no CI lane ran it).
  let release: () => void = () => {};
  const server = Deno.serve(
    { port: 0, onListen: () => {} },
    () => new Promise<Response>((resolve) => (release = () => resolve(new Response('late')))),
  );
  const port = (server.addr as Deno.NetAddr).port;

  const start = Date.now();
  let caught: unknown = null;
  try {
    await fetchWithTimeout(`http://127.0.0.1:${port}/`, {}, 250);
  } catch (e) {
    caught = e;
  }
  const elapsed = Date.now() - start;

  release();
  await server.shutdown();

  assert(caught instanceof FetchTimeoutError, 'should throw FetchTimeoutError');
  assert(elapsed >= 200 && elapsed < 2000, `should abort near the timeout, got ${elapsed}ms`);
});

Deno.test('a fast upstream still succeeds within the timeout', async () => {
  const server = Deno.serve({ port: 0, onListen: () => {} }, () => new Response('ok'));
  const port = (server.addr as Deno.NetAddr).port;

  const res = await fetchWithTimeout(`http://127.0.0.1:${port}/`, {}, 5000);
  const body = await res.text();

  await server.shutdown();

  assert(body === 'ok', 'fast upstream body should be returned');
});
