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
      // Static FAQPage JSON-LD: it names nothing it can't link at build time
      // (events-pass2 WP1 item 16). The venue pages are listed in the
      // directory on this page, so the answer points there instead of naming
      // five venues the build can't check.
      question: "What are the live music venues in Des Moines?",
      answer:
        "The Live Music page covers concerts across the metro. The directory on this page lists the music venues that have their own pages, each with its upcoming shows.",
      links: [
        { label: "Live music", to: "/music" },
        { label: "Music venues", to: "/events#events-directory" },
      ],
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
