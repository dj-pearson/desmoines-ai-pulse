import { Helmet } from "react-helmet-async";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { toJsonLd } from "@/lib/jsonLd";

export interface FAQLink {
  label: string;
  /** An internal route, rendered as a router <Link>. */
  to: string;
}

export interface FAQItem {
  question: string;
  answer: string;
  /**
   * Hubs the answer describes. Rendered as links under the answer only;
   * acceptedAnswer.text stays the plain answer, so the JSON-LD is unchanged.
   */
  links?: FAQLink[];
}

type FAQHeadingLevel = "h2" | "h3" | "h4";

interface FAQSectionProps {
  faqs: FAQItem[];
  title?: string;
  description?: string;
  showSchema?: boolean;
  className?: string;
  /** Level of the section title. Defaults to h2; pass h3 when nested under one. */
  headingLevel?: FAQHeadingLevel;
}

export function FAQSection({
  faqs,
  title = "Frequently Asked Questions",
  description,
  showSchema = true,
  className = "",
  headingLevel = "h2",
}: FAQSectionProps) {
  const Heading = headingLevel;

  // FAQ Schema for SEO. toJsonLd, not JSON.stringify: event pages pass
  // AI-written geo_faq rows through here, and a "</script>" inside one would
  // end the script element early (WP5 item 7, docs/page-plans/home.md).
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map((faq) => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  };

  return (
    <>
      {showSchema && (
        <Helmet>
          <script type="application/ld+json">{toJsonLd(faqSchema)}</script>
        </Helmet>
      )}

      <Card className={className}>
        <CardHeader>
          <Heading className="text-2xl font-semibold leading-tight">{title}</Heading>
          {description && (
            <p className="text-muted-foreground">{description}</p>
          )}
        </CardHeader>
        <CardContent>
          {/* <details>, not a stateful accordion (WP5 item 6). The old version
              mounted an answer only while it was open, so the prerendered HTML
              carried the questions and none of the answers, which is what the
              FAQPage block claims is on the page. A closed <details> keeps its
              content in the DOM; the browser handles the toggle and keyboard. */}
          <ul className="divide-y divide-border">
            {faqs.map((faq, index) => (
              <li key={index}>
                <details className="group">
                  {/* min-w-0 + break-words: a long question has to wrap rather
                      than widen the page on a 320px phone (WEB-QA-008). */}
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-md py-4 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 break-words">{faq.question}</span>
                    <ChevronDown
                      className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="pb-4">
                    <p className="max-w-prose leading-relaxed text-muted-foreground">
                      {faq.answer}
                    </p>
                    {faq.links && faq.links.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                        {faq.links.map((link) => (
                          <li key={link.to}>
                            <Link
                              to={link.to}
                              className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4 hover:no-underline"
                            >
                              {link.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
