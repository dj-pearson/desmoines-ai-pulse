/**
 * fetchGuard image allowlist tests.
 * Run with: `deno test --allow-env supabase/functions/_shared/fetchGuard.test.ts`
 *
 * The image-transform proxy must accept storage URLs from both backends while
 * Des Moines Insider moves off Supabase Cloud: the cloud project's
 * <ref>.supabase.co and the self-hosted api.desmoinesinsider.com.
 */
import { isImageHostAllowed } from './fetchGuard.ts';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const STORAGE_PATH = '/storage/v1/object/public/event-images/x.jpg';

Deno.test('self-hosted storage host is allowed', () => {
  const r = isImageHostAllowed(`https://api.desmoinesinsider.com${STORAGE_PATH}`);
  assert(r.allowed, `api.desmoinesinsider.com refused: ${r.reason}`);
});

Deno.test('cloud storage host is still allowed', () => {
  const r = isImageHostAllowed(`https://wtkhfqpmcegzcbngroui.supabase.co${STORAGE_PATH}`);
  assert(r.allowed, `cloud storage host refused: ${r.reason}`);
});

Deno.test('a look-alike host is refused (suffix match needs the dot)', () => {
  const r = isImageHostAllowed(`https://evil-desmoinesinsider.com${STORAGE_PATH}`);
  assert(!r.allowed, 'evil-desmoinesinsider.com was allowed');
  const r2 = isImageHostAllowed(`https://desmoinesinsider.com.evil.example${STORAGE_PATH}`);
  assert(!r2.allowed, 'desmoinesinsider.com.evil.example was allowed');
});
