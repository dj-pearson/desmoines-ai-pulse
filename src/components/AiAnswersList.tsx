import { AIDisclosureBadge } from "@/components/AIDisclosureBadge";
import { readGeoFaq } from "@/lib/restaurantMeta";

/**
 * A model-written geo_faq, shown as plain markup under an AI-assisted badge
 * and never as FAQPage JSON-LD (WEB-SEO-059 for events, WEB-SEO-060 for hotels).
 *
 * FAQPage is the site stating an answer as fact in the format search engines
 * and AI answer engines lift verbatim. The restaurant page settled that a
 * model's answers don't get to make that claim for us (src/lib/restaurantFaqs.ts,
 * eat-drink pass 2 WP3.1). This is the one place the visible half of that rule
 * lives, so event and hotel pages can't drift apart on it. Use FAQSection only
 * for answers read off the row, which may carry schema.
 */

interface AiAnswersListProps {
  /** Heading text, e.g. "Questions about Hotel X". */
  title: string;
  /** The row's geo_faq, any shape; readGeoFaq drops what isn't a question and answer. */
  faq: unknown;
  /** What the badge says the text was written from, and what to check. */
  tooltip: string;
  /** id for the heading, so the section is labelled by it. */
  headingId: string;
  className?: string;
  headingClassName?: string;
}

export function AiAnswersList({
  title,
  faq,
  tooltip,
  headingId,
  className,
  headingClassName = "text-xl font-bold",
}: AiAnswersListProps) {
  const answers = readGeoFaq(faq);
  if (answers.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={headingId} className={headingClassName}>
          {title}
        </h2>
        <AIDisclosureBadge label="AI-assisted" tooltip={tooltip} />
      </div>
      <dl className="mt-4 divide-y divide-border">
        {answers.map((item) => (
          <div key={item.question} className="py-3">
            <dt className="font-medium text-foreground">{item.question}</dt>
            <dd className="mt-1 max-w-prose text-muted-foreground">{item.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
