/**
 * Unit tests for menu URL admission control.
 * Run with: `deno test --allow-none supabase/functions/_shared/menu/menuUrls.test.ts`
 *
 * These guard an SSRF surface: the scraper fetches URLs read from
 * admin-editable columns while holding the service role key.
 */
import { isPublicHttpUrl, normalizeSiteUrl } from "./menuUrls.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function assertEquals(actual: unknown, expected: unknown, msg: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

Deno.test("ordinary public URLs are allowed", () => {
  for (const url of [
    "https://www.banditburritoia.com/",
    "http://example.com/menu",
    "https://order.toasttab.com/online/x",
    "https://cdn.example.com/menus/dinner.pdf",
  ]) {
    assert(isPublicHttpUrl(url), `${url} should be allowed`);
  }
});

Deno.test("private and loopback destinations are refused", () => {
  for (const url of [
    "http://localhost/menu",
    "http://127.0.0.1:8000/",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://172.16.0.1/",
    "http://169.254.169.254/latest/meta-data/", // cloud metadata service
    "http://[::1]/",
    "http://db.internal/",
    "http://printer.local/",
  ]) {
    assert(!isPublicHttpUrl(url), `${url} should be refused`);
  }
});

Deno.test("non-http schemes are refused", () => {
  for (const url of ["file:///etc/passwd", "gopher://x/", "ftp://x/menu.pdf", "data:text/html,x"]) {
    assert(!isPublicHttpUrl(url), `${url} should be refused`);
  }
});

Deno.test("credentials embedded in the URL are refused", () => {
  assert(!isPublicHttpUrl("https://user:pass@example.com/menu"), "no credentials-in-URL");
});

Deno.test("a bare domain typed by an admin gets a scheme", () => {
  assertEquals(normalizeSiteUrl("banditburritoia.com"), "https://banditburritoia.com", "scheme added");
  assertEquals(normalizeSiteUrl("  example.com/menu  "), "https://example.com/menu", "trimmed");
});

Deno.test("trailing slashes are dropped so URLs de-duplicate", () => {
  assertEquals(normalizeSiteUrl("https://example.com/"), "https://example.com", "one slash");
  assertEquals(normalizeSiteUrl("https://example.com///"), "https://example.com", "several");
});

Deno.test("junk values return null instead of throwing", () => {
  for (const raw of [null, undefined, "", "   ", "not a url at all!", "javascript:alert(1)"]) {
    assertEquals(normalizeSiteUrl(raw as string | null), null, `${JSON.stringify(raw)} rejected`);
  }
});
