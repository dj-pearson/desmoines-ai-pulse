/**
 * FAQ answers for a playground detail page. FAQSection publishes these as
 * FAQPage, so every answer is a factual claim a search engine or AI answer
 * can lift verbatim.
 *
 * Built from the row and nothing else (SEO-014). There is deliberately no
 * rating answer (WEB-SEO-055): playgrounds.rating is not first-party. The
 * ai-crawler and firecrawl-scraper playground paths store whatever number the
 * model read off a crawled page (`rating: item.rating || null`), and
 * enhance-content lists rating among the fields it asks a model to fill. No
 * column records whose rating it was, so "X is rated 4.5 out of 5" would be an
 * unattributed claim. Attractions dropped the same answer for the same reason.
 */
export interface PlaygroundFaqRow {
  name: string;
  age_range?: string | null;
  location?: string | null;
  latitude?: number | null;
  amenities?: string[] | null;
}

export interface PlaygroundFaq {
  question: string;
  answer: string;
}

export function buildPlaygroundFaqs(playground: PlaygroundFaqRow): PlaygroundFaq[] {
  const { name } = playground;
  const faqs: PlaygroundFaq[] = [];
  if (playground.age_range) {
    faqs.push({
      question: `What ages is ${name} suitable for?`,
      answer: `${name} is listed for ages ${playground.age_range}. Always supervise children during play.`,
    });
  }
  if (playground.location) {
    faqs.push({
      question: `Where is ${name} located?`,
      answer: `${name} is at ${playground.location}.${playground.latitude ? " The map on this page gives directions." : ""}`,
    });
  }
  if (playground.amenities && playground.amenities.length > 0) {
    faqs.push({
      question: `What amenities does ${name} have?`,
      answer: `${name} lists these amenities: ${playground.amenities.join(", ")}.`,
    });
  }
  return faqs;
}
