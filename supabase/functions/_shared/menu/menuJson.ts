/**
 * Recovering `{sections: [...]}` from a model reply.
 *
 * Kept dependency-free and separate from `menuLlm.ts` so it can be unit-tested
 * without pulling in the Supabase client and the network layer.
 *
 * Still needed even though extraction now uses a schema-constrained tool call:
 * an `ai_config.api_endpoint` override could point at a proxy that ignores
 * `tools` and replies with prose, and a reply that hits `max_tokens` mid-object
 * arrives as a valid JSON *prefix* that closing the open brackets makes
 * parseable. Salvaging 40 of 50 items beats discarding the response.
 */

import type { MenuSection } from "./types.ts";

/** Parse a model reply into menu sections, repairing truncation if needed. */
export function parseMenuJson(text: string): MenuSection[] | null {
  if (!text) return null;

  const stripped = text
    .replace(/^\s*```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  const direct = tryParseSections(stripped);
  if (direct) return direct;

  const start = findObjectStart(stripped);
  if (start === -1) return null;

  for (const candidate of repairCandidates(stripped.slice(start))) {
    const sections = tryParseSections(candidate);
    if (sections) return sections;
  }

  return null;
}

/** Read a `sections` array out of an already-parsed value. */
export function sectionsOf(parsed: unknown): MenuSection[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  if (Array.isArray(parsed)) return parsed as MenuSection[];
  const node = parsed as Record<string, unknown>;
  const raw = node.sections ?? node.menu_sections ?? node.menu ?? node.menuSections;
  if (!Array.isArray(raw)) return null;
  return raw as MenuSection[];
}

function findObjectStart(text: string): number {
  for (const marker of ['{"sections"', '{ "sections"', '{"menu_sections"', '{"menu"']) {
    const index = text.indexOf(marker);
    if (index !== -1) return index;
  }
  return text.indexOf("{");
}

function tryParseSections(text: string): MenuSection[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // A reply may wrap the object in prose; take the outermost braces.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  return sectionsOf(parsed);
}

/**
 * Successively more aggressive truncation repairs: close the open brackets;
 * failing that, drop back to the last complete object and close from there.
 */
function* repairCandidates(body: string): Generator<string> {
  const lastBrace = body.lastIndexOf("}");
  if (lastBrace === -1) return;

  const truncated = body.slice(0, lastBrace + 1);
  yield truncated + closingFor(truncated);

  const lastItemEnd = truncated.lastIndexOf("},");
  if (lastItemEnd > 0) {
    const shorter = truncated.slice(0, lastItemEnd + 1);
    yield shorter + closingFor(shorter);
  }
}

/**
 * The delimiter run that would balance an unterminated JSON prefix.
 *
 * Must track a STACK, not two counters. Menu JSON nests
 * `{ sections: [ { items: [ {…} ] } ] }`, so the closers interleave —
 * counting braces and brackets separately and emitting all `]` then all `}`
 * produces `]]}}` where the document needs `]}]}`, and the "repair" fails to
 * parse exactly when it is needed most.
 */
export function closingFor(json: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (const ch of json) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  // A prefix cut mid-string needs the quote closed before its containers.
  return (inString ? '"' : "") + stack.reverse().join("");
}
