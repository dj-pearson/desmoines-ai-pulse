/**
 * The writeup prompt, as a pure function (WEB-BE-053).
 *
 * WHAT IT USED TO ASK FOR. The prompt instructed the model, in capitals, to
 * "ADD STATISTICS: Include quantifiable data (attendance, years running, venue
 * capacity)" and "INCLUDE QUOTES/CITATIONS: Reference sources like 'According
 * to Des Moines Register...'" - while giving it five fields: title,
 * description, venue, date and category. There is no attendance figure in
 * those fields, no founding year, no venue capacity and no quote. So every one
 * the model produced was invented, and it was invented ATTRIBUTED - to a named
 * newspaper, to "the market director" - and written into ai_writeup, which
 * renders on a public page and is fed into generate-seo-content, which turns
 * it into geo_key_facts and FAQ answers.
 *
 * THE WORKED EXAMPLE WAS THE WORST PART. The prompt ended with a model
 * paragraph containing "Established in 1975", "over 20,000 visitors weekly",
 * "According to Des Moines Tourism", "300+ vendors" and a quote from the
 * market director. An example is the strongest instruction in a prompt: it
 * shows the shape of an acceptable answer, and that one demonstrated five
 * fabrications in six sentences.
 *
 * WHAT REPLACED IT. The same GEO goals, minus the parts that require facts
 * nobody supplied: structure, answer-first ordering, local context that is
 * checkable from the venue and the date. Anything the source does not contain
 * is OMITTED rather than filled, and a shorter writeup is the correct outcome
 * for a sparse event.
 *
 * PURE so a test can read the real output rather than grep the handler for
 * the strings it used to contain.
 */

export interface EventForPrompt {
  id: string;
  title: string;
  original_description?: string | null;
  enhanced_description?: string | null;
  location?: string | null;
  venue?: string | null;
  category?: string | null;
  date: string;
  source_url?: string | null;
}

/** Phrases the model must not produce, because nothing it was given supports them. */
export const FORBIDDEN_WRITEUP_PATTERNS: readonly RegExp[] = [
  /\baccording to\b/i,
  /\bas featured in\b/i,
  /\bdescribed by locals as\b/i,
  /\borganizers note\b/i,
];

function centralDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "date unknown";
  return d.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The source text the model is allowed to draw facts from, per event. */
function sourceBlock(event: EventForPrompt): string {
  const description = (event.original_description || event.enhanced_description || "").trim();
  return `
EVENT ${event.id}
Title: ${event.title}
Venue: ${event.venue || "not stated"}
Location: ${event.location || "not stated"}
Date: ${centralDate(event.date)}
Category: ${event.category || "not stated"}
Source URL: ${event.source_url || "not stated"}
Description from the source: ${description || "NONE - the source gave no description"}
`;
}

export function buildEnhancePrompt(events: EventForPrompt[], now: Date = new Date()): string {
  const today = now.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `You are writing short factual listings for a Des Moines, Iowa events site. The writeups are published on public pages and are read by AI assistants, so they have to be accurate before they are anything else.

CURRENT DATE: ${today}
LOCATION CONTEXT: Des Moines, Iowa and the surrounding metro (West Des Moines, Ankeny, Johnston, Urbandale, Clive, Altoona).

THE ONE RULE THAT OVERRIDES EVERYTHING BELOW

Every factual claim in your writeup must come from the event data given to you.
You have the title, the venue, the location, the date, the category and
whatever description the source published. That is all you have.

You therefore MUST NOT write:
  - attendance figures, crowd sizes, venue capacity or ticket-sales numbers
  - the year an event started, how many years it has run, or its history
  - quotes from anyone - organizers, attendees, critics, officials
  - citations or attributions: no "According to the Des Moines Register",
    no "As featured in", no "Described by locals as", no "Organizers note"
  - awards, rankings, or claims that something is the largest, oldest,
    first or best
  - prices, parking arrangements, accessibility provisions or age policies
    that are not stated in the data

If the data does not contain something, LEAVE IT OUT. Do not hedge it, do not
soften it, do not write "likely" or "typically" around it. A shorter writeup
that is entirely true is the correct answer for a sparse event, and is worth
more than a long one that is partly invented.

WHAT TO WRITE INSTEAD

1. Open with the facts: what the event is, when it is, where it is. Answer
   first - this is what an AI assistant quotes.
2. Say what the source description says, in clearer prose. This is where most
   of your material comes from.
3. Place it: the venue, the neighbourhood or city, and what is nearby that you
   know from the location alone. Naming a neighbourhood is fine; claiming a
   restaurant is a five-minute walk is not.
4. Describe who it suits, when the category and description support it.
5. Close by pointing at the source URL for details you were not given -
   tickets, prices, times - rather than guessing them.

LENGTH: 120-250 words. Shorter is correct when the source is thin.
TONE: plain, specific, local. No marketing language, no superlatives.

EVENTS:
${events.map(sourceBlock).join("\n")}

EXAMPLE OF THE RIGHT SHAPE, from a sparse source

Given only: Title "Winter Market at Capital Square", Venue "Capital Square",
Location "Des Moines, IA", Date Saturday 6 December 2025 9:00 AM, Category
"Markets", Description "Local vendors, handmade goods, food".

A correct writeup:
"The Winter Market runs at Capital Square in downtown Des Moines on Saturday,
December 6, starting at 9:00 AM. The market brings together local vendors
selling handmade goods and food. Capital Square sits on Locust Street in the
downtown core, inside the skywalk system, which makes it a practical stop in
December. Check the event listing for vendor details and hours."

Notice what it does NOT say: how many vendors, how long the market has run, how
many people attend, what anything costs, or what anybody said about it. None of
that was in the data.

FORMAT YOUR RESPONSE AS JSON:
{
  "results": [
    { "eventId": "uuid-here", "aiWriteup": "..." }
  ]
}

Return one entry for each of the ${events.length} events above, keyed by the ID given.`;
}
