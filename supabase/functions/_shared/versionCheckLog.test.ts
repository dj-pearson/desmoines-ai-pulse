import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { recordableVersion, recordVersionCheck } from "./versionCheckLog.ts";

const deps = (fetchImpl: typeof fetch) => ({ url: "https://api.example.test/", serviceKey: "k", fetchImpl });

Deno.test("recordableVersion accepts dotted numbers and refuses everything else", () => {
  assertEquals(recordableVersion("1.3.0"), "1.3.0");
  assertEquals(recordableVersion(" 1.2 "), "1.2");
  assertEquals(recordableVersion("10"), "10");
  assertEquals(recordableVersion("1.2.3.4"), "1.2.3.4");
  assertEquals(recordableVersion("1.2.3.4.5"), null);
  assertEquals(recordableVersion("1.2.0-beta"), null);
  assertEquals(recordableVersion("12345.0"), null);
  assertEquals(recordableVersion(""), null);
  assertEquals(recordableVersion("'; drop table x;--"), null);
});

Deno.test("posts the platform and version to the rpc with the service key", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const fake = ((url: string, init: RequestInit) => {
    seen = { url, init };
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as unknown as typeof fetch;
  const r = await recordVersionCheck("ios", "1.3.0", deps(fake));
  assertEquals(r, { ok: true });
  assertEquals(seen!.url, "https://api.example.test/rest/v1/rpc/record_version_check");
  assertEquals(JSON.parse(String(seen!.init.body)), { p_platform: "ios", p_version: "1.3.0" });
  assertEquals((seen!.init.headers as Record<string, string>).Authorization, "Bearer k");
});

Deno.test("a junk version makes no network call", async () => {
  let calls = 0;
  const fake = (() => { calls++; return Promise.resolve(new Response(null, { status: 204 })); }) as unknown as typeof fetch;
  const r = await recordVersionCheck("android", "not-a-version", deps(fake));
  assertEquals(r.ok, false);
  assertEquals(calls, 0);
});

Deno.test("an HTTP error is reported, not thrown", async () => {
  const fake = (() => Promise.resolve(new Response("nope", { status: 500 }))) as unknown as typeof fetch;
  const r = await recordVersionCheck("ios", "1.2.1", deps(fake));
  assertEquals(r.ok, false);
  assertEquals(r.reason?.startsWith("record_version_check returned 500"), true);
});

Deno.test("a network failure is reported, not thrown", async () => {
  const fake = (() => Promise.reject(new Error("connection refused"))) as unknown as typeof fetch;
  const r = await recordVersionCheck("ios", "1.2.1", deps(fake));
  assertEquals(r.ok, false);
  assertEquals(r.reason?.includes("connection refused"), true);
});

Deno.test("missing credentials are reported, not thrown", async () => {
  const fake = (() => Promise.resolve(new Response(null, { status: 204 }))) as unknown as typeof fetch;
  const r = await recordVersionCheck("ios", "1.2.1", { url: "", serviceKey: "", fetchImpl: fake });
  assertEquals(r.ok, false);
});
