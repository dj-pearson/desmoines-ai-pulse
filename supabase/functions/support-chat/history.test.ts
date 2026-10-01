import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { capHistory, MAX_HISTORY_CHARS, MAX_MESSAGE_CHARS } from "./history.ts";

Deno.test("capHistory truncates each message", () => {
  const out = capHistory([{ role: "user", content: "x".repeat(100_000) }]);
  assertEquals(out.length, 1);
  assertEquals(out[0].content.length, MAX_MESSAGE_CHARS);
});

Deno.test("capHistory keeps the newest messages within the total budget", () => {
  const msgs = Array.from({ length: 12 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: String(i).padEnd(MAX_MESSAGE_CHARS, "."),
  }));
  const out = capHistory(msgs);
  const total = out.reduce((n, m) => n + m.content.length, 0);
  assertEquals(total <= MAX_HISTORY_CHARS, true);
  assertEquals(out[out.length - 1].content.startsWith("11"), true);
  assertEquals(out[0].role, "user");
});

Deno.test("capHistory drops junk and non-array input", () => {
  assertEquals(capHistory("nope"), []);
  assertEquals(capHistory([null, { role: "system", content: "x" }, { role: "user", content: 5 }]), []);
});
