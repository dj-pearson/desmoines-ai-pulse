import { AIDisclosureBadge } from "@/components/AIDisclosureBadge";
import { PlainTextBlocks } from "@/components/PlainTextBlocks";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import { CENTRAL_TIMEZONE } from "@/lib/timezone";

interface AIWriteupProps {
  writeup: string;
  generatedAt?: string | null;
  /** Accepted for call-site compatibility; the prompt is never shown. */
  prompt?: string | null;
  className?: string;
  /** 3 inside another section (event page), 2 as a page section of its own. */
  headingLevel?: 2 | 3;
}

/**
 * The "written" date, in Central. toLocaleDateString used the reader's zone,
 * and the prerenderer's (UTC): a writeup generated at 9 PM CDT on the 24th
 * prerendered as "September 25" and hydrated to "September 24" in a Central
 * browser. Same fix as ListFreshness.
 */
function formatWrittenDate(dateString: string): string | null {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return formatInTimeZone(date, CENTRAL_TIMEZONE, "MMMM d, yyyy");
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
  const written = generatedAt ? formatWrittenDate(generatedAt) : null;
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
      {/* Most restaurant writeups open with a markdown "# Name" line, which
          printed with its hash (SEO-057). */}
      <PlainTextBlocks
        text={writeup}
        className="max-w-[70ch] text-base leading-relaxed text-foreground/90"
      />
    </section>
  );
}

export default AIWriteup;
