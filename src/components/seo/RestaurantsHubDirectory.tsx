import { Link } from "react-router-dom";
import { NEIGHBORHOODS } from "@/lib/neighborhoods";
import { DIRECTORY_PILL } from "@/components/seo/MonthLinks";

/**
 * Every way into the restaurant listings, on the /restaurants hub (eat-drink
 * plan WP1 item 8). Modelled on EventsHubDirectory: one <nav> landmark with h3
 * groups, so a screen reader's landmark list reads one entry, not four.
 *
 * Every target is a route that exists in App.tsx. The cuisine links are plain
 * `?cuisine=` hrefs rather than buttons, so a crawler follows them and a
 * visitor can open one in a new tab.
 */

interface DirectoryLink {
  href: string;
  label: string;
}

const WHEN_AND_WHAT: DirectoryLink[] = [
  { href: "/restaurants/open-now", label: "Open now" },
  { href: "/restaurants/new", label: "New and upcoming" },
  { href: "/restaurants/dietary", label: "Dietary needs" },
  { href: "/breweries", label: "Breweries" },
];

const WHERE: DirectoryLink[] = NEIGHBORHOODS.map((n) => ({
  href: `/neighborhoods/${n.slug}`,
  label: n.name,
}));

interface SectionProps {
  title: string;
  links: DirectoryLink[];
  onLinkClick?: () => void;
}

function Section({ title, links, onLinkClick }: SectionProps) {
  if (links.length === 0) return null;
  return (
    <section>
      <h3 className="text-base font-semibold mb-3">{title}</h3>
      <ul className="flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link to={l.href} className={DIRECTORY_PILL} onClick={onLinkClick}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface CuisineCount {
  cuisine: string;
  count: number;
}

interface RestaurantsHubDirectoryProps {
  /** From useCuisineCounts(); the cuisine group is left out while it is empty. */
  cuisineCounts: readonly CuisineCount[];
  /** Runs after a cuisine link is followed, e.g. to scroll to the results. */
  onCuisineClick?: () => void;
  className?: string;
}

export function RestaurantsHubDirectory({
  cuisineCounts,
  onCuisineClick,
  className = "",
}: RestaurantsHubDirectoryProps) {
  const cuisineLinks = cuisineCounts.map(({ cuisine, count }) => ({
    href: `/restaurants?cuisine=${encodeURIComponent(cuisine)}`,
    label: `${cuisine} (${count})`,
  }));

  return (
    <nav aria-labelledby="restaurants-directory-heading" className={className}>
      <h2 id="restaurants-directory-heading" className="text-2xl font-bold text-foreground mb-6">
        Browse Des Moines restaurants
      </h2>
      <div className="space-y-8">
        <Section title="When and what" links={WHEN_AND_WHAT} />
        <Section title="Where" links={WHERE} />
        <Section title="Cuisine" links={cuisineLinks} onLinkClick={onCuisineClick} />
      </div>
    </nav>
  );
}
