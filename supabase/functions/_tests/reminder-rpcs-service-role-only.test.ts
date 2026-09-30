/**
 * The reminder RPCs are service_role only.
 *
 * get_pending_reminders returns auth.users.email for every pending reminder and
 * mark_reminder_sent rewrites any reminder's status. Both are SECURITY DEFINER,
 * and until 20261015000006 both were executable by anon, because the original
 * migration GRANTed to service_role without revoking the default PUBLIC grant.
 *
 * These assert the migration source and that no client started calling them.
 */

import { assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));
const MIGRATION = 'supabase/migrations/20261015000006_revoke_public_reminder_rpcs.sql';

const SIGNATURES = [
  'public.get_pending_reminders(text)',
  'public.mark_reminder_sent(uuid, text, text)',
];

Deno.test('both functions are revoked from PUBLIC, anon and authenticated', async () => {
  const sql = await read(MIGRATION);
  for (const sig of SIGNATURES) {
    const escaped = sig.replace(/[.()]/g, '\\$&');
    assert(
      new RegExp(`REVOKE EXECUTE ON FUNCTION ${escaped} FROM PUBLIC, anon, authenticated;`).test(sql),
      `${sig} must be revoked from all three; revoking anon alone leaves PUBLIC`,
    );
    assert(
      new RegExp(`GRANT EXECUTE ON FUNCTION ${escaped} TO service_role;`).test(sql),
      `${sig} must stay callable by send-event-reminders`,
    );
  }
});

Deno.test('mark_reminder_sent pins search_path', async () => {
  const sql = await read(MIGRATION);
  assert(/ALTER FUNCTION public\.mark_reminder_sent\(uuid, text, text\) SET search_path = public, pg_temp;/.test(sql));
});

Deno.test('the only caller is the service-role edge function', async () => {
  const fn = await read('supabase/functions/send-event-reminders/index.ts');
  assert(/createClient\(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY\)/.test(fn));

  // A client call would be denied after the revoke. Fail here instead of in prod.
  const roots = ['src', 'ios', 'android'];
  const hits: string[] = [];
  const walk = async (dir: URL) => {
    for await (const e of Deno.readDir(dir)) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const child = new URL(e.name + (e.isDirectory ? '/' : ''), dir);
      if (e.isDirectory) await walk(child);
      else if (/\.(tsx?|swift|kt)$/.test(e.name) && !e.name.endsWith('types.ts')) {
        const text = await Deno.readTextFile(child);
        if (/get_pending_reminders|mark_reminder_sent/.test(text)) hits.push(child.pathname);
      }
    }
  };
  for (const r of roots) {
    try {
      await walk(new URL(r + '/', REPO));
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  }
  assert(hits.length === 0, `client code calls a service-role-only RPC: ${hits.join(', ')}`);
});
