/**
 * Unit tests for reading a streamed Claude reply into menu sections.
 * Run with: `deno test supabase/functions/_shared/menu/menuStream.test.ts`
 *
 * The case that matters is the cut-off one: the run deadline aborts the
 * stream mid-tool-input, and the complete items that already arrived must
 * survive while the half-written one must not be invented.
 */
import {
  applyStreamEvent,
  createStreamState,
  sectionsFromStream,
  splitSseEvents,
} from "./menuStream.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function assertEquals(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}

function sse(type: string, payload: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`;
}

const TOOL_START = sse("content_block_start", {
  index: 0,
  content_block: { type: "tool_use", id: "toolu_1", name: "record_menu", input: {} },
});

function jsonDelta(partial: string): string {
  return sse("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: partial } });
}

const FULL_INPUT =
  '{"sections":[{"section_name":"Tacos","section_sort_order":0,"items":[' +
  '{"item_name":"Al Pastor","price":"$3"},' +
  '{"item_name":"Carnitas","price":"$3.50"}]}]}';

/** Feed a whole SSE transcript through split + apply, in uneven pieces. */
function run(transcript: string, pieceSize = 37) {
  const state = createStreamState();
  let buffer = "";
  for (let i = 0; i < transcript.length; i += pieceSize) {
    buffer += transcript.slice(i, i + pieceSize);
    const { events, rest } = splitSseEvents(buffer);
    buffer = rest;
    for (const e of events) applyStreamEvent(state, e);
  }
  for (const e of splitSseEvents(buffer + "\n\n").events) applyStreamEvent(state, e);
  return state;
}

Deno.test("splitSseEvents keeps an unfinished event as the remainder", () => {
  const { events, rest } = splitSseEvents('data: {"a":1}\n\ndata: {"b"');
  assertEquals(events, ['{"a":1}'], "one complete event");
  assertEquals(rest, 'data: {"b"', "partial kept");
});

Deno.test("splitSseEvents accepts CRLF line endings", () => {
  const { events } = splitSseEvents('event: ping\r\ndata: {"type":"ping"}\r\n\r\n');
  assertEquals(events, ['{"type":"ping"}'], "CRLF event parsed");
});

Deno.test("a complete streamed tool call parses with no truncation", () => {
  const transcript = sse("message_start", { message: { stop_reason: null } }) +
    TOOL_START +
    jsonDelta(FULL_INPUT.slice(0, 50)) +
    jsonDelta(FULL_INPUT.slice(50)) +
    sse("content_block_stop", { index: 0 }) +
    sse("message_delta", { delta: { stop_reason: "tool_use" } }) +
    sse("message_stop", {});
  const result = sectionsFromStream(run(transcript));
  assertEquals(result.truncated, null, "not truncated");
  assertEquals(result.sections?.[0].items.map((i) => i.item_name), ["Al Pastor", "Carnitas"], "both items");
});

Deno.test("a stream cut off mid-item keeps the complete items only", () => {
  const cut = FULL_INPUT.indexOf('{"item_name":"Carnitas"') + 18; // inside the second item
  const transcript = TOOL_START + jsonDelta(FULL_INPUT.slice(0, cut));
  const result = sectionsFromStream(run(transcript));
  assertEquals(result.truncated, "cut_off", "reported as cut off");
  assertEquals(result.sections?.[0].items.map((i) => i.item_name), ["Al Pastor"], "half-written item dropped");
});

Deno.test("a reply that hits max_tokens is salvaged and labelled", () => {
  const cut = FULL_INPUT.indexOf('{"item_name":"Carnitas"') + 5;
  const transcript = TOOL_START +
    jsonDelta(FULL_INPUT.slice(0, cut)) +
    sse("message_delta", { delta: { stop_reason: "max_tokens" } }) +
    sse("message_stop", {});
  const result = sectionsFromStream(run(transcript));
  assertEquals(result.truncated, "max_tokens", "labelled max_tokens");
  assertEquals(result.sections?.[0].items.length, 1, "one complete item recovered");
});

Deno.test("a stream cut off before any complete item yields nothing", () => {
  const transcript = TOOL_START + jsonDelta('{"sections":[{"section_na');
  const result = sectionsFromStream(run(transcript));
  assertEquals(result.sections, null, "nothing invented");
  assertEquals(result.truncated, "cut_off", "still reported as cut off");
});

Deno.test("prose text is the fallback when no tool call arrived", () => {
  const transcript = sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }) +
    sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Here it is: " } }) +
    sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: FULL_INPUT } }) +
    sse("message_stop", {});
  const result = sectionsFromStream(run(transcript));
  assertEquals(result.sections?.[0].items.length, 2, "parsed from text");
});

Deno.test("a tool call with another name is ignored", () => {
  const transcript = sse("content_block_start", {
    index: 0,
    content_block: { type: "tool_use", name: "something_else", input: {} },
  }) + jsonDelta(FULL_INPUT) + sse("message_stop", {});
  assertEquals(sectionsFromStream(run(transcript)).sections, null, "wrong tool not read");
});

Deno.test("an error event is recorded", () => {
  const state = run(sse("error", { error: { type: "overloaded_error", message: "Overloaded" } }));
  assertEquals(state.error, { type: "overloaded_error", message: "Overloaded" }, "error captured");
  assert(!state.complete, "not complete");
});

Deno.test("malformed and unknown events do not throw", () => {
  const state = createStreamState();
  applyStreamEvent(state, "not json");
  applyStreamEvent(state, '{"type":"ping"}');
  applyStreamEvent(state, '{"type":"content_block_delta","index":5,"delta":{"type":"text_delta","text":"x"}}');
  assertEquals(state.blocks.length, 0, "no blocks invented");
});
