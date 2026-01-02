import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { BRAND } from "@/lib/brandConfig";
import { BreadcrumbListSchema, BreadcrumbItem } from "@/components/schema/BreadcrumbListSchema";

interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
  showHome?: boolean;
  className?: string;
}

/**
 * Visible Breadcrumb Navigation Component
 *
 * Displays a visual breadcrumb trail and includes structured data
 * for rich snippets in search results.
 *
 * Benefits:
 * - Improves user navigation and reduces bounce rate
 * - Provides context for current page location
 * - Generates Schema.org BreadcrumbList structured data
 * - Increases CTR in search results by 10-30%
 */
export function Breadcrumbs({
  items,
  showHome = true,
  className = ""
}: BreadcrumbsProps) {
  const location = useLocation();

  // Auto-generate breadcrumbs from pathname if not provided
  const breadcrumbItems: BreadcrumbItem[] = items || generateBreadcrumbs(location.pathname);

  // Add home if not already present and showHome is true
  const finalItems = showHome && breadcrumbItems[0]?.name !== "Home"
    ? [{ name: "Home", url: BRAND.baseUrl }, ...breadcrumbItems]
    : breadcrumbItems;

  // Need at least 2 items to show breadcrumbs
  if (finalItems.length < 2) return null;

  return (
    <>
      {/* Schema.org structured data */}
      <BreadcrumbListSchema items={finalItems} />

      {/* Visible breadcrumb navigation */}
      <nav
        aria-label="Breadcrumb"
        className={`py-3 ${className}`}
      >
        <ol
          className="flex flex-wrap items-center gap-1 text-sm"
          itemScope
          itemType="https://schema.org/BreadcrumbList"
        >
          {finalItems.map((item, index) => {
            const isLast = index === finalItems.length - 1;
            const isHome = item.name === "Home";

            return (
              <li
                key={item.url}
                className="flex items-center"
                itemProp="itemListElement"
                itemScope
                itemType="https://schema.org/ListItem"
              >
                {index > 0 && (
                  <ChevronRight
                    className="h-4 w-4 mx-1 text-muted-foreground flex-shrink-0"
                    aria-hidden="true"
                  />
                )}

                {isLast ? (
                  <span
                    className="text-foreground font-medium truncate max-w-[200px] sm:max-w-none"
                    itemProp="name"
                    aria-current="page"
                  >
                    {isHome ? <Home className="h-4 w-4" aria-label="Home" /> : item.name}
                  </span>
                ) : (
                  <Link
                    to={item.url.replace(BRAND.baseUrl, '') || '/'}
                    className="text-muted-foreground hover:text-primary transition-colors truncate max-w-[150px] sm:max-w-none"
                    itemProp="item"
                  >
                    <span itemProp="name">
                      {isHome ? <Home className="h-4 w-4" aria-label="Home" /> : item.name}
                    </span>
                  </Link>
                )}
                <meta itemProp="position" content={String(index + 1)} />
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}

/**
 * Generate breadcrumbs from a pathname
 */
function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const pathParts = pathname.split('/').filter(part => part.length > 0);
  const breadcrumbs: BreadcrumbItem[] = [];

  // Mapping for readable names
  const nameMapping: Record<string, string> = {
    'events': 'Events',
    'restaurants': 'Restaurants',
    'attractions': 'Attractions',
    'playgrounds': 'Playgrounds',
    'articles': 'Articles',
    'guides': 'Guides',
    'neighborhoods': 'Neighborhoods',
    'trip-planner': 'Trip Planner',
    'today': 'Today',
    'this-weekend': 'This Weekend',
    'free': 'Free Events',
    'kids': 'Kids Events',
    'date-night': 'Date Night',
    'open-now': 'Open Now',
    'dietary': 'Dietary Options',
    'west-des-moines': 'West Des Moines',
    'ankeny': 'Ankeny',
    'urbandale': 'Urbandale',
    'johnston': 'Johnston',
    'clive': 'Clive',
    'altoona': 'Altoona',
    'windsor-heights': 'Windsor Heights',
    'search': 'Search',
    'profile': 'Profile',
    'dashboard': 'Dashboard',
    'privacy-policy': 'Privacy Policy',
    'terms': 'Terms of Service',
    'contact': 'Contact',
    'advertise': 'Advertise',
    'pricing': 'Pricing',
    'business': 'Business Hub',
  };

  let currentPath = '';
  pathParts.forEach((part) => {
    currentPath += `/${part}`;

    // Skip dynamic route segments (UUIDs, slugs with dates)
    if (part.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return;
    }

    // Get readable name
    const name = nameMapping[part] ||
      part
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    breadcrumbs.push({
      name,
      url: `${BRAND.baseUrl}${currentPath}`
    });
  });

  return breadcrumbs;
}

/**
 * Breadcrumbs with custom title for detail pages
 */
export function DetailBreadcrumbs({
  parentPath,
  parentName,
  currentTitle,
  className = ""
}: {
  parentPath: string;
  parentName: string;
  currentTitle: string;
  className?: string;
}) {
  const items: BreadcrumbItem[] = [
    { name: "Home", url: BRAND.baseUrl },
    { name: parentName, url: `${BRAND.baseUrl}${parentPath}` },
    { name: currentTitle, url: `${BRAND.baseUrl}${parentPath}/${encodeURIComponent(currentTitle.toLowerCase().replace(/\s+/g, '-'))}` }
  ];

  return <Breadcrumbs items={items} showHome={false} className={className} />;
}

/**
 * Event Breadcrumbs
 */
export function EventBreadcrumbs({
  eventTitle,
  category,
  className = ""
}: {
  eventTitle: string;
  category?: string;
  className?: string;
}) {
  const items: BreadcrumbItem[] = [
    { name: "Home", url: BRAND.baseUrl },
    { name: "Events", url: `${BRAND.baseUrl}/events` },
  ];

  if (category) {
    items.push({
      name: category,
      url: `${BRAND.baseUrl}/events?category=${encodeURIComponent(category)}`
    });
  }

  items.push({
    name: eventTitle.length > 50 ? eventTitle.substring(0, 47) + '...' : eventTitle,
    url: `${BRAND.baseUrl}/events/${encodeURIComponent(eventTitle.toLowerCase().replace(/\s+/g, '-'))}`
  });

  return <Breadcrumbs items={items} showHome={false} className={className} />;
}

/**
 * Restaurant Breadcrumbs
 */
export function RestaurantBreadcrumbs({
  restaurantName,
  cuisine,
  className = ""
}: {
  restaurantName: string;
  cuisine?: string;
  className?: string;
}) {
  const items: BreadcrumbItem[] = [
    { name: "Home", url: BRAND.baseUrl },
    { name: "Restaurants", url: `${BRAND.baseUrl}/restaurants` },
  ];

  if (cuisine) {
    items.push({
      name: cuisine,
      url: `${BRAND.baseUrl}/restaurants?cuisine=${encodeURIComponent(cuisine)}`
    });
  }

  items.push({
    name: restaurantName.length > 50 ? restaurantName.substring(0, 47) + '...' : restaurantName,
    url: `${BRAND.baseUrl}/restaurants/${encodeURIComponent(restaurantName.toLowerCase().replace(/\s+/g, '-'))}`
  });

  return <Breadcrumbs items={items} showHome={false} className={className} />;
}

/**
 * Attraction Breadcrumbs
 */
export function AttractionBreadcrumbs({
  attractionName,
  category,
  className = ""
}: {
  attractionName: string;
  category?: string;
  className?: string;
}) {
  const items: BreadcrumbItem[] = [
    { name: "Home", url: BRAND.baseUrl },
    { name: "Attractions", url: `${BRAND.baseUrl}/attractions` },
  ];

  if (category) {
    items.push({
      name: category,
      url: `${BRAND.baseUrl}/attractions?category=${encodeURIComponent(category)}`
    });
  }

  items.push({
    name: attractionName.length > 50 ? attractionName.substring(0, 47) + '...' : attractionName,
    url: `${BRAND.baseUrl}/attractions/${encodeURIComponent(attractionName.toLowerCase().replace(/\s+/g, '-'))}`
  });

  return <Breadcrumbs items={items} showHome={false} className={className} />;
}
