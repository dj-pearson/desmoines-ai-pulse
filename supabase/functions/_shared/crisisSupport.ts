/**
 * Crisis detection and response for public free-text AI surfaces (WEB-LEGAL-005).
 *
 * Before this existed there was no floor at all: a search of the repo for
 * self-harm, suicide, crisis or 988 returned nothing. Pulse is prompted to
 * search the venue database and emit results through a forced tool call, so a
 * message from someone in distress produced restaurant picks or a tool-call
 * failure. Neither is acceptable, and no prompt wording fixes it, because the
 * model has no channel to answer in.
 *
 * DESIGN, and the reasoning behind each choice:
 *
 * - Detection runs BEFORE the model call and short-circuits it. The model never
 *   sees the message, so it cannot be talked out of responding and cannot fail
 *   to respond because of a tool constraint.
 *
 * - The response is static. Crisis copy is not something to let a language
 *   model compose fresh each time, and a deterministic reply is one we can test.
 *
 * - The matcher is deliberately narrow, and false negatives are preferred to
 *   false positives. This is a city guide; users type "killer tacos", "dying to
 *   try this place" and "this line is killing me" in ordinary use. Interrupting
 *   those with a crisis card would be both wrong and, repeated often enough,
 *   the reason someone disables the feature. So every pattern below requires
 *   first-person intent stated fairly explicitly. It will miss oblique phrasing.
 *   That is the accepted trade: this is a safety net over a product that is not
 *   a mental-health service, not a screening tool.
 *
 * - Nothing about a triggering message is logged, stored or counted. There is
 *   no consent basis for retaining it and no product reason to.
 *
 * If you widen these patterns, re-read the paragraph above first, and add the
 * new phrasing to the test suite in both directions - what must match and what
 * must not.
 */

export interface CrisisResource {
  name: string;
  contact: string;
  description: string;
}

/** US national services. Update only with verified, currently-operating lines. */
export const CRISIS_RESOURCES: readonly CrisisResource[] = [
  {
    name: "988 Suicide & Crisis Lifeline",
    contact: "Call or text 988",
    description: "Free, confidential support 24/7, anywhere in the US.",
  },
  {
    name: "Crisis Text Line",
    contact: "Text HOME to 741741",
    description: "Talk with a trained crisis counselor over text.",
  },
  {
    name: "Emergency services",
    contact: "911",
    description: "If you or someone else is in immediate danger.",
  },
];

export const CRISIS_MESSAGE =
  "It sounds like you may be going through something serious, and that matters " +
  "more than anything I can help you find. I'm a local events guide, so I'm not " +
  "the right kind of help - but people who are trained for this are available " +
  "right now, free and confidential.";

/** Plain-text rendering, for surfaces whose reply channel is a string. */
export function crisisMessageText(): string {
  const lines = CRISIS_RESOURCES.map(
    (r) => `- ${r.name}: ${r.contact}. ${r.description}`,
  );
  return `${CRISIS_MESSAGE}\n\n${lines.join("\n")}`;
}

/**
 * Each pattern requires first-person intent. Ordinary hyperbole about food,
 * queues and traffic must not match; see the "does not match" cases in the
 * test suite, which are as load-bearing as the "matches" cases.
 */
const CRISIS_PATTERNS: readonly RegExp[] = [
  // Explicit self-directed lethal intent.
  /\bkill(?:ing)?\s+myself\b/i,
  /\b(?:end|ending|take|taking)\s+my\s+(?:own\s+)?life\b/i,
  /\bcommit(?:ting)?\s+suicide\b/i,
  /\bsuicidal\b/i,
  /\bkms\b/i,

  // Stated wish to die. "want to die" does not match "dying to try this place".
  /\b(?:want|wanna|wish|wanted)\s+(?:to\s+)?die\b/i,
  /\b(?:do\s?n[o']?t|don't|dont)\s+want\s+to\s+(?:be\s+alive|live)\b/i,
  /\bno\s+(?:reason|point)\s+(?:to|in)\s+liv(?:e|ing)\b/i,
  /\bbetter\s+off\s+dead\b/i,
  /\bwant\s+it\s+(?:all\s+)?to\s+end\b/i,

  // Self-harm.
  /\bself[\s-]?harm(?:ing)?\b/i,
  /\b(?:hurt|harm|cut)(?:ting)?\s+myself\b/i,
];

/**
 * True when the text states first-person crisis intent clearly enough to act on.
 * Guards against pathological input length before running the patterns.
 */
export function detectCrisisIntent(text: unknown): boolean {
  if (typeof text !== "string") return false;
  const sample = text.slice(0, 4000);
  if (!sample.trim()) return false;
  return CRISIS_PATTERNS.some((p) => p.test(sample));
}

/** Scan a conversation, checking only what the user wrote. */
export function conversationHasCrisisIntent(
  messages: unknown,
): boolean {
  if (!Array.isArray(messages)) return false;
  return messages.some(
    (m) =>
      m && typeof m === "object" &&
      (m as { role?: unknown }).role === "user" &&
      detectCrisisIntent((m as { content?: unknown }).content),
  );
}

/**
 * The structured body every surface returns. `crisis: true` is the flag clients
 * branch on; the message and resources are included so a client that has not
 * been updated yet can still render something useful from the same payload.
 */
export function crisisPayload(): {
  crisis: true;
  message: string;
  resources: readonly CrisisResource[];
} {
  return { crisis: true, message: CRISIS_MESSAGE, resources: CRISIS_RESOURCES };
}
