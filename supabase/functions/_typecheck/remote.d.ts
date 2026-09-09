/**
 * Loose declarations for the modules edge functions import over https.
 *
 * Deno resolves `https://esm.sh/...` and `https://deno.land/...` by fetching
 * them; tsc cannot, and this container cannot either (deno.land answers 403
 * through the agent proxy). Everything here is `any`, so this buys NO type
 * safety at the boundary - the point is that tsc can then check everything
 * INSIDE our own modules, which nothing checks today.
 *
 * Add a name here when a new remote import needs one - tsconfig.edge.json maps
 * https://*, jsr:* and npm:* here, so a missing name fails type-check:edge on
 * EVERY branch, not just the one that added the import. That is how parseISO,
 * fromZonedTime, assertFalse and assertThrows broke CI repo-wide.
 *
 * A wildcard shorthand (`declare module "https://*";`) looks like it would end
 * the maintenance, and does not: shorthand ambient modules resolve to a
 * namespace, so type-position imports like SupabaseClient stop being usable as
 * types and the error count goes from 5 to 30. The allowlist stays.
 *
 * Keep them `any`: a
 * hand-written approximation of the supabase-js types would be wrong in ways
 * nobody would notice, which is worse than declaring the boundary untyped.
 */
export type SupabaseClient<A = any, B = any, C = any> = any;
export type User = any;
export type Session = any;
export const createClient: any;
export const serve: any;
export const DOMParser: any;
export const Resvg: any;
export const initWasm: any;
// date-fns / date-fns-tz
export const parseISO: any;
export const fromZonedTime: any;
export const Webhook: any;
/**
 * `assert` is the ONE name here that cannot be `any`, and the reason is
 * narrowing rather than safety (WEB-CI-033).
 *
 * These tests are written the way Deno's std/assert intends: `const m =
 * s.match(re); assert(m, '...'); return m[0];`. Under `any` the assertion
 * signature is lost, so tsc still sees `m` as possibly null on the NEXT line
 * and reports TS18047 - nine times across six _tests/ files, which is what
 * kept `check-edge-types` (a step in pr-checks.yml) red on the default branch
 * for every PR. The real std/assert IS an assertion function; declaring it as
 * one here makes the shim less wrong, not more permissive.
 *
 * TypeScript requires an assertion call target to have an explicit type
 * annotation, which this declaration provides. Do not relax it back to `any`.
 */
export const assert: (expr: unknown, msg?: string) => asserts expr;
export const assertFalse: any;
export const assertThrows: any;
export const assertEquals: any;
export const assertStringIncludes: any;
export const init: any;
export const captureException: any;
export const captureMessage: any;
declare const _default: any;
export default _default;
