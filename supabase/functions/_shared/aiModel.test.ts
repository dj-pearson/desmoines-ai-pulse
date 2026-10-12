/**
 * The model resolver and request shaper (aiModel.ts), plus reading a reply
 * whose first content block is a thinking block.
 *
 *   deno test --allow-env --allow-read --allow-net supabase/functions/_shared/aiModel.test.ts
 *
 * Production runs DEFAULT_AI_MODEL=claude-sonnet-5-5 and
 * LIGHTWEIGHT_AI_MODEL=claude-haiku-5-5. Both reject sampling params, budget
 * thinking and prefill, and both think by default, so both ids are covered.
 * claude-haiku-4-5 and claude-sonnet-4-6 stand for the legacy models that
 * still take sampling params.
 *
 * The "unset" test is FIRST on purpose: the warning is once per worker, and
 * any earlier defaultModel() call with the variable unset would spend it.
 */
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ClaudeRequestShapeError,
  defaultModel,
  FALLBACK_MODEL,
  isLegacyModel,
  lightweightModel,
  MIN_MAX_TOKENS_ADAPTIVE,
  shapeClaudeRequest,
  toolChoiceFor,
} from "./aiModel.ts";
import { extractClaudeText } from "./aiConfig.ts";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = Deno.env.get(k);
    if (vars[k] === undefined) Deno.env.delete(k);
    else Deno.env.set(k, vars[k]!);
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) Deno.env.delete(k);
      else Deno.env.set(k, saved[k]!);
    }
  }
}

Deno.test("DEFAULT_AI_MODEL unset: the fallback constant, logged exactly once", () => {
  const warnings: string[] = [];
  const orig = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args.map(String).join(" "));
  try {
    withEnv({ DEFAULT_AI_MODEL: undefined, LIGHTWEIGHT_AI_MODEL: undefined }, () => {
      assertEquals(defaultModel(), FALLBACK_MODEL);
      assertEquals(defaultModel(), FALLBACK_MODEL);
      assertEquals(lightweightModel(), FALLBACK_MODEL);
    });
  } finally {
    console.warn = orig;
  }
  assertEquals(warnings, [`[ai] DEFAULT_AI_MODEL unset; using ${FALLBACK_MODEL}`]);
});

Deno.test("DEFAULT_AI_MODEL set: it wins, trimmed", () => {
  withEnv({ DEFAULT_AI_MODEL: "  claude-sonnet-5-5 \n", LIGHTWEIGHT_AI_MODEL: undefined }, () => {
    assertEquals(defaultModel(), "claude-sonnet-5-5");
  });
});

Deno.test("an empty DEFAULT_AI_MODEL is unset, not an empty model id", () => {
  withEnv({ DEFAULT_AI_MODEL: "   ", LIGHTWEIGHT_AI_MODEL: undefined }, () => {
    assertEquals(defaultModel(), FALLBACK_MODEL);
  });
});

Deno.test("LIGHTWEIGHT_AI_MODEL unset falls back to DEFAULT_AI_MODEL", () => {
  withEnv({ DEFAULT_AI_MODEL: "claude-opus-5-5", LIGHTWEIGHT_AI_MODEL: undefined }, () => {
    assertEquals(lightweightModel(), "claude-opus-5-5");
  });
});

Deno.test("LIGHTWEIGHT_AI_MODEL set wins for lightweight calls only", () => {
  withEnv({ DEFAULT_AI_MODEL: "claude-sonnet-5-5", LIGHTWEIGHT_AI_MODEL: "claude-haiku-5-5" }, () => {
    assertEquals(lightweightModel(), "claude-haiku-5-5");
    assertEquals(defaultModel(), "claude-sonnet-5-5");
  });
});

const sampled = (model: string) => ({
  model,
  max_tokens: 4000,
  temperature: 0.2,
  top_p: 0.9,
  top_k: 40,
  messages: [{ role: "user", content: "hi" }],
});

