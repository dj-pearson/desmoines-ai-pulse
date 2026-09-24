import type { FAQItem } from "@/components/FAQSection";
import { EVENTS_UPDATE_ANSWER } from "@/content/eventsCopy";
import { SUBURBS } from "@/lib/suburbs";

/**
 * The /events hub FAQ (docs/page-plans/events.md WP1 item 12). Every sentence
 * describes something a reader can check on the site, and each answer links
 * the page it names. FAQPage schema hands these to search as the site's own
 * factual claims (SEO-009), so nothing here asserts a count or a season.
 */
export function buildHubFaqs(): FAQItem[] {
  const suburbLinks = Object.entries(SUBURBS).map(([slug, s]) => ({
    label: s.name,
    to: `/events/${slug}`,
  }));
  return [
    {
      question: "What events are happening in Des Moines this weekend?",
      answer:
        "The This Weekend page lists everything on the calendar from Friday through Sunday, Central Time, with start times, venues and prices. The Events Today page does the same for today.",
      links: [
        { label: "This weekend", to: "/events/this-weekend" },
        { label: "Today", to: "/events/today" },
      ],
    },
    {
      question: "Where can I find free events in Des Moines?",
      answer:
        "The Free Events page lists upcoming events whose published price says free. An event with no published price is shown as \"Price not listed\", not as free; its page links to the official listing.",
      links: [{ label: "Free events", to: "/events/free" }],
    },
    {
      question: "What are the live music venues in Des Moines?",
      answer:
        "Each venue we track has a page listing its upcoming shows, including Wells Fargo Arena, the Des Moines Civic Center, Hoyt Sherman Place, Wooly's and the Val Air Ballroom in West Des Moines. The Live Music page covers concerts across the metro.",
    },
    {
      question: "What are the biggest annual events in Des Moines?",
      answer:
        "The Iowa State Fair in August is the largest. The Des Moines Arts Festival and the World Food and Music Festival also return every year. The month pages show what is scheduled for any month once dates are announced.",
    },
    {
      question: "Are there family-friendly events in Des Moines?",
      answer:
        "The Kids and Family page lists upcoming events suited to children, and the playgrounds guide covers parks and play areas across the metro.",
      links: [
        { label: "Kids and family", to: "/events/kids" },
        { label: "Playgrounds", to: "/playgrounds" },
      ],
    },
    {
      question: "How do I find events near me in Des Moines?",
      answer: `The Near Me page sorts upcoming events by distance from your location. There are also pages for events in ${Object.values(SUBURBS)
        .map((s) => s.name)
        .join(", ")
        .replace(/, ([^,]*)$/, " and $1")}.`,
      links: [{ label: "Near me", to: "/events/near-me" }, ...suburbLinks],
    },
    {
      question: "How often is the events calendar updated?",
      answer: EVENTS_UPDATE_ANSWER,
    },
  ];
}
