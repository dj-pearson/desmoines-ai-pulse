import { Helmet } from "react-helmet-async";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSectionProps {
  faqs: FAQItem[];
  title?: string;
  description?: string;
  showSchema?: boolean;
  className?: string;
}

export function FAQSection({ 
  faqs, 
  title = "Frequently Asked Questions",
  description,
  showSchema = true,
  className = ""
}: FAQSectionProps) {
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());

  const toggleItem = (index: number) => {
    const newOpenItems = new Set(openItems);
    if (newOpenItems.has(index)) {
      newOpenItems.delete(index);
    } else {
      newOpenItems.add(index);
    }
    setOpenItems(newOpenItems);
  };

  // FAQ Schema for SEO
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
          <script type="application/ld+json">
            {JSON.stringify(faqSchema)}
          </script>
        </Helmet>
      )}
      
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-2xl">{title}</CardTitle>
          {description && (
            <p className="text-muted-foreground">{description}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {faqs.map((faq, index) => (
            <div key={index} className="border border-border rounded-lg">
              {/* `whitespace-normal` overrides the Button base style, which sets
                  `whitespace-nowrap` (see components/ui/button.tsx). Without it a
                  long FAQ question cannot wrap, so it ran past the viewport and
                  gave the whole page horizontal scroll on phones — up to 215px of
                  overflow at 320px wide. `min-w-0` lets the span shrink below its
                  content size, which a flex child does not do by default.
                  (WEB-QA-008) */}
              <Button
                variant="ghost"
                className="w-full justify-between p-4 h-auto text-left whitespace-normal"
                onClick={() => toggleItem(index)}
              >
                <span className="font-semibold pr-4 min-w-0 break-words">{faq.question}</span>
                {openItems.has(index) ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                )}
              </Button>
              
              {openItems.has(index) && (
                <div className="px-4 pb-4">
                  <div className="pt-2 border-t border-border">
                    <p className="text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}