Deno.test("sampling params are dropped for current models (both production models)", () => {
  for (const model of ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5", "claude-opus-4-7", "claude-opus-4-8", "claude-sonnet-5", "claude-fable-5-1"]) {
    const out = shapeClaudeRequest(sampled(model));
    assert(!("temperature" in out), `${model} kept temperature`);
    assert(!("top_p" in out), `${model} kept top_p`);
    assert(!("top_k" in out), `${model} kept top_k`);
    assertEquals(out.max_tokens, MIN_MAX_TOKENS_ADAPTIVE);
  }
});

Deno.test("sampling params are kept for legacy models (claude-haiku-4-5, claude-sonnet-4-6)", () => {
  for (const model of ["claude-haiku-4-5", "claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6", "claude-sonnet-4-5-20250929"]) {
    const out = shapeClaudeRequest(sampled(model));
    assertEquals(out.temperature, 0.2, model);
    assertEquals(out.top_p, 0.9, model);
    assertEquals(out.top_k, 40, model);
  }
});

Deno.test("an unknown id is treated as current: no sampling params", () => {
  for (const model of ["claude-sonnet-6", "claude-opus-7-1", "claude-something-new", ""]) {
    const out = shapeClaudeRequest(sampled(model));
    assert(!("temperature" in out), `${model || "(empty)"} kept temperature`);
  }
  assert(!isLegacyModel("claude-opus-4-7"));
  assert(isLegacyModel("claude-sonnet-4-20250514"));
  assert(isLegacyModel("claude-3-haiku-20240307"));
});

Deno.test("the input body is not modified", () => {
  const body = sampled("claude-sonnet-5-5");
  shapeClaudeRequest(body);
  assertEquals(body.temperature, 0.2);
});

Deno.test("budget_tokens and disabled thinking are never sent; adaptive is kept", () => {
  for (const model of ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-haiku-4-5"]) {
    const a = shapeClaudeRequest({ ...sampled(model), thinking: { type: "enabled", budget_tokens: 2000 } });
    assert(!("thinking" in a), `${model} kept enabled thinking`);
    const b = shapeClaudeRequest({ ...sampled(model), thinking: { type: "disabled" } });
    assert(!("thinking" in b), `${model} kept disabled thinking`);
  }
  const c = shapeClaudeRequest({ ...sampled("claude-sonnet-5-5"), thinking: { type: "adaptive" } });
  assertEquals(c.thinking, { type: "adaptive" });
});

Deno.test("effort is never sent to Haiku 4.5, and is kept for current models incl. Haiku 5.5", () => {
  const haiku = shapeClaudeRequest({ ...sampled("claude-haiku-4-5"), output_config: { effort: "low" } });
  assert(!("output_config" in haiku));
  const haikuFmt = shapeClaudeRequest({
    ...sampled("claude-haiku-4-5"),
    output_config: { effort: "low", format: { type: "json_schema" } },
  });
  assertEquals(haikuFmt.output_config, { format: { type: "json_schema" } });
  const sonnet = shapeClaudeRequest({ ...sampled("claude-sonnet-5-5"), output_config: { effort: "low" } });
  assertEquals(sonnet.output_config, { effort: "low" });
  const haiku55 = shapeClaudeRequest({ ...sampled("claude-haiku-5-5"), output_config: { effort: "high" } });
  assertEquals(haiku55.output_config, { effort: "high" });
});

Deno.test("{ lightweight: true } asks for low effort, unless the caller chose one or the model errors on it", () => {
  const h = shapeClaudeRequest({ model: "claude-haiku-5-5", max_tokens: 1000, messages: [] }, { lightweight: true });
  assertEquals(h.output_config, { effort: "low" });
  assertEquals(h.max_tokens, MIN_MAX_TOKENS_ADAPTIVE);
  const chosen = shapeClaudeRequest(
    { model: "claude-haiku-5-5", max_tokens: 1000, messages: [], output_config: { effort: "medium" } },
    { lightweight: true },
  );
  assertEquals(chosen.output_config, { effort: "medium" });
  const old = shapeClaudeRequest({ model: "claude-haiku-4-5", max_tokens: 1000, messages: [] }, { lightweight: true });
  assert(!("output_config" in old));
  const plain = shapeClaudeRequest({ model: "claude-sonnet-5-5", max_tokens: 1000, messages: [] });
  assert(!("output_config" in plain));
});

