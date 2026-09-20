/**
 * The SEO/GEO prompts, as pure functions (WEB-BE-053).
 *
 * EXTRACTED so a test can read what they actually ask for. index.ts imports
 * supabase-js and the Deno http server from remote URLs, so nothing in it can
 * be imported by a test at all - the same reason _shared/stripeSubscriptionRow,
 * restaurant-opening-scraper/summary and bulk-enhance-events/prompt exist.
 *
 * WHY THE GROUNDING RULE IS HERE TWICE OVER. These prompts take ai_writeup as
 * an input, and ai_writeup was produced by a prompt that instructed the model
 * to invent attendance figures and attribute quotes to the Des Moines Register.
 * So a single fabricated sentence became a published keyFact and a published
 * FAQ answer as well as a published paragraph. Grounding the writeup without
 * grounding these would have left two of the three surfaces unchanged.
 */

// Exported so supabase/functions/_tests/writeup-grounding.test.ts can read the
// real output rather than grep this file for strings it used to contain
// (WEB-BE-053). The AI Writeup above is why this matters twice over: a
// fabricated writeup becomes a fabricated keyFact and a fabricated FAQ answer.
// deno-lint-ignore no-explicit-any
export function createEventSEOPrompt(event: any): string {
  return `Generate comprehensive SEO and GEO optimization content for this Des Moines event. Return ONLY a JSON object with these exact fields:

{
  "title": "SEO title (under 60 chars, include event name + Des Moines + date)",
  "description": "Meta description (150-155 chars, compelling with local keywords)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "h1": "H1 tag matching primary search intent",
  "summary": "2-3 sentence GEO summary for AI engines, location-focused",
  "keyFacts": ["up to 4 facts, each supported by the details below"],
  "faq": [
    {"question": "When is [event]?", "answer": "Answer with date and time"},
    {"question": "Where is [event] located?", "answer": "Answer with venue and Des Moines"},
    {"question": "What type of event is [event]?", "answer": "Answer with category"}
  ]
}

Event Details:
- Title: ${event.title}
- Venue: ${event.venue || 'N/A'}
- Location: ${event.location}
- Date: ${event.date}
- Category: ${event.category}
- AI Writeup: ${event.ai_writeup ? event.ai_writeup.substring(0, 200) + '...' : 'N/A'}

GROUNDING RULE (WEB-BE-053): every keyFact and every FAQ answer must be
supported by the details listed above. Do not invent attendance figures,
founding years, capacities, prices, awards, rankings, quotes or citations, and
do not attribute anything to a publication or a person. If a detail reads
"N/A", the honest answer is that the listing does not say - write that, or omit
the fact entirely.

FEWER IS CORRECT. keyFacts is a list, not four slots to fill: return two facts
if the data supports two. An invented fourth fact is worse than a short list,
because it is published verbatim and read back by AI assistants.

Focus on Des Moines local SEO and GEO optimization for AI search engines.`;
}

// deno-lint-ignore no-explicit-any
export function createRestaurantSEOPrompt(restaurant: any): string {
  return `Generate comprehensive SEO and GEO optimization content for this Des Moines restaurant. Return ONLY a JSON object with these exact fields:

{
  "title": "SEO title (under 60 chars, include restaurant name + cuisine + Des Moines)",
  "description": "Meta description (150-155 chars, compelling with local keywords)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "h1": "H1 tag matching primary search intent",
  "summary": "2-3 sentence GEO summary for AI engines, location-focused",
  "keyFacts": ["up to 4 facts, each supported by the details below"],
  "faq": [
    {"question": "What type of cuisine does [restaurant] serve?", "answer": "Answer with cuisine type"},
    {"question": "Where is [restaurant] located?", "answer": "Answer with address and Des Moines"},
    {"question": "What is the price range at [restaurant]?", "answer": "Answer with price range"}
  ]
}

Restaurant Details:
- Name: ${restaurant.name}
- Description: ${restaurant.description || 'N/A'}
- Cuisine: ${restaurant.cuisine}
- Location: ${restaurant.location}
- Price Range: ${restaurant.price_range || 'N/A'}
- Status: ${restaurant.status || 'N/A'}
- Opening Date: ${restaurant.opening_date || 'N/A'}
- AI Writeup: ${restaurant.ai_writeup ? restaurant.ai_writeup.substring(0, 200) + '...' : 'N/A'}

GROUNDING RULE (WEB-BE-053): every keyFact and every FAQ answer must be
supported by the details listed above. Do not invent attendance figures,
founding years, capacities, prices, awards, rankings, quotes or citations, and
do not attribute anything to a publication or a person. If a detail reads
"N/A", the honest answer is that the listing does not say - write that, or omit
the fact entirely.

FEWER IS CORRECT. keyFacts is a list, not four slots to fill: return two facts
if the data supports two. An invented fourth fact is worse than a short list,
because it is published verbatim and read back by AI assistants.

Focus on Des Moines local SEO and GEO optimization for AI search engines.`;
}
