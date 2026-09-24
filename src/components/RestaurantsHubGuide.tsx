import { Link } from "react-router-dom";
import { FAQSection } from "@/components/FAQSection";
import {
  buildRestaurantsHubFaqs,
  formatRestaurantCount,
  type RestaurantsHubCounts as CountProps,
} from "@/lib/restaurantsHubCopy";

/**
 * The guide, "by the numbers" and FAQ copy for the /restaurants hub, moved out
 * of the page (eat-drink plan WP1 item 5).
 *
 * EVERY NUMBER IS A PROP. The page used to state three different restaurant
 * counts for one collection, and the FAQ copy ships as FAQPage JSON-LD. Now the
 * count comes from the hub's unfiltered query and the cuisine count from the
 * facet, and when either is unknown the sentence drops the number instead of
 * guessing.
 *
 * Claims the data does not back are gone: live open/closed status on the hub,
 * expert verification, review claims, openings timing and sourcing we cannot
 * show, and a restaurant with no page in public/sitemap-restaurants.xml. The
 * acceptance grep in docs/page-plans/eat-drink.md (WP1) holds this file to it.
 */

function countPhrase({ restaurantCount, cuisineCount }: CountProps): string {
  const restaurants = formatRestaurantCount(restaurantCount);
  const parts: string[] = [];
  if (restaurants) parts.push(`${restaurants} restaurants`);
  if (cuisineCount > 0) parts.push(`${cuisineCount} cuisines`);
  return parts.join(" across ");
}

export function RestaurantsHubGuide({ restaurantCount, cuisineCount }: CountProps) {
  const counted = countPhrase({ restaurantCount, cuisineCount });
  const restaurants = formatRestaurantCount(restaurantCount);

  return (
    <section className="max-w-3xl mx-auto mt-16" aria-labelledby="guide-heading">
      <h2 id="guide-heading" className="text-3xl font-bold mb-6 text-foreground">
        Des Moines restaurant guide
      </h2>

      <div className="space-y-4 text-base leading-relaxed text-muted-foreground">
        <p>
          {counted
            ? `We list ${counted} in the Des Moines metro, `
            : "We list restaurants across the Des Moines metro, "}
          from downtown and the East Village to West Des Moines, Ankeny and Altoona. Each listing
          links to its own page with hours, a menu where we have one, and how to book.
        </p>

        <h3 className="text-xl font-semibold text-foreground pt-4">Dining tips</h3>
        <p>
          Friday and Saturday between 6 and 8 PM is the busy stretch, so book ahead for the
          better-known places and for groups of six or more; most casual spots take walk-ins.
          Sunday brunch fills up from about 9 to 11 AM in the East Village and along Ingersoll.
          Happy hours are common downtown, but times and offers vary by venue, so check with the
          restaurant. For vegetarian, vegan or gluten-free options, start with the{" "}
          <Link to="/restaurants/dietary" className="text-primary underline-offset-4 hover:underline">
            dietary guide
          </Link>{" "}
          and call ahead about shared prep surfaces.
        </p>

        <h3 className="text-xl font-semibold text-foreground pt-4">By the numbers</h3>
        <ul className="list-disc pl-5 space-y-1">
          {restaurants && <li>{restaurants} restaurants listed in the metro</li>}
          {cuisineCount > 0 && <li>{cuisineCount} cuisines, each with its own filter</li>}
          <li>
            New and announced openings on{" "}
            <Link to="/restaurants/new" className="text-primary underline-offset-4 hover:underline">
              one dated list
            </Link>
          </li>
          <li>
            What's serving right now, by listed hours, on{" "}
            <Link to="/restaurants/open-now" className="text-primary underline-offset-4 hover:underline">
              the open-now page
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}

export function RestaurantsHubFaq(props: CountProps) {
  return (
    <section className="py-16 bg-white dark:bg-background" aria-label="Frequently asked questions">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <FAQSection
          title="Des Moines Restaurants - Frequently Asked Questions"
          description="Common questions about dining, restaurants, and the food scene in Des Moines, Iowa."
          faqs={buildRestaurantsHubFaqs(props)}
          showSchema={true}
          className="border-0 shadow-lg rounded-2xl"
        />
      </div>
    </section>
  );
}