Deno.test("a small max_tokens is raised on a thinking model, untouched on Haiku 4.5", () => {
  const s = shapeClaudeRequest({ model: "claude-sonnet-5-5", max_tokens: 20, messages: [] });
  assertEquals(s.max_tokens, MIN_MAX_TOKENS_ADAPTIVE);
  const h55 = shapeClaudeRequest({ model: "claude-haiku-5-5", max_tokens: 1000, messages: [] });
  assertEquals(h55.max_tokens, MIN_MAX_TOKENS_ADAPTIVE);
  const big = shapeClaudeRequest({ model: "claude-sonnet-5-5", max_tokens: 16000, messages: [] });
  assertEquals(big.max_tokens, 16000);
  const h = shapeClaudeRequest({ model: "claude-haiku-4-5", max_tokens: 20, messages: [] });
  assertEquals(h.max_tokens, 20);
});

Deno.test("assistant prefill throws on both production models and 4.6, passes on Haiku 4.5", () => {
  const prefill = (model: string) => ({
    model,
    max_tokens: 100,
    messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "{" }],
  });
  assertThrows(() => shapeClaudeRequest(prefill("claude-sonnet-5-5")), ClaudeRequestShapeError);
  assertThrows(() => shapeClaudeRequest(prefill("claude-haiku-5-5")), ClaudeRequestShapeError);
  assertThrows(() => shapeClaudeRequest(prefill("claude-sonnet-4-6")), ClaudeRequestShapeError);
  shapeClaudeRequest(prefill("claude-haiku-4-5"));
});

Deno.test("forced tool_choice throws on current models; toolChoiceFor picks per model", () => {
  const forced = (model: string, tool_choice: unknown) => ({ model, max_tokens: 100, messages: [], tool_choice });
  assertThrows(() => shapeClaudeRequest(forced("claude-sonnet-5-5", { type: "tool", name: "x" })), ClaudeRequestShapeError);
  assertThrows(() => shapeClaudeRequest(forced("claude-opus-5-5", { type: "any" })), ClaudeRequestShapeError);
  shapeClaudeRequest(forced("claude-haiku-4-5", { type: "tool", name: "x" }));
  shapeClaudeRequest(forced("claude-sonnet-5-5", { type: "auto" }));
  assertEquals(toolChoiceFor("claude-sonnet-5-5", "record_menu"), { type: "auto" });
  // Haiku 5.5 accepts forced tool use, but DEFAULT_AI_MODEL may not; the
  // conservative rule (not legacy => auto) keeps one behaviour for both.
  assertEquals(toolChoiceFor("claude-haiku-5-5", "record_menu"), { type: "auto" });
  assertEquals(toolChoiceFor("claude-haiku-4-5", "record_menu"), { type: "tool", name: "record_menu" });
});

Deno.test("a reply that starts with a thinking block yields its text block", () => {
  const r = extractClaudeText({
    content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: "SAFE" },
    ],
    stop_reason: "end_turn",
  });
  assertEquals(r, { ok: true, text: "SAFE" });
});

Deno.test("thinking then max_tokens with no text is reported as max_tokens, not empty", () => {
  const r = extractClaudeText({
    content: [{ type: "thinking", thinking: "", signature: "sig" }],
    stop_reason: "max_tokens",
  });
  assertEquals(r.ok, false);
  assertEquals((r as { reason?: string }).reason, "max_tokens");
});

Deno.test("a refusal is reported as refused", () => {
  const r = extractClaudeText({ content: [], stop_reason: "refusal" });
  assertEquals(r.ok, false);
  const r2 = extractClaudeText({ content: [{ type: "thinking", thinking: "" }], stop_reason: "refusal" });
  assertEquals(r2.ok, false);
  assertEquals((r2 as { reason?: string }).reason, "refused");
});
