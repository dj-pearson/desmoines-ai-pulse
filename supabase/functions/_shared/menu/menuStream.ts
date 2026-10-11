/**
 * Reading a streamed Claude reply into menu sections.
 *
 * WHY STREAM
 * ----------
 * A non-streamed request returns nothing until the model finishes. When the
 * run deadline cuts it off, every token it produced is lost. Streamed, the
 * tool input arrives as `input_json_delta` fragments, so a reply cut off by
 * the deadline (or by max_tokens) is a valid JSON *prefix*, and
 * `parseMenuJson` already knows how to close one and keep the complete items.
 *
 * It also fixes a quieter loss: a non-streamed tool call that hits max_tokens
 * comes back with an incomplete `input`, which `sectionsOf` rejects, so the
 * old max_tokens "recovery" only ever worked for prose replies.
 *
 * Dependency-free (no network, no Supabase) so it is unit-tested directly.
 */

import type { MenuSection } from "./types.ts";
import { parseMenuJson, sectionsOf } from "./menuJson.ts";

export interface StreamBlock {
  type: string;
  name?: string;
  /** Concatenated `partial_json` for a tool_use block. */
  json: string;
  /** Concatenated text for a text block. */
  text: string;
}

export interface StreamState {
  blocks: StreamBlock[];
  stopReason: string | null;
  /** An `error` event sent mid-stream (e.g. overloaded_error). */
  error: { type: string; message: string } | null;
  /** True once `message_stop` arrived; false means the stream was cut off. */
  complete: boolean;
}

export function createStreamState(): StreamState {
  return { blocks: [], stopReason: null, error: null, complete: false };
}

/**
 * Split buffered SSE text into complete events and the unfinished remainder.
 * Events are separated by a blank line; only `data:` lines are kept, since the
 * JSON payload repeats the event type.
 */
export function splitSseEvents(buffer: string): { events: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: string[] = [];
  for (const part of parts) {
    const data = part
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (data) events.push(data);
  }
  return { events, rest };
}

/** Fold one SSE `data:` payload into the state. Unknown or malformed events are ignored. */
export function applyStreamEvent(state: StreamState, data: string): void {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(data);
  } catch {
    return;
  }

  switch (event.type) {
    case "content_block_start": {
      const index = Number(event.index);
      const block = (event.content_block ?? {}) as Record<string, unknown>;
      if (!Number.isInteger(index) || index < 0) return;
      state.blocks[index] = {
        type: String(block.type ?? ""),
        name: typeof block.name === "string" ? block.name : undefined,
        json: "",
        text: typeof block.text === "string" ? block.text : "",
      };
      return;
    }
    case "content_block_delta": {
      const index = Number(event.index);
      const delta = (event.delta ?? {}) as Record<string, unknown>;
      const block = state.blocks[index];
      if (!block) return;
      if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
        block.json += delta.partial_json;
      } else if (delta.type === "text_delta" && typeof delta.text === "string") {
        block.text += delta.text;
      }
      return;
    }
    case "message_delta": {
      const delta = (event.delta ?? {}) as Record<string, unknown>;
      if (typeof delta.stop_reason === "string") state.stopReason = delta.stop_reason;
      return;
    }
    case "message_stop":
      state.complete = true;
      return;
    case "error": {
      const error = (event.error ?? {}) as Record<string, unknown>;
      state.error = {
        type: String(error.type ?? "error"),
        message: String(error.message ?? ""),
      };
      return;
    }
  }
}

export interface StreamResult {
  sections: MenuSection[] | null;
  /**
   * Why the reply is incomplete, when it is: "max_tokens" (the model ran out of
   * output budget) or "cut_off" (the stream ended without message_stop, which
   * is what a deadline abort looks like). Null for a complete reply.
   */
  truncated: "max_tokens" | "cut_off" | null;
}

/**
 * Read the sections out of whatever the stream delivered.
 *
 * The `record_menu` tool input is preferred; a complete one is parsed
 * directly, a partial one goes through the prefix repair. Text is the
 * fallback for an endpoint that ignored `tools`.
 */
export function sectionsFromStream(state: StreamState, toolName = "record_menu"): StreamResult {
  const truncated = state.stopReason === "max_tokens"
    ? "max_tokens"
    : !state.complete
    ? "cut_off"
    : null;

  for (const block of state.blocks) {
    if (!block || block.type !== "tool_use" || block.name !== toolName || !block.json) continue;
    let sections: MenuSection[] | null = null;
    try {
      sections = sectionsOf(JSON.parse(block.json));
    } catch {
      sections = parseMenuJson(block.json);
    }
    if (sections) return { sections, truncated };
  }

  const text = state.blocks
    .filter((b) => b && b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n");
  return { sections: text ? parseMenuJson(text) : null, truncated };
}
