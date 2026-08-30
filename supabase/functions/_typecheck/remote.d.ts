/**
 * Loose declarations for the modules edge functions import over https.
 *
 * Deno resolves `https://esm.sh/...` and `https://deno.land/...` by fetching
 * them; tsc cannot, and this container cannot either (deno.land answers 403
 * through the agent proxy). Everything here is `any`, so this buys NO type
 * safety at the boundary - the point is that tsc can then check everything
 * INSIDE our own modules, which nothing checks today.
 *
 * Add a name here when a new remote import needs one. Keep them `any`: a
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
export const Webhook: any;
export const assert: any;
export const assertEquals: any;
export const assertStringIncludes: any;
export const init: any;
export const captureException: any;
export const captureMessage: any;
declare const _default: any;
export default _default;
