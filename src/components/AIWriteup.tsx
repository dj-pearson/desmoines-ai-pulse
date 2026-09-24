import { AIDisclosureBadge } from "@/components/AIDisclosureBadge";
import { cn } from "@/lib/utils";

interface AIWriteupProps {
  writeup: string;
  generatedAt?: string | null;
  /** Accepted for call-site compatibility; the prompt is never shown. */
  prompt?: string | null;
  className?: string;
  /** 3 inside another section (event page), 2 as a page section of its own. */
  headingLevel?: 2 | 3;
}

function formatDate(dateString: string): string | null {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * The AI-written overview on restaurant and event pages.
 *
 * Labelled as ours and as AI-assisted, in the heading and with the shared
 * disclosure badge. It used to be a gradient card titled "Enhanced Overview",
 * which read as editorial copy and said nothing about how it was made
 * (restaurants plan WP8 item 11).
 */
export function AIWriteup({ writeup, generatedAt, className, headingLevel = 3 }: AIWriteupProps) {
  const written = generatedAt ? formatDate(generatedAt) : null;
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <section aria-labelledby="ai-writeup-heading" className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Heading
          id="ai-writeup-heading"
          className={cn("font-semibold text-foreground", headingLevel === 2 ? "text-xl" : "text-lg")}
        >
          Our take
        </Heading>
        <AIDisclosureBadge
          label="AI-assisted"
          tooltip="Drafted with AI from public information. It can be wrong or out of date, so check times, hours, prices and details with the venue."
        />
      </div>
      {written && <p className="text-sm text-muted-foreground">Written {written}</p>}
      <div className="max-w-[70ch] whitespace-pre-wrap text-base leading-relaxed text-foreground/90">
        {writeup}
      </div>
    </section>
  );
}

export default AIWriteup;
