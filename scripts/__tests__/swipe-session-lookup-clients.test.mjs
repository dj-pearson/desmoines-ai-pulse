#!/usr/bin/env node
/**
 * Both apps resolve a group-session join code through lookup_swipe_session
 * (WEB-SEC-070, slice 2), not through a direct swipe_sessions read.
 *
 * Slice 3 replaces the table's USING (true) read with host-or-member. Any
 * binary still reading the table by code then gets "no session" for every
 * joiner, so the property that has to hold before slice 3 can ship is: the
 * join path asks the RPC, and touches the table only when the RPC is missing
 * (PGRST202 / 42883, i.e. migration 20261108000096 not applied yet).
 *
 * There is no Swift or Kotlin compiler in the cloud session, so this reads the
 * sources. The behaviour is unit-tested on each platform
 * (SwipeSessionServiceTests.swift, GroupSessionLookupTest.kt); this suite is
 * the part that runs on every `npm run test:offline`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

// Line comments out, so a doc comment naming the RPC cannot satisfy a check.
const strip = (src) => src.replace(/\/\/[^\n]*/g, '');

/** Body of the first function whose header matches `header`, by brace depth. */
function body(src, header) {
  const m = header.exec(src);
  if (!m) return '';
  const open = src.indexOf('{', m.index + m[0].length - 1);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  return '';
}

const migrationDefines = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .some((f) => /CREATE OR REPLACE FUNCTION public\.lookup_swipe_session\(/.test(
    readFileSync(join('supabase/migrations', f), 'utf8')));
check('a migration defines lookup_swipe_session', migrationDefines);

// --- iOS ---------------------------------------------------------------------
console.log('ios SwipeSessionService');
const swift = strip(readFileSync('ios/DesMoinesInsider/Services/SwipeSessionService.swift', 'utf8'));
const lookup = body(swift, /func lookupSession\(byCode code: String\)[^{]*\{/);
check('lookupSession exists', lookup.length > 0);
check('lookupSession calls the RPC', /\.rpc\("lookup_swipe_session"/.test(lookup));
check('lookupSession does not read swipe_sessions itself', !/from\("swipe_sessions"\)/.test(lookup));
check('the table read is reached only from a missing-function catch',
  /catch let error where Self\.isMissingFunctionError\(error\)\s*\{\s*rows = try await legacyLookup\(/.test(lookup),
  'expected `catch let error where Self.isMissingFunctionError(error) { rows = try await legacyLookup(...)`');
check('legacyLookup is called nowhere else', (swift.match(/await legacyLookup\(/g) || []).length === 1);
check('the RPC result is filtered to joinable sessions', /isJoinable\(\$0, now:/.test(lookup));
const missing = body(swift, /static func isMissingFunctionError\(_ error: Error\)[^{]*\{/);
check('isMissingFunctionError means PGRST202 or 42883 only',
  /"PGRST202"/.test(missing) && /"42883"/.test(missing) && !/"42501"|"PGRST205"/.test(missing));
const joinable = body(swift, /static func isJoinable\([^)]*\)[^{]*\{/);
check('isJoinable requires status active', /status == "active"/.test(joinable));
check('isJoinable compares expiry to now', /expires > now/.test(joinable));

// --- Android -----------------------------------------------------------------
console.log('android GroupSessionRemoteDataSource');
const ds = strip(readFileSync(
  'android/app/src/main/java/com/desmoines/aipulse/data/remote/GroupSessionRemoteDataSource.kt', 'utf8'));
const byCode = body(ds, /suspend fun fetchByCode\(code: String\): SwipeSession\? \{/);
check('fetchByCode has a block body', byCode.length > 0);
check('fetchByCode calls the RPC', /rpc\(LOOKUP_FUNCTION,/.test(byCode));
check('LOOKUP_FUNCTION names lookup_swipe_session', /const val LOOKUP_FUNCTION = "lookup_swipe_session"/.test(ds));
const rpcAt = byCode.indexOf('rpc(LOOKUP_FUNCTION');
const catchAt = byCode.search(/catch \(error: PostgrestRestException\)/);
const guardAt = byCode.search(/if \(!isMissingFunction\(error\.code\)\) throw error/);
const tableAt = byCode.indexOf('from("swipe_sessions")');
check('the table read comes after the RPC, inside the catch, behind the missing-function guard',
  rpcAt > -1 && catchAt > rpcAt && guardAt > catchAt && tableAt > guardAt,
  `rpc@${rpcAt} catch@${catchAt} guard@${guardAt} table@${tableAt}`);
const create = body(ds, /suspend fun createSession\([^)]*\): SwipeSession \{/);
check('createSession reads back its own row, not through the joiner path',
  /fetchOwnByCode\(code, hostUserId\)/.test(create) && !/fetchByCode\(/.test(create));
const own = body(ds, /private suspend fun fetchOwnByCode\([^)]*\): SwipeSession\? =[^{]*\{/);
check('fetchOwnByCode filters on host_user_id', /eq\("host_user_id", hostUserId\)/.test(own));
check('isMissingFunction means PGRST202 or 42883 only',
  /fun isMissingFunction\(code: String\?\): Boolean = code == "PGRST202" \|\| code == "42883"/.test(ds));

const model = strip(readFileSync(
  'android/app/src/main/java/com/desmoines/aipulse/data/model/GroupSession.kt', 'utf8'));
check('SwipeSession.hostUserId is nullable (the RPC hides it from joiners)',
  /@SerialName\("host_user_id"\) val hostUserId: String\? = null/.test(model));

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
