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
