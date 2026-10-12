/**
 * Centralized AI Configuration Utility
 *
 * This module provides a unified way to fetch AI settings from the database
 * for all edge functions. Update settings in the Admin Dashboard AI Configuration
 * section and all modules will automatically use the new values.
 *
 * THE MODEL IS NOT READ FROM HERE. It comes from the DEFAULT_AI_MODEL /
 * LIGHTWEIGHT_AI_MODEL secrets through ./aiModel.ts. The ai_configuration
 * default_model and lightweight_model rows are no longer read by any edge
 * function; this module still reads that table for the endpoint, API version,
 * token limits and temperatures. Temperatures are dropped by
 * shapeClaudeRequest() for models that reject them.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { defaultModel, lightweightModel, shapeClaudeRequest } from "./aiModel.ts";

export { defaultModel, lightweightModel, shapeClaudeRequest, toolChoiceFor } from "./aiModel.ts";

interface AIConfig {
  api_endpoint: string;
  max_tokens_standard: number;
  max_tokens_large: number;
  max_tokens_lightweight: number;
  temperature_precise: number;
  temperature_creative: number;
  anthropic_version: string;
}

let configCache: AIConfig | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Canonical accessor for the Anthropic API key (WEB-BE-002).
 *
 * The key has historically been stored under three different secret names
 * across the 60+ edge functions: `ANTHROPIC_API_KEY`, `CLAUDE_API`, and
 * `CLAUDE_API_KEY`. This accessor reads the canonical `ANTHROPIC_API_KEY`
 * first, then falls back to the two legacy names so nothing breaks while the
 * secret is migrated.
 *
 * DEPRECATION PLAN:
 *   1. (this release) All functions call getAnthropicApiKey(); the canonical
 *      secret is `ANTHROPIC_API_KEY`. Legacy `CLAUDE_API` / `CLAUDE_API_KEY`
 *      are still read as fallbacks so key rotation is safe.
 *   2. Set the `ANTHROPIC_API_KEY` secret in every environment, then remove
 *      the `CLAUDE_API` / `CLAUDE_API_KEY` secrets.
 *   3. A later release drops the fallback reads from this accessor.
 *
 * @returns the key string, or null if none of the names are set.
 */
export function getAnthropicApiKey(): string | null {
  return (
    Deno.env.get("ANTHROPIC_API_KEY") ||
    Deno.env.get("CLAUDE_API") ||
    Deno.env.get("CLAUDE_API_KEY") ||
    null
  );
}

/** Discriminated result of {@link extractClaudeText}. */
export type ClaudeTextResult =
  | { ok: true; text: string }
  | { ok: false; reason: "empty" | "refused" | "overloaded" | "malformed" | "max_tokens"; detail: string };

/**
 * Safely extract the assistant text from a Claude Messages API response
 * (WEB-BE-003). Guards the `content[0].text` dereference that ~12 functions
 * did unchecked, which crashes on an empty/refused/overloaded response.
 *
 * Returns a discriminated result so callers can degrade gracefully (retry,
 * escalate, or return a clean error) instead of throwing a cryptic
 * "Cannot read properties of undefined" from a bad upstream shape.
 */
export function extractClaudeText(aiResult: unknown): ClaudeTextResult {
  const r = aiResult as {
    type?: string;
    stop_reason?: string;
    error?: { type?: string; message?: string };
    content?: Array<{ type?: string; text?: string }>;
  } | null | undefined;

  if (!r || typeof r !== "object") {
    return { ok: false, reason: "malformed", detail: "response is not an object" };
  }
  // Anthropic error envelope (e.g. overloaded_error, rate_limit_error).
  if (r.type === "error" || r.error) {
    const type = r.error?.type ?? "error";
    const overloaded = type.includes("overloaded") || type.includes("rate_limit");
    return {
      ok: false,
      reason: overloaded ? "overloaded" : "malformed",
      detail: r.error?.message ?? type,
    };
  }
  if (!Array.isArray(r.content) || r.content.length === 0) {
    return { ok: false, reason: "empty", detail: "no content blocks in response" };
  }
  // A refusal / non-text stop can still return content without a text block.
  const textBlock = r.content.find((b) => b?.type === "text" && typeof b.text === "string");
  // Thinking blocks can come first (adaptive thinking is on by default on
  // current models), so the text block is found by type, never by index.
  if (!textBlock || typeof textBlock.text !== "string" || textBlock.text.length === 0) {
    if (r.stop_reason === "refusal") {
      return { ok: false, reason: "refused", detail: "model refused to respond" };
    }
    if (r.stop_reason === "max_tokens") {
      // Thinking spends from max_tokens; the cap ran out before any text.
      return { ok: false, reason: "max_tokens", detail: "max_tokens reached before any text (thinking used the budget)" };
    }
    return { ok: false, reason: "empty", detail: "no text block in response content" };
  }
  return { ok: true, text: textBlock.text };
}

