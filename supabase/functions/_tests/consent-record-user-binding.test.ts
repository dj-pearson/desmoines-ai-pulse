/**
 * Consent rows carry the account they belong to (WEB-AUTH-003).
 *
 * Auth.tsx calls logConsent immediately after signUp. With email confirmation
 * on -- which it is -- signUp returns a user and NO session, so consentLog.ts's
 * auth.getUser() resolves to null and the row is written with user_id NULL,
 * keyed only by email_hash. The anon INSERT policy accepts it, because that
 * policy exists for genuinely pre-auth consent.
 *
 * That is not cosmetic. export-user-data and delete-user-account both key on
 * user_id, so the one record whose entire purpose is to prove affirmative
 * consent under GDPR Art. 7 was invisible to the subject-access request that
 * asks for it. consent_records is already in RETAINED_TABLES with a proper
 * basis and the export already reads that list -- it simply could not find the
 * rows.
 */

import { assert, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));
const MIGRATION = 'supabase/migrations/20260902000014_consent_records_carry_user_id.sql';

Deno.test('the trigger writes consent with the new user id', async () => {
  const sql = await read(MIGRATION);

  assert(
    /PERFORM public\.record_signup_consent\(NEW\.id, meta\);/.test(sql),
    'handle_new_user must record consent, where NEW.id exists',
  );
  // Every insert names p_user_id. A row without it is the defect.
  const fn = sql.slice(sql.indexOf('FUNCTION public.record_signup_consent'), sql.indexOf('REVOKE ALL ON FUNCTION public.record_signup_consent'));
  const inserts = fn.match(/INSERT INTO public\.consent_records/g) || [];
  assert(inserts.length === 4, `expected 4 consent inserts, found ${inserts.length}`);
  const values = fn.match(/VALUES \(\s*\n?\s*p_user_id,/g) || [];
  assert(values.length === 4, 'every insert must lead with p_user_id');
});

Deno.test('the four consent types match what the signup form collects', async () => {
  // Auth.tsx builds consentRecord with these four flags. If a fifth is added to
  // the form and not here, the trigger silently records less than the user
  // agreed to.
  const sql = await read(MIGRATION);
  for (const [flag, type] of [
    ['terms_accepted', 'terms'],
    ['email_marketing_consent', 'marketing_email'],
    ['sms_marketing_consent', 'marketing_sms'],
    ['personalization_consent', 'personalization_ai'],
  ]) {
    assert(sql.includes(`'${flag}'`), `${flag} must be read from the metadata`);
    assert(sql.includes(`'${type}'`), `${type} must be recorded`);
  }

  const page = await read('src/pages/Auth.tsx');
  for (const flag of ['terms_accepted', 'email_marketing_consent', 'sms_marketing_consent', 'personalization_consent']) {
    assert(page.includes(flag), `Auth.tsx must still send ${flag}`);
  }
  // The metadata carrier the trigger reads.
  assert(page.includes('consent: consentRecord'), 'the consent block must stay in signup metadata');
});

Deno.test('an orphan is only adopted by a CONFIRMED address', async () => {
  // An unconfirmed address proves nothing about who holds the mailbox. Adopting
  // on that basis would let anyone who can type an address inherit the consent
  // recorded against it.
  const sql = await read(MIGRATION);
  const linker = sql.slice(
    sql.indexOf('FUNCTION public.link_orphan_consent_records'),
    sql.indexOf('REVOKE ALL ON FUNCTION public.link_orphan_consent_records'),
  );
  assert(/u\.email_confirmed_at IS NOT NULL/.test(linker));
  assert(/user_id IS NULL/.test(linker), 'only orphans may be adopted');
});

Deno.test('the hash is recomputed, never trusted from the row', async () => {
  // The client supplies email_hash. Matching a caller-supplied hash against a
  // caller-supplied id would let one account claim another's consent rows.
  const sql = await read(MIGRATION);
  assert(
    /encode\(extensions\.digest\(lower\(btrim\(u\.email\)\), 'sha256'\), 'hex'\)/.test(sql),
    'the hash must be derived from auth.users.email',
  );

  // And it must match what the browser produces: sha256 of the trimmed,
  // lowercased address as lowercase hex.
  const client = await read('src/lib/consentLog.ts');
  assert(/email\.trim\(\)\.toLowerCase\(\)/.test(client));
  assert(/digest\("SHA-256"/.test(client));
  assert(/toString\(16\)\.padStart\(2, "0"\)/.test(client), 'lowercase hex, matching encode(..., \'hex\')');
});

Deno.test('neither helper is reachable from an API client', async () => {
  const sql = await read(MIGRATION);
  for (const fn of ['link_orphan_consent_records(uuid)', 'record_signup_consent(uuid, jsonb)']) {
    assert(
      sql.includes(`REVOKE ALL ON FUNCTION public.${fn} FROM public, anon, authenticated;`),
      `${fn} must not be callable by a client`,
    );
  }
});

Deno.test('the backfill reports what it did', async () => {
  const sql = await read(MIGRATION);
  assert(/RAISE NOTICE 'WEB-AUTH-003 backfill/.test(sql), 'counts before and after');
  assert(
    /still orphaned \(no confirmed account at that address\)/.test(sql),
    'and says why the remainder stayed',
  );
});

Deno.test('consent_records is retained rather than purged, and is exported', async () => {
  // AC4. Already true, pinned so it stays that way: the whole defect was that
  // the export could not FIND these rows, not that it excluded them.
  const tables = await read('supabase/functions/_shared/userDataTables.ts');
  assert(/consent_records:\s*\n?\s*"Proof that consent was given/.test(tables));
  const purge = tables.slice(tables.indexOf('PURGE_TABLES'), tables.indexOf('RETAINED_TABLES'));
  assertFalse(/"consent_records"/.test(purge), 'an append-only consent log must not be purged');

  const exporter = await read('supabase/functions/export-user-data/index.ts');
  assert(
    /\[\.\.\.PURGE_TABLES, \.\.\.retainedTables\]/.test(exporter),
    'the export must read the retained list too',
  );
});

Deno.test('the client call is kept, and marked for removal', async () => {
  // AC2 asks for one release of overlap. The comment is the thing that makes
  // the second release happen.
  const page = await read('src/pages/Auth.tsx');
  assert(/logConsent\(\{/.test(page), 'the fallback stays for one release');
  assert(/FALLBACK ONLY, AND SCHEDULED FOR REMOVAL/.test(page));
  // And the two writers must be distinguishable while both exist.
  const sql = await read(MIGRATION);
  assert(/'writer', 'trigger'/.test(sql), 'trigger rows must say so');
});
