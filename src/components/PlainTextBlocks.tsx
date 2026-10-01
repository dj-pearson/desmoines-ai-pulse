import { markdownBlocks } from "@/lib/aiText";
import { cn } from "@/lib/utils";

interface PlainTextBlocksProps {
  /** Stored copy that may carry markdown or a model label. */
  text: string | null | undefined;
  /** Classes for each paragraph. */
  paragraphClassName?: string;
  /** Classes for a block that was a markdown heading or a fully bold line. */
  headingClassName?: string;
  className?: string;
}

/**
 * Model-written copy as paragraphs (SEO-057). Markdown headings become a
 * bold paragraph rather than an h-element, so a writeup's "# Name" line does
 * not compete with the page's own heading outline; labels like
 * "**Enhanced Event Description:**" are dropped. Text only, never HTML.
 */
export function PlainTextBlocks({ text, paragraphClassName, headingClassName, className }: PlainTextBlocksProps) {
  const blocks = markdownBlocks(text);
  if (blocks.length === 0) return null;
  return (
    <div className={cn("space-y-3", className)}>
      {blocks.map((b, i) => (
        <p key={i} className={b.heading ? cn("font-semibold text-foreground", headingClassName) : paragraphClassName}>
          {b.text}
        </p>
      ))}
    </div>
  );
}
