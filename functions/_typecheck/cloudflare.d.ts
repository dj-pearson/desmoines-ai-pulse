/**
 * The Cloudflare Pages Functions globals these two files use. Deliberately
 * minimal and loose, in the same spirit as supabase/functions/_typecheck/deno.d.ts.
 *
 * WHY A SHIM RATHER THAN @cloudflare/workers-types. Installing the real package
 * is the obvious answer and it was tried first. `npm install --save-dev
 * @cloudflare/workers-types` on Windows added the types and, as a side effect,
 * PRUNED 31 @esbuild/<platform> optional binaries from package-lock.json -
 * including @esbuild/linux-x64, which every CI runner needs. A types-only
 * addition that can break `npm ci` on Linux is not worth it for three errors,
 * so the dependency change was reverted and this shim replaces it.
 *
 * IT IS LOOSE ON PURPOSE. The point of type-checking functions/ is to catch
 * syntax errors, typos and obviously wrong property access in code that serves
 * EVERY production request. It is not to model the Workers runtime precisely;
 * an over-tight shim reports its own imprecision as defects, which is what the
 * ~120 undertyped edge-function directories already demonstrate.
 *
 * If @cloudflare/workers-types is ever installed properly, delete this file -
 * the `declare module` below would otherwise shadow the real package.
 */

/**
 * functions/_middleware.ts imports EventContext from the package by name, so it
 * has to be declarable even when the package is absent. Keeping the import in
 * the source (rather than rewriting it to a local type) means the file is still
 * correct for anyone who installs the real types.
 */
declare module "@cloudflare/workers-types" {
  export interface EventContext<Env = unknown, P extends string = string, Data = unknown> {
    request: Request;
    /** ASSETS is what Pages binds for serving the built static output. */
    env: Env & { ASSETS: { fetch(input: Request | URL | string): Promise<Response> } } & Record<string, unknown>;
    params: Record<P, string | string[]>;
    data: Data;
    next(input?: Request | string): Promise<Response>;
    waitUntil(promise: Promise<unknown>): void;
  }
}

/** The streaming HTML rewriter, a Workers runtime global with no npm equivalent. */
declare class HTMLRewriter {
  constructor();
  on(selector: string, handlers: unknown): HTMLRewriter;
  onDocument(handlers: unknown): HTMLRewriter;
  transform(response: Response): Response;
}
