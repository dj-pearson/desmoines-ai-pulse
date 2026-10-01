import { Link } from "react-router-dom";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/** A run of answer text, or an in-app link that reads as its label in plain text. */
type FaqSegment = string | { to: string; label: string };

export interface PricingFaqItem {
  question: string;
  answer: FaqSegment[];
}

const SUBSCRIPTION_LINK: FaqSegment = { to: "/subscription", label: "your subscription page" };

/**
 * Every answer here has to be true today, because the same array feeds the
 * FAQPage JSON-LD that search engines quote.
 *
 * "Can I switch plans?" said upgrades were prorated and downgrades waited for
 * renewal. Neither was true: a switch charged the new price at once and the
 * webhook never moved the row to the new plan (pricing plan WP5). Online plan
 * changes are paused until D1 and D2 deploy; when they do, this answer and
 * IN_PLACE_PLAN_CHANGE_ENABLED change in the same PR.
 */
export const PRICING_FAQS: PricingFaqItem[] = [
  {
    question: "Do subscriptions auto-renew?",
    answer: [
      "Yes. Insider and VIP renew at the end of each billing period (every month or every year) at the same price until you cancel. You can cancel online any time from ",
      SUBSCRIPTION_LINK,
      ". There's no phone call and no retention offer to get past, and you keep access until the end of the period you already paid for.",
    ],
  },
  {
    question: "Can I cancel any time?",
    answer: [
      "Yes. Open ",
      SUBSCRIPTION_LINK,
      " and press Cancel. That stops every future charge, and you keep access until the current period ends. If you subscribed in the iPhone app, Apple bills you, so cancel in Settings, Apple ID, Subscriptions. If you subscribed in the Android app, cancel in Google Play, Subscriptions.",
    ],
  },
  {
    question: "Is there a free trial?",
    answer: [
      "First-time Insider and VIP subscribers get a 7-day free trial. If you've had a trial before, on any plan or platform, billing starts the day you subscribe. We email you before a trial ends. If you don't cancel by then, the plan price shown at checkout is charged and renews each period. Cancel during the trial from ",
      SUBSCRIPTION_LINK,
      " and you won't be charged.",
    ],
  },
  {
    question: "How do I pay?",
    answer: [
      "Payment goes through Stripe Checkout, which takes major credit and debit cards. Your card number goes to Stripe and is never stored on our servers.",
    ],
  },
  {
    question: "Can I switch plans?",
    answer: [
      "Not online right now. Plan changes are paused while we fix a billing problem, and your current plan stays as it is. To switch, email billing@desmoinesinsider.com and we'll do it for you. You can still cancel from ",
      SUBSCRIPTION_LINK,
      " at any time.",
    ],
  },
  {
    question: "What about refunds?",
    answer: [
      "We don't refund partial months or years. When you cancel you keep access through the end of the period you paid for. If you think you were charged by mistake, email billing@desmoinesinsider.com within 30 days and we'll look into it.",
    ],
  },
];

/** The answer as plain text, for JSON-LD. A link becomes its label. */
export function faqAnswerText(item: PricingFaqItem): string {
  return item.answer.map((seg) => (typeof seg === "string" ? seg : seg.label)).join("");
}

interface PricingFaqProps {
  faqs?: PricingFaqItem[];
}

export function PricingFaq({ faqs = PRICING_FAQS }: PricingFaqProps) {
  return (
    <section aria-labelledby="pricing-faq-heading" className="py-16">
      <div className="container mx-auto px-4">
        <h2 id="pricing-faq-heading" className="text-3xl font-bold text-foreground mb-8 text-center">
          Questions about billing
        </h2>
        <Accordion type="multiple" className="max-w-3xl mx-auto">
          {faqs.map((faq) => (
            <AccordionItem key={faq.question} value={faq.question}>
              <AccordionTrigger className="text-left text-base min-h-11">{faq.question}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed max-w-[70ch]">
                {faq.answer.map((seg, i) =>
                  typeof seg === "string" ? (
                    <span key={i}>{seg}</span>
                  ) : (
                    <Link key={i} to={seg.to} className="text-primary underline underline-offset-4">
                      {seg.label}
                    </Link>
                  ),
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
