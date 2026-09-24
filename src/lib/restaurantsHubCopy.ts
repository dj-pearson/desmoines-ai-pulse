import type { FAQItem } from "@/components/FAQSection";

/**
 * Copy for the /restaurants hub whose numbers come from data (eat-drink plan
 * WP1 item 5). Kept out of the component so it can be tested without a DOM,
 * and because the FAQ half ships as FAQPage JSON-LD: whatever this returns is
 * a claim a crawler reads.
 */

export interface RestaurantsHubCounts {
  /** Unfiltered restaurant total, or null while unknown. */
  restaurantCount: number | null;
  /** Number of cuisines in the facet, 0 while unknown. */
  cuisineCount: number;
}

/** "477" -> "470+", so the copy stays true as rows come and go. */
export function formatRestaurantCount(total: number | null | undefined): string | null {
  if (!total || total <= 0) return null;
  if (total < 10) return String(total);
  return `${Math.floor(total / 10) * 10}+`;
}

const NEIGHBORHOOD_LINKS = [
  { label: "East Village", to: "/neighborhoods/east-village" },
  { label: "West Des Moines", to: "/neighborhoods/west-des-moines" },
  { label: "Ankeny", to: "/neighborhoods/ankeny" },
];

export function buildRestaurantsHubFaqs({ restaurantCount, cuisineCount }: RestaurantsHubCounts): FAQItem[] {
  const restaurants = formatRestaurantCount(restaurantCount);
  const listed = restaurants ? `We list ${restaurants} restaurants in the metro. ` : "";
  const cuisines = cuisineCount > 0 ? `${cuisineCount} cuisine types` : "Dozens of cuisine types";

  return [
    {
      question: "What are the best restaurants in Des Moines?",
      answer: `${listed}Well-known names include Harbinger for Asian-inspired small plates, Alba for modern American, Centro for Italian and Bubba for Southern cooking. The East Village and Ingersoll Avenue hold many of the independents. Use the filters on this page to narrow by cuisine, price and rating.`,
      links: [
        { label: "Harbinger", to: "/restaurants/harbinger" },
        { label: "Alba", to: "/restaurants/alba" },
        { label: "Centro", to: "/restaurants/centro" },
        { label: "Bubba", to: "/restaurants/bubba" },
      ],
    },
    {
      question: "What restaurants are open right now in Des Moines?",
      answer: "Our open-now page checks each restaurant's listed hours against the current time in Des Moines and shows the ones serving now. Hours can change on holidays, so call ahead if you're cutting it close.",
      links: [{ label: "Restaurants open now", to: "/restaurants/open-now" }],
    },
    {
      question: "What cuisines are available in Des Moines?",
      answer: `${cuisines}, including American, Italian, Mexican, Chinese, Japanese, Thai, Vietnamese, Korean, Indian, Mediterranean, BBQ and seafood. Each cuisine has a filter on this page.`,
    },
    {
      question: "Where can I find new restaurant openings in Des Moines?",
      answer: "Our new restaurants page lists places that recently opened, places with an announced opening date, and places that have been announced without one, newest first.",
      links: [{ label: "New and upcoming restaurants", to: "/restaurants/new" }],
    },
    {
      question: "What are the best cheap eats in Des Moines?",
      answer: "Filter by the '$' price range to find meals under about $15 per person. Taco shops on the east side, food trucks downtown at lunch and weekday lunch specials are good places to start. Many downtown restaurants and bars run happy hours, though times and offers vary by venue, so check with the restaurant directly.",
    },
    {
      question: "Are there vegan and vegetarian restaurants in Des Moines?",
      answer: "Yes. Many restaurants mark vegetarian and vegan dishes, and Asian, Mediterranean and farm-to-table places tend to have the most plant-based options. Our dietary page lists restaurants that mention vegan, vegetarian or gluten-free options; call ahead to confirm.",
      links: [{ label: "Dietary guide", to: "/restaurants/dietary" }],
    },
    {
      question: "What neighborhoods have the best restaurant scenes in Des Moines?",
      answer: "The East Village and downtown have the densest mix of independent restaurants and bars. Ingersoll Avenue is known for brunch and neighborhood favorites, Court Avenue for late nights, and Valley Junction in West Des Moines for smaller independent concepts. The suburbs, Ankeny especially, are where many new openings land.",
      links: NEIGHBORHOOD_LINKS,
    },
    {
      question: "Do Des Moines restaurants require reservations?",
      answer: "It varies. Fine dining places such as Harbinger and Alba usually want a reservation on weekends. Mid-range restaurants take reservations but often seat walk-ins, and casual spots are first come, first served. Call ahead for groups of six or more. Each restaurant's page lists how to book.",
    },
  ];
}

