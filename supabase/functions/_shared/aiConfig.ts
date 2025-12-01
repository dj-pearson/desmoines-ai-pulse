/**
 * Centralized AI Configuration Utility
 *
 * This module provides a unified way to fetch AI settings from the database
 * for all edge functions. Update settings in the Admin Dashboard AI Configuration
 * section and all modules will automatically use the new values.
 *
 * Supports two model modes:
 * - default_model: Full-powered model (Claude Sonnet) for complex tasks
 * - lightweight_model: Fast, cheap model (Claude Haiku) for simple queries like NLP search
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface AIConfig {
  default_model: string;
  lightweight_model: string;
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

    // Cache the config
    configCache = config as AIConfig;
    cacheTimestamp = now;

    console.log("AI Config loaded from database:", {
      model: config.default_model,
      endpoint: config.api_endpoint,
    });

    return configCache;
  } catch (error) {
    console.error("Failed to fetch AI config, using fallback:", error);

    // Fallback to default values if database fetch fails
    // Using Claude 4.5 Sonnet as the default model (most capable)
    const fallbackConfig: AIConfig = {
      default_model: "claude-sonnet-4-5-20250929",
      lightweight_model: "claude-haiku-4-5-20251001",
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
 * Build Claude API request body for lightweight/fast queries
 * Uses the lightweight model (Haiku) for quick, cheap operations like NLP parsing
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

  console.log("Building LIGHTWEIGHT request with model:", config.lightweight_model);

  return {
    model: config.lightweight_model,
    max_tokens: maxTokens,
    temperature,
    messages,
  };
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
 * Build Claude API request body with centralized configuration
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

  return {
    model: config.default_model,
    max_tokens: maxTokens,
    temperature,
    messages,
  };
}
