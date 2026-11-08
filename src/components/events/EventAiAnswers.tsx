import { AIDisclosureBadge } from "@/components/AIDisclosureBadge";
import { readGeoFaq } from "@/lib/restaurantMeta";

/**
 * The event's GEO fields (WEB-SEO-059): geo_summary, geo_key_facts and geo_faq.
 *
 * generate-seo-content writes all three with a model. The restaurant page
 * already settled how that text is published (src/lib/restaurantFaqs.ts,
 * eat-drink pass 2 WP3.1): visible, labelled as AI-assisted, and never inside
 * FAQPage JSON-LD. FAQPage is the site stating an answer as fact in the format
 * search engines and AI answer engines lift verbatim; a model's paraphrase of a
 * listing does not get to make that claim on our behalf. The event page used
 * to pass geo_faq to FAQSection with showSchema on and no label, so every event
 * with generated SEO content shipped model text as our FAQPage.
 *
 * So this renders a plain <dl>, no FAQSection and no JSON-LD, under the same
 * AI-assisted badge the "About This Event" heading already uses for enhanced
 * descriptions.
 */

interface EventAiAnswersProps {
  title: string;
  summary?: string | null;
  keyFacts?: string[] | null;
  faq?: unknown;
}

const TOOLTIP =
  "Written with AI from the event listing. Check times, prices and details with the organizer.";

export function EventAiAnswers({ title, summary, keyFacts, faq }: EventAiAnswersProps) {
  const cleanSummary = summary?.trim() || null;
  const facts = (keyFacts ?? []).map((f) => (typeof f === "string" ? f.trim() : "")).filter(Boolean);
  const answers = readGeoFaq(faq);

  return (
    <>
      {(cleanSummary || facts.length > 0) && (
        <section aria-labelledby="event-quick-facts" className="bg-card rounded-2xl border p-6 md:p-8">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 id="event-quick-facts" className="text-xl font-bold">
              Quick Facts
            </h2>
            <AIDisclosureBadge label="AI-assisted" tooltip={TOOLTIP} />
          </div>
          {cleanSummary && <p className="text-muted-foreground leading-relaxed">{cleanSummary}</p>}
          {facts.length > 0 && (
            <ul className="mt-4 list-disc pl-5 space-y-1 text-muted-foreground">
              {facts.map((fact, i) => (
                <li key={i}>{fact}</li>
              ))}
            </ul>
          )}
        </section>
      )}
      {answers.length > 0 && (
        <section aria-labelledby="event-ai-answers" className="bg-card rounded-2xl border p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="event-ai-answers" className="text-xl font-bold">
              {title}: Questions and Answers
            </h2>
            <AIDisclosureBadge label="AI-assisted" tooltip={TOOLTIP} />
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
      )}
    </>
  );
}
