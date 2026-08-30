import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { composeDigest, renderCount, unavailable } from "../_shared/digestFormat.ts";

/**
 * The daily ops digest is how anyone finds out something is wrong. Its metrics
 * ran through a helper returning `count ?? 0` with the error discarded, so a
 * digest that could read nothing printed the same eleven zeros as a system with
 * nothing wrong (WEB-BE-032).
 *
 * These tests are about that one property: an unreadable section must never
 * render as a healthy one.
 */

Deno.test("a metric that could not be read does not render as zero", () => {
  assertEquals(renderCount(0), "0");
  assertEquals(renderCount(42), "42");
  // The whole finding, in one assertion.
  assertEquals(renderCount(null), "unavailable (read failed)");
});

Deno.test("an unavailable section carries the reason", () => {
  const line = unavailable("Edge functions", { message: "permission denied for table" });
  assertStringIncludes(line, "Edge functions");
  assertStringIncludes(line, "UNAVAILABLE");
  assertStringIncludes(line, "permission denied for table");
});

Deno.test("an unavailable section still says so when the error carries no message", () => {
  assertStringIncludes(unavailable("CSAT (30d)", null), "UNAVAILABLE");
  assertStringIncludes(unavailable("CSAT (30d)", {}), "read failed");
});

Deno.test("a fully readable digest carries no warning", () => {
  const { body, degraded } = composeDigest([
    "Overdue tasks: 0",
    "Agent failures (24h): 0",
    "Edge functions - no 5xx in 24h",
  ]);
  assertEquals(degraded, 0);
  assertEquals(body.startsWith("Overdue tasks: 0"), true);
  assertEquals(body.includes("WARNING"), false);
});

Deno.test("a partly blind digest announces it in the first line", () => {
  // Buried at the bottom, this is the line a reader never reaches - they have
  // already skimmed two healthy numbers and stopped.
  const { body, degraded } = composeDigest([
    "Overdue tasks: 0",
    "Agent failures (24h): unavailable (read failed)",
    "Edge functions - UNAVAILABLE (permission denied)",
  ]);
  assertEquals(degraded, 2);
  assertStringIncludes(body.split("\n")[0], "WARNING: 2 of 3 sections could not be read");
});

Deno.test("both spellings of unreadable are counted", () => {
  // renderCount emits lowercase "unavailable"; unavailable() emits uppercase.
  // Counting only one of them would report a partly blind digest as complete.
  assertEquals(composeDigest(["a: unavailable (read failed)"]).degraded, 1);
  assertEquals(composeDigest(["Backups - UNAVAILABLE (x)"]).degraded, 1);
});
