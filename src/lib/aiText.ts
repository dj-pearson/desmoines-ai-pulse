/**
 * Clean model-written text before it reaches a meta description, a snippet or
 * a page (SEO-057).
 *
 * The event "Schedule" (57564c69) had an enhanced_description that began
 * "**Enhanced Event Description:**" and ended with an empty "**Location:**";
 * its sibling "Iowa Cubs" ended "**Category:** Sports / **Location:**
 * Principal Park". The meta description built from the first started with the
 * label, asterisks included. 222 restaurant ai_writeup rows open with a
 * markdown "# Name - tagline" heading that AIWriteup printed with the hash.
 *
 * Three layers, each built on the one before:
 *   stripAiLabels         removes the model's own labels and footers and
 *                         keeps everything else, markdown included. This is
 *                         what the writers store and what the backfill did.
 *   markdownBlocks        paragraphs as plain text, headings flagged, for a
 *                         page that renders them as elements.
 *   markdownToPlainText   one line of plain text, for meta descriptions,
 *                         JSON-LD, RSS, ICS and card snippets.
 *
 * NO IMPORTS. functions/_middleware.ts imports this file into the Pages
 * bundle, and supabase/functions/_shared/aiText.ts is a byte-for-byte copy for
 * the Deno writers; _shared/aiText.test.ts fails when the two differ.
 */

const LABEL_NOUN = "(?:description|summary|overview|write-?up|blurb|listing|copy)";
const LABEL_QUALIFIERS =
  "(?:(?:ai|ai-enhanced|enhanced|improved|rewritten|revised|updated|new|seo|full|short|brief|final|event|restaurant|venue|attraction)\\s+){0,3}";

/**
 * A label line at the very start: optional heading hashes or bold, the label
 * words, a colon (inside or outside the bold), then the rest of that line. The
 * rest is kept when it is real text ("Description: Join us...").
 */
const LEADING_LABEL = new RegExp(
  `^\\s*(?:#{1,6}\\s*)?(?:\\*\\*|__)?\\s*${LABEL_QUALIFIERS}${LABEL_NOUN}\\s*(?::\\s*(?:\\*\\*|__)?|(?:\\*\\*|__)\\s*:|(?:\\*\\*|__)?(?=[ \\t]*(?:\\n|$)))[ \\t]*\\n?`,
  "i",
);

/** "Here's an enhanced description of the event:" on a line of its own. */
const LEADING_PREAMBLE =
  /^\s*(?:sure[,!.]?\s*)?(?:here(?:'s| is)|below is)\b[^\n]{0,160}:[ \t]*(?:\n|$)/i;

/** A trailing "**Location:** Principal Park" style field, or an empty one. */
const FOOTER_KEYS =
  "(?:category|location|venue|date|dates|time|times|when|where|price|prices|cost|tickets|admission|address|website|contact|phone|hours)";
const FOOTER_LINE = new RegExp(
  `^\\s*(?:\\*\\*|__)${FOOTER_KEYS}\\s*:\\s*(?:\\*\\*|__)\\s*[^\\n]{0,120}$|^\\s*(?:\\*\\*|__)${FOOTER_KEYS}(?:\\*\\*|__)\\s*:\\s*[^\\n]{0,120}$`,
  "i",
);

/**
 * Remove the labels and wrapper fields a model wraps around its answer. Keeps
 * the substance and its markdown; returns "" for null/undefined.
 */
export function stripAiLabels(text: string | null | undefined): string {
  let t = (text ?? "").replace(/\r\n?/g, "\n").trim();
  if (!t) return "";

  // Leading: a preamble and/or a label, possibly both, in either order.
  for (let i = 0; i < 3; i++) {
    const before = t;
    t = t.replace(LEADING_PREAMBLE, "").replace(LEADING_LABEL, "").replace(/^\s+/, "");
    if (t === before) break;
  }

  // Trailing: a run of bolded "Key:" fields at the end.
  const lines = t.split("\n");
  let end = lines.length;
  while (end > 0 && (lines[end - 1].trim() === "" || FOOTER_LINE.test(lines[end - 1]))) end--;
  // Only drop the run when it really was a footer, not the whole text.
  if (end > 0 && end < lines.length) t = lines.slice(0, end).join("\n");

  return t.trim();
}

/** Inline markdown to text: emphasis, code, links, images. */
function inlinePlain(s: string): string {
  return (
    s
      // Images keep their alt text; links keep their label.
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/`+([^`]*)`+/g, "$1")
      .replace(/(\*\*|__)(.+?)\1/g, "$2")
      // Single-asterisk emphasis; a lone "*" (footnote, rating) stays.
      .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1$2")
      // Underscore emphasis only at word edges, so snake_case survives.
      .replace(/(^|[^\w])_(?!\s)([^_\n]+?)_(?!\w)/g, "$1$2")
      // Any bold markers left unpaired by a cut.
      .replace(/\*\*|__/g, "")
      .replace(/[ \t]+/g, " ")
      .trim()
  );
}

export interface TextBlock {
  text: string;
  /** A markdown heading, or a line that was bold from end to end. */
  heading: boolean;
}

/**
 * Paragraphs as plain text. A heading, a fully bold line or a list item is a
 * block of its own; other consecutive lines join into one paragraph.
 */
export function markdownBlocks(text: string | null | undefined): TextBlock[] {
  const lines = stripAiLabels(text).split("\n");
  const blocks: TextBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    const joined = inlinePlain(para.join(" "));
    if (joined) blocks.push({ text: joined, heading: false });
    para = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^(?:[-*_]\s*){3,}$/.test(line)) {
      flush();
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.*?)\s*#*$/);
    const wholeBold = line.match(/^(?:\*\*|__)([^*_]+?)(?:\*\*|__)[:.]?$/);
    if (heading || wholeBold) {
      flush();
      const t = inlinePlain((heading ?? wholeBold)![1]);
      if (t) blocks.push({ text: t, heading: true });
      continue;
    }
    const item = line.match(/^(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (item) {
      flush();
      const t = inlinePlain(item[1]);
      if (t) blocks.push({ text: t, heading: false });
      continue;
    }
    para.push(line.replace(/^>\s?/, ""));
  }
  flush();
  return blocks;
}

/**
 * One line of plain text for a meta description, JSON-LD description, RSS
 * item, ICS DESCRIPTION or card snippet. A block that ends without
 * punctuation (a heading) gets a period so it does not run into the next;
 * the last block is left as written.
 */
export function markdownToPlainText(text: string | null | undefined): string {
  const blocks = markdownBlocks(text);
  return blocks
    .map((b, i) =>
      i === blocks.length - 1 || /[.!?:;,)"'\u2019\u201D]$/.test(b.text) ? b.text : `${b.text}.`,
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
