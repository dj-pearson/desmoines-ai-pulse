/** The Deno globals these modules use. Deliberately minimal and loose. */
declare namespace Deno {
  type NetAddr = any;
  type Addr = any;
  type HttpServer = any;
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
  readDir(path: string | URL): AsyncIterable<{ name: string; isFile: boolean; isDirectory: boolean }>;
  resolveDns(q: string, t: string, opts?: any): Promise<any>;
  exit(code?: number): never;
  [k: string]: any;
};

/**
 * Deno's node: compatibility layer. A test that must run without a route to
 * deno.land imports node:assert instead of the std assert module, and tsc has
 * no idea what a `node:` specifier is. Same rule as remote.d.ts: `any`, because
 * a hand-written approximation would be wrong somewhere nobody would look.
 */
declare module 'node:assert' {
  const strict: any;
  export { strict };
  const _default: any;
  export default _default;
}
declare module 'node:assert/strict' {
  const _default: any;
  export default _default;
}
