import { Link } from "react-router-dom";
import { NEIGHBORHOODS, findNeighborhood } from "@/lib/neighborhoods";
import { findSuburb } from "@/lib/suburbs";

/**
 * Lateral links between the two page families that describe the same places
 * (WEB-SEO-036 AC5).
 *
 * /neighborhoods/ankeny and /events/ankeny are both pages about Ankeny and
 * neither linked to the other, because each was built from its own inventory in
 * its own file. A crawler arriving on one had no path to the other except back
 * through the home page, and a reader had none at all.
 *
 * THE LINK IS CONDITIONAL ON THE TARGET EXISTING, which is the whole reason
 * this is a component rather than two hardcoded lists. The inventories overlap
 * on seven slugs: east-village has a guide and no events page, windsor-heights
 * has an events page and no guide. App.tsx mounts the eight /events/<suburb>
 * paths one at a time with no catch-all, so a link to a slug with no route is
 * a 404, not a thin page. (Waukee got its events page in the events plan.)
 *
 * SIBLINGS ARE THE OTHER HALF. A neighborhood guide with one outbound link (the
 * hub) is a leaf; the set of eight guides linking to each other is a cluster.
 * The hub stays in the list because it is the page that holds the whole set.
 */

interface PlaceCrossLinksProps {
  /** The slug of the page rendering this block, excluded from its own links. */
  slug: string;
  /** Which family is asking. Decides which cross-link is worth offering. */
  from: "neighborhood" | "events";
}

export function PlaceCrossLinks({ slug, from }: PlaceCrossLinksProps) {
  const suburb = findSuburb(slug);
  const guide = findNeighborhood(slug);
  const siblings = NEIGHBORHOODS.filter((n) => n.slug !== slug);

  // The one cross-family link, when the other page exists.
  const across =
    from === "neighborhood" && suburb
      ? { to: `/events/${slug}`, label: `Upcoming events in ${suburb.name}` }
      : from === "events" && guide
        ? { to: `/neighborhoods/${slug}`, label: `${guide.name} neighborhood guide` }
        : null;

  return (
    <nav
      aria-label="Related places"
      className="mt-10 border-t border-border pt-6"
    >
      {across && (
        <p className="mb-4">
          <Link
            to={across.to}
            className="text-primary underline underline-offset-4 hover:no-underline font-medium"
          >
            {across.label}
          </Link>
        </p>
      )}

      <h2 className="text-sm font-semibold text-muted-foreground mb-3">
        {from === "neighborhood" ? "Other neighborhoods" : "Neighborhood guides"}
      </h2>
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {siblings.map((n) => (
          <li key={n.slug}>
            <Link
              to={`/neighborhoods/${n.slug}`}
              className="text-sm text-foreground/80 underline underline-offset-4 hover:text-primary hover:no-underline"
            >
              {n.name}
            </Link>
          </li>
        ))}
        <li>
          <Link
            to="/neighborhoods"
            className="text-sm text-foreground/80 underline underline-offset-4 hover:text-primary hover:no-underline"
          >
            All neighborhoods
          </Link>
        </li>
      </ul>
    </nav>
  );
}

export default PlaceCrossLinks;
