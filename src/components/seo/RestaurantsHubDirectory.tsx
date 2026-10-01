import { Link } from "react-router-dom";
import { NEIGHBORHOODS, neighborhoodHref } from "@/lib/neighborhoods";
import { DIRECTORY_PILL } from "@/components/seo/MonthLinks";
import { drinkCuisines } from "@/lib/restaurantsHubCopy";
import { coverageLocationName, type HubAreaPage } from "@/pseo/restaurantAreaPages";

/**
 * Every way into the restaurant listings, on the /restaurants hub (eat-drink
 * plan WP1 item 8). Modelled on EventsHubDirectory: one <nav> landmark with h3
 * groups, so a screen reader's landmark list reads one entry, not four.
 *
 * Every target is a route that exists in App.tsx. The cuisine links are plain
 * `?cuisine=` hrefs rather than buttons, so a crawler follows them and a
 * visitor can open one in a new tab.
 *
 * SEO-038: "Where" lists each area's guide with the cuisine x area pSEO pages
 * for that area, and "Pizza, brunch and breakfast" lists the pages for the
 * cuisines people search by name. Both come from `areaPages`, which the hub
 * reads from pseo_pages and filters to published, indexable pages, so neither
 * group can link to a page the SEO-041 coverage rule has noindexed or pulled.
 * SEO-065: an area's all-restaurants page (/restaurants/ankeny) is one of
 * those pages and leads its row, since hubAreaPages sorts it first.
 */

interface DirectoryLink {
  href: string;
  label: string;
  /** A link back into this hub, which runs onLinkClick (e.g. scroll to the results). */
  inHub?: boolean;
}

const WHEN_AND_WHAT: DirectoryLink[] = [
  { href: "/restaurants/open-now", label: "Open now" },
  { href: "/restaurants/new", label: "New and upcoming" },
  { href: "/restaurants/dietary", label: "Dietary needs" },
];

/** Breweries moved to the Drinks group (pass 2 WP1 item 13), once, not twice. */
const BREWERIES: DirectoryLink = { href: "/breweries", label: "Breweries" };

/**
 * Cuisine slugs for the "search it by name" group. burger and breakfast have
 * no pSEO category today (breakfast is inside brunch's pattern), so they
 * appear the day a page for them is published and indexable, not before.
 */
const NAMED_CUISINES = /^(pizza|burgers?|breakfast|brunch)$/;

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
            <Link to={l.href} className={DIRECTORY_PILL} onClick={l.inHub ? onLinkClick : undefined}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface AreaRow {
  key: string;
  name: string;
  guide: DirectoryLink | null;
  pages: HubAreaPage[];
}

/**
 * One row per area: the neighbourhood guides first, in inventory order, then
 * any coverage area with an indexable page and no guide of its own.
 */
function areaRows(areaPages: readonly HubAreaPage[]): AreaRow[] {
  const byLocation = new Map<string, HubAreaPage[]>();
  for (const p of areaPages) byLocation.set(p.locationSlug, [...(byLocation.get(p.locationSlug) ?? []), p]);
  const rows: AreaRow[] = NEIGHBORHOODS.map((n) => ({
    key: n.slug,
    name: n.name,
    guide: { href: neighborhoodHref(n), label: n.name },
    pages: byLocation.get(n.slug) ?? [],
  }));
  const guided = new Set(NEIGHBORHOODS.map((n) => n.slug));
  for (const [slug, pages] of byLocation) {
    if (guided.has(slug)) continue;
    rows.push({ key: slug, name: coverageLocationName(slug), guide: null, pages });
  }
  return rows;
}

function WhereSection({ areaPages }: { areaPages: readonly HubAreaPage[] }) {
  const rows = areaRows(areaPages);
  return (
    <section>
      <h3 className="text-base font-semibold mb-3">Where</h3>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-wrap items-center gap-2">
            {row.guide ? (
              <Link to={row.guide.href} className={DIRECTORY_PILL}>
                {row.guide.label}
              </Link>
            ) : (
              <span className="text-sm font-semibold text-foreground">{row.name}</span>
            )}
            {row.pages.map((p) => (
              <Link
                key={p.href}
                to={p.href}
                className="inline-flex min-h-11 items-center px-1 text-sm text-primary underline-offset-4 hover:underline"
              >
                {p.label}
              </Link>
            ))}
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
  /** Indexable cuisine x area pSEO pages, from useRestaurantHubAreaPages(). */
  areaPages?: readonly HubAreaPage[];
  /** Runs after a cuisine link is followed, e.g. to scroll to the results. */
  onCuisineClick?: () => void;
  className?: string;
}

export function RestaurantsHubDirectory({
  cuisineCounts,
  areaPages = [],
  onCuisineClick,
  className = "",
}: RestaurantsHubDirectoryProps) {
  const cuisineLink = ({ cuisine, count }: CuisineCount): DirectoryLink => ({
    href: `/restaurants?cuisine=${encodeURIComponent(cuisine)}`,
    label: `${cuisine} (${count})`,
    inHub: true,
  });
  const cuisineLinks = cuisineCounts.map(cuisineLink);
  // Bar-type cuisines the facet reports with at least one row, each a hub
  // link, after the breweries page.
  const drinkLinks = [BREWERIES, ...drinkCuisines(cuisineCounts).map(cuisineLink)];
  const namedCuisineLinks = areaPages
    .filter((p) => NAMED_CUISINES.test(p.categorySlug))
    .map((p) => ({ href: p.href, label: p.label }));

  return (
    <nav aria-labelledby="restaurants-directory-heading" className={className}>
      <h2 id="restaurants-directory-heading" className="text-2xl font-bold text-foreground mb-6">
        Browse Des Moines restaurants
      </h2>
      <div className="space-y-8">
        <Section title="When and what" links={WHEN_AND_WHAT} />
        <WhereSection areaPages={areaPages} />
        <Section title="Pizza, brunch and breakfast" links={namedCuisineLinks} />
        <Section title="Drinks" links={drinkLinks} onLinkClick={onCuisineClick} />
        <Section title="Cuisine" links={cuisineLinks} onLinkClick={onCuisineClick} />
      </div>
    </nav>
  );
}
