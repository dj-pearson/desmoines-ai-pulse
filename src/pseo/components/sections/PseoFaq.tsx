import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { PseoFaqItem } from '../../schemas';

interface PseoFaqProps {
  heading: string;
  faqs: PseoFaqItem[];
}

export function PseoFaq({ heading, faqs }: PseoFaqProps) {
  if (!faqs.length) return null;

  return (
    <section>
      <h2 className="text-2xl font-bold mb-4">{heading}</h2>
      <Accordion type="single" collapsible className="w-full">
        {faqs.map((faq, index) => (
          <AccordionItem key={index} value={`faq-${index}`}>
            <AccordionTrigger className="text-left">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-muted-foreground">{faq.answer}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
