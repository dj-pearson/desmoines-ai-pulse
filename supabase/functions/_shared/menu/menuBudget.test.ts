/**
 * Unit tests for the menu scraper's time and token budgets.
 * Run with: `deno test supabase/functions/_shared/menu/menuBudget.test.ts`
 *
 * The constants are asserted against each other rather than against literal
 * values: what matters is that the response goes out before Supabase's 150s
 * idle limit, and that no budget below it can outlast the one above.
 */
import {
  canStartLlmAttempt,
  fetchWindow,
  LLM_ATTEMPT_TIMEOUT_MS,
  llmAttemptWindow,
  MENU_MAX_TOKENS,
  MIN_FETCH_WINDOW_MS,
  MIN_LLM_WINDOW_MS,
  MS_PER_RESTAURANT,
  PLATFORM_IDLE_TIMEOUT_MS,
  remainingMs,
  RESPONSE_DEADLINE_MS,
  RUN_DEADLINE_MS,
  withDeadline,
} from "./menuBudget.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function assertEquals(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}

Deno.test("the response goes out at least 10s before the 150s idle limit", () => {
  assert(
    RESPONSE_DEADLINE_MS <= PLATFORM_IDLE_TIMEOUT_MS - 10_000,
    `response at ${RESPONSE_DEADLINE_MS}ms leaves under 10s before ${PLATFORM_IDLE_TIMEOUT_MS}ms`,
  );
  assertEquals(PLATFORM_IDLE_TIMEOUT_MS, 150_000, "the platform limit this file is built around");
});

Deno.test("work stops before the response deadline, and a restaurant fits in the run", () => {
  assert(RUN_DEADLINE_MS < RESPONSE_DEADLINE_MS, "run deadline precedes the response deadline");
  assert(MS_PER_RESTAURANT <= RUN_DEADLINE_MS, "one restaurant cannot outlast the run");
  assert(MIN_LLM_WINDOW_MS < LLM_ATTEMPT_TIMEOUT_MS, "an attempt can be started with its minimum window");
  assert(MIN_FETCH_WINDOW_MS < MIN_LLM_WINDOW_MS, "fetches are cheaper than Claude calls");
});

Deno.test("the menu output cap is under the model's 64000 limit and not the shared 80000", () => {
  assert(MENU_MAX_TOKENS <= 64_000, `MENU_MAX_TOKENS ${MENU_MAX_TOKENS} exceeds claude-sonnet-4-5's output cap`);
  assert(MENU_MAX_TOKENS >= 4_000, "cap still holds a full menu");
});

Deno.test("remainingMs never goes negative", () => {
  assertEquals(remainingMs(1_000, 400), 600, "time left");
  assertEquals(remainingMs(1_000, 5_000), 0, "past the deadline");
});

Deno.test("an attempt window is the ceiling when time is plentiful", () => {
  const now = 1_000_000;
  assertEquals(llmAttemptWindow(now + 500_000, now), LLM_ATTEMPT_TIMEOUT_MS, "ceiling");
  assertEquals(llmAttemptWindow(undefined, now), LLM_ATTEMPT_TIMEOUT_MS, "no deadline set");
});

Deno.test("an attempt window is clamped to the deadline", () => {
  const now = 1_000_000;
  assertEquals(llmAttemptWindow(now + 30_000, now), 30_000, "30s left");
  assertEquals(llmAttemptWindow(now - 1, now), 0, "already past");
});

Deno.test("no attempt starts with less than the minimum window", () => {
  const now = 1_000_000;
  assert(canStartLlmAttempt(now + MIN_LLM_WINDOW_MS, now), "exactly the minimum is enough");
  assert(!canStartLlmAttempt(now + MIN_LLM_WINDOW_MS - 1, now), "1ms short is refused");
  assert(canStartLlmAttempt(undefined, now), "no deadline set");
});

Deno.test("the old schedule could not fit: three 90s attempts exceed the run", () => {
  // The control for the clamp above: unclamped, the retry loop alone outlasts
  // the run, which is how a single PDF produced a 504.
  assert(3 * LLM_ATTEMPT_TIMEOUT_MS > RUN_DEADLINE_MS, "three unclamped attempts would overrun");
  // Clamped, every attempt started after the first ends at the deadline.
  const start = 0;
  let now = start;
  let attempts = 0;
  while (canStartLlmAttempt(start + RUN_DEADLINE_MS, now)) {
    now += llmAttemptWindow(start + RUN_DEADLINE_MS, now);
    attempts++;
  }
  assert(now <= start + RUN_DEADLINE_MS, `clamped attempts end by the run deadline (ended at ${now})`);
  assert(attempts >= 1, "at least one attempt is made");
});

Deno.test("fetchWindow takes the smaller of the ceiling and the time left", () => {
  assertEquals(fetchWindow(10_000, 0, 20_000), 10_000, "deadline binds");
  assertEquals(fetchWindow(100_000, 0, 20_000), 20_000, "ceiling binds");
  assertEquals(fetchWindow(0, 5, 20_000), 0, "past the deadline");
});

Deno.test("withDeadline returns the value when it arrives in time", async () => {
  const value = await withDeadline(Promise.resolve("menu"), 1_000, "fallback");
  assertEquals(value, "menu", "resolved value");
});

Deno.test("withDeadline returns the fallback when the promise is too slow", async () => {
  let release: (v: string) => void = () => {};
  const slow = new Promise<string>((resolve) => {
    release = resolve;
  });
  const value = await withDeadline(slow, 10, "fallback");
  assertEquals(value, "fallback", "fallback after timeout");
  release("late"); // settle it so the test leaks no pending promise
});

Deno.test("withDeadline with no time left does not wait at all", async () => {
  const never = new Promise<string>(() => {});
  const value = await withDeadline(never, 0, "fallback");
  assertEquals(value, "fallback", "immediate fallback");
});

Deno.test("withDeadline passes a rejection through", async () => {
  let threw = false;
  try {
    await withDeadline(Promise.reject(new Error("boom")), 1_000, "fallback");
  } catch {
    threw = true;
  }
  assert(threw, "rejection propagates");
});
