/** The Deno globals these modules use. Deliberately minimal and loose. */
declare namespace Deno {
  type NetAddr = any;
  type Addr = any;
  type HttpServer = any;
  /**
   * WEB-CI-033: no-embedded-credentials.test.ts annotates its accumulator as
   * `Deno.DirEntry[]`, which is the real API's name for what readDir yields.
   * The namespace declared the value-side globals and not this type, so the
   * test reported TS2694 and check-edge-types - a pr-checks.yml step - stayed
   * red. Declared as the same shape readDir returns below, so the two cannot
   * drift into disagreeing.
   */
  interface DirEntry {
    name: string;
    isFile: boolean;
    isDirectory: boolean;
  }
}
declare const Deno: {
  env: {
    get(key: string): string | undefined;
    set(k: string, v: string): void;
    delete(k: string): void;
    has(k: string): boolean;
    toObject(): Record<string, string>;
  };
  serve(handler: (req: Request, info?: any) => Response | Promise<Response>): any;
  serve(opts: any, handler?: (req: Request, info?: any) => Response | Promise<Response>): any;
  test(name: string, fn: (t?: any) => unknown | Promise<unknown>): void;
  test(opts: any, fn?: (t?: any) => unknown | Promise<unknown>): void;
  readTextFile(path: string | URL): Promise<string>;
  readTextFileSync(path: string | URL): string;
  readDir(path: string | URL): AsyncIterable<Deno.DirEntry>;
  resolveDns(q: string, t: string, opts?: any): Promise<any>;
  exit(code?: number): never;
  [k: string]: any;
};

/**
 * Deno's node: compatibility layer. A test that must run without a route to
 * deno.land imports node:assert instead of the std assert module, and tsc has
 * no idea what a `node:` specifier is.
 *
 * THIS WAS A BARE `any`, on the reasoning that a hand-written approximation
 * would be wrong somewhere nobody would look. That is right about the shape of
 * the risk and wrong about the cost: with `any`, `assert.ok(x)` does not NARROW
 * x, so every test that asserts a value is present and then uses it reports
 * TS18047 against the edge-types ratchet. It has cost two detours and two
 * `?? ''` workarounds that made tests read worse than the thing they check.
 *
 * So: `ok` is declared as a real assertion function and the handful of members
 * these suites use are typed. Everything else stays `any` through the index
 * signature, which keeps the original concern intact for members nobody has
 * exercised yet - an unlisted method still compiles, it just does not narrow.
 */
declare module 'node:assert' {
  interface StrictAssert {
    /** The one that matters: `asserts value` is what makes narrowing work. */
    ok(value: unknown, message?: string | Error): asserts value;
    equal(actual: unknown, expected: unknown, message?: string | Error): void;
    notEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    strictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    deepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notDeepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    match(value: string, regExp: RegExp, message?: string | Error): void;
    throws(fn: () => unknown, ...rest: unknown[]): void;
    rejects(fn: () => Promise<unknown>, ...rest: unknown[]): Promise<void>;
    fail(message?: string | Error): never;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [member: string]: any;
  }
  const strict: StrictAssert;
  export { strict };
  const _default: any;
  export default _default;
}
declare module 'node:assert/strict' {
  const _default: any;
  export default _default;
}