/**
 * Fetch AI configuration from database with caching
 * @param supabaseUrl Supabase project URL
 * @param supabaseKey Supabase service role key
 * @returns AI configuration object
 */
export async function getAIConfig(
  supabaseUrl: string,
  supabaseKey: string
): Promise<AIConfig> {
  const now = Date.now();

  // Return cached config if still valid
  if (configCache && now - cacheTimestamp < CACHE_DURATION) {
    return configCache;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from("ai_configuration")
      .select("setting_key, setting_value");

    if (error) {
      console.error("Error fetching AI config from database:", error);
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error("No AI configuration found in database");
    }

    // Convert array of settings to object
    const config: any = {};
    for (const setting of data) {
      config[setting.setting_key] = setting.setting_value;
    }

    // Cache the config — DB stores all values as strings, so parse numerics
    configCache = {
      api_endpoint: String(config.api_endpoint || "https://api.anthropic.com/v1/messages"),
      max_tokens_standard: parseInt(String(config.max_tokens_standard), 10) || 2000,
      max_tokens_large: parseInt(String(config.max_tokens_large), 10) || 8000,
      max_tokens_lightweight: parseInt(String(config.max_tokens_lightweight), 10) || 1000,
      temperature_precise: parseFloat(String(config.temperature_precise)) || 0.1,
      temperature_creative: parseFloat(String(config.temperature_creative)) || 0.7,
      anthropic_version: String(config.anthropic_version || "2023-06-01"),
    };
    cacheTimestamp = now;

    console.log("AI Config loaded from database:", {
      endpoint: config.api_endpoint,
    });

    return configCache;
  } catch (error) {
    console.error("Failed to fetch AI config, using fallback:", error);

    // Fallback to default values if database fetch fails. The model is not
    // part of this: it comes from aiModel.ts either way.
    const fallbackConfig: AIConfig = {
      api_endpoint: "https://api.anthropic.com/v1/messages",
      max_tokens_standard: 2000,
      max_tokens_large: 8000,
      max_tokens_lightweight: 1000,
      temperature_precise: 0.1,
      temperature_creative: 0.7,
      anthropic_version: "2023-06-01",
    };

    return fallbackConfig;
  }
}

/**
 * Build Claude API request body for lightweight/fast queries.
 * Uses lightweightModel() (LIGHTWEIGHT_AI_MODEL, else DEFAULT_AI_MODEL), shaped
 * for that model by shapeClaudeRequest().
 */
export async function buildLightweightClaudeRequest(
  messages: any[],
  options: {
    supabaseUrl: string;
    supabaseKey: string;
    customMaxTokens?: number;
    customTemperature?: number;
  }
): Promise<any> {
  const config = await getAIConfig(options.supabaseUrl, options.supabaseKey);

  const maxTokens = options.customMaxTokens ?? config.max_tokens_lightweight;
  const temperature = options.customTemperature ?? config.temperature_precise;

  const model = lightweightModel();
  console.log("Building LIGHTWEIGHT request with model:", model);

  return shapeClaudeRequest({
    model,
    max_tokens: maxTokens,
    temperature,
    messages,
  }, { lightweight: true });
}

/**
 * Get Claude API request headers using centralized configuration
 */
export async function getClaudeHeaders(
  claudeApiKey: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<Record<string, string>> {
  const config = await getAIConfig(supabaseUrl, supabaseKey);

  return {
    "Content-Type": "application/json",
    "x-api-key": claudeApiKey,
    "anthropic-version": config.anthropic_version,
  };
}

/**
 * Build Claude API request body with centralized configuration.
 * Uses defaultModel() (DEFAULT_AI_MODEL), shaped by shapeClaudeRequest().
 */
export async function buildClaudeRequest(
  messages: any[],
  options: {
    supabaseUrl: string;
    supabaseKey: string;
    useCreativeTemp?: boolean;
    useLargeTokens?: boolean;
    customMaxTokens?: number;
    customTemperature?: number;
  }
): Promise<any> {
  const config = await getAIConfig(options.supabaseUrl, options.supabaseKey);

  const maxTokens =
    options.customMaxTokens ??
    (options.useLargeTokens
      ? config.max_tokens_large
      : config.max_tokens_standard);

  const temperature =
    options.customTemperature ??
    (options.useCreativeTemp
      ? config.temperature_creative
      : config.temperature_precise);

  return shapeClaudeRequest({
    model: defaultModel(),
    max_tokens: maxTokens,
    temperature,
    messages,
  });
}
