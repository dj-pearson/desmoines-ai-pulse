import { Link } from "react-router-dom";
import { BRAND } from "@/lib/brandConfig";
import { ChevronRight } from "lucide-react";

/**
 * Internal Linking Component for Programmatic SEO
 *
 * Provides contextual internal links to improve site structure,
 * distribute link equity, and enhance crawlability.
 */

export interface InternalLink {
  title: string;
  href: string;
  description?: string;
}

interface RelatedLinksProps {
  title?: string;
  links: InternalLink[];
  variant?: "grid" | "list" | "inline";
  showDescription?: boolean;
  className?: string;
}

/**
 * Related Links Section - displays contextual internal links
 */
export function RelatedLinks({
  title = "Related Content",
  links,
  variant = "list",
  showDescription = false,
  className = ""
}: RelatedLinksProps) {
  if (!links || links.length === 0) return null;

  if (variant === "inline") {
    return (
      <nav aria-label={title} className={`text-sm ${className}`}>
        <span className="text-muted-foreground mr-2">{title}:</span>
        {links.map((link, index) => (
          <span key={link.href}>
            <Link
              to={link.href}
              className="text-primary hover:underline"
            >
              {link.title}
            </Link>
            {index < links.length - 1 && <span className="mx-2">•</span>}
          </span>
        ))}
      </nav>
    );
  }

  if (variant === "grid") {
    return (
      <nav aria-label={title} className={className}>
        {title && (
          <h3 className="text-lg font-semibold mb-4">{title}</h3>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {links.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="group p-4 border rounded-lg hover:border-primary hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium group-hover:text-primary">
                  {link.title}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
              </div>
              {showDescription && link.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {link.description}
                </p>
              )}
            </Link>
          ))}
        </div>
      </nav>
    );
  }

  // Default: list variant
  return (
    <nav aria-label={title} className={className}>
      {title && (
        <h3 className="text-lg font-semibold mb-3">{title}</h3>
      )}
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              to={link.href}
              className="flex items-center text-primary hover:underline"
            >
              <ChevronRight className="h-4 w-4 mr-1 flex-shrink-0" />
              <span>{link.title}</span>
            </Link>
            {showDescription && link.description && (
              <p className="text-sm text-muted-foreground ml-5">
                {link.description}
              </p>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Category Hub Links - links to main category pages
 */
export function CategoryHubLinks({ className = "" }: { className?: string }) {
  const categoryLinks: InternalLink[] = [
    { title: `${BRAND.city} Events`, href: "/events", description: "Discover upcoming events" },
    { title: `${BRAND.city} Restaurants`, href: "/restaurants", description: "Find great dining options" },
    { title: `${BRAND.city} Attractions`, href: "/attractions", description: "Explore local attractions" },
    { title: "Playgrounds", href: "/playgrounds", description: "Family-friendly playgrounds" },
    { title: "Trip Planner", href: "/trip-planner", description: "Plan your perfect day" },
  ];

  return (
    <RelatedLinks
      title="Explore More"
      links={categoryLinks}
      variant="grid"
      showDescription={true}
      className={className}
    />
  );
}

/**
 * Event Category Links - links to event category pages
 */
export function EventCategoryLinks({ currentCategory, className = "" }: { currentCategory?: string; className?: string }) {
  const eventLinks: InternalLink[] = [
    { title: "Events Today", href: "/events/today" },
    { title: "Weekend Events", href: "/events/this-weekend" },
    { title: "Free Events", href: "/events/free" },
    { title: "Family & Kids", href: "/events/kids" },
    { title: "Date Night", href: "/events/date-night" },
  ].filter(link => !currentCategory || !link.href.includes(currentCategory));

  return (
    <RelatedLinks
      title="Browse Events By"
      links={eventLinks}
      variant="inline"
      className={className}
    />
  );
}

/**
 * Location Links - links to location-specific pages
 */
export function LocationLinks({ currentLocation, className = "" }: { currentLocation?: string; className?: string }) {
  const locationLinks: InternalLink[] = [
    { title: "West Des Moines", href: "/events/west-des-moines" },
    { title: "Ankeny", href: "/events/ankeny" },
    { title: "Urbandale", href: "/events/urbandale" },
    { title: "Johnston", href: "/events/johnston" },
    { title: "Clive", href: "/events/clive" },
    { title: "Altoona", href: "/events/altoona" },
    { title: "Windsor Heights", href: "/events/windsor-heights" },
  ].filter(link => !currentLocation || !link.href.includes(currentLocation.toLowerCase().replace(' ', '-')));

  return (
    <RelatedLinks
      title={`Events in ${BRAND.region}`}
      links={locationLinks}
      variant="list"
      className={className}
    />
  );
}

/**
 * Restaurant Filter Links - links to restaurant filter pages
 */
export function RestaurantFilterLinks({ className = "" }: { className?: string }) {
  const restaurantLinks: InternalLink[] = [
    { title: "Open Now", href: "/restaurants/open-now" },
    { title: "Dietary Options", href: "/restaurants/dietary" },
  ];

  return (
    <RelatedLinks
      title="Filter Restaurants"
      links={restaurantLinks}
      variant="inline"
      className={className}
    />
  );
}

/**
 * Footer SEO Links - comprehensive internal links for footer
 */
export function FooterSEOLinks({ className = "" }: { className?: string }) {
  const sections = [
    {
      title: "Events",
      links: [
        { title: "All Events", href: "/events" },
        { title: "Today", href: "/events/today" },
        { title: "This Weekend", href: "/events/this-weekend" },
        { title: "Free Events", href: "/events/free" },
        { title: "Kids Events", href: "/events/kids" },
      ]
    },
    {
      title: "Dining",
      links: [
        { title: "All Restaurants", href: "/restaurants" },
        { title: "Open Now", href: "/restaurants/open-now" },
        { title: "Dietary Options", href: "/restaurants/dietary" },
      ]
    },
    {
      title: "Explore",
      links: [
        { title: "Attractions", href: "/attractions" },
        { title: "Playgrounds", href: "/playgrounds" },
        { title: "Neighborhoods", href: "/neighborhoods" },
        { title: "Guides", href: "/guides" },
      ]
    },
    {
      title: "Tools",
      links: [
        { title: "Trip Planner", href: "/trip-planner" },
        { title: "Search", href: "/search" },
        { title: "Articles", href: "/articles" },
      ]
    }
  ];

  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-8 ${className}`}>
      {sections.map((section) => (
        <nav key={section.title} aria-label={section.title}>
          <h4 className="font-semibold mb-3">{section.title}</h4>
          <ul className="space-y-2">
            {section.links.map((link) => (
              <li key={link.href}>
                <Link
                  to={link.href}
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ))}
    </div>
  );
}

/**
 * Contextual Links - generates relevant internal links based on content type
 */
export function ContextualLinks({
  contentType,
  category,
  location,
  className = ""
}: {
  contentType: "event" | "restaurant" | "attraction" | "playground";
  category?: string;
  location?: string;
  className?: string;
}) {
  const links: InternalLink[] = [];

  // Add category-specific links
  if (contentType === "event") {
    links.push(
      { title: `More ${category || "Events"}`, href: category ? `/events?category=${encodeURIComponent(category)}` : "/events" },
      { title: "Events Today", href: "/events/today" },
      { title: "Weekend Events", href: "/events/this-weekend" }
    );
  }

  if (contentType === "restaurant") {
    links.push(
      { title: "More Restaurants", href: "/restaurants" },
      { title: "Open Now", href: "/restaurants/open-now" },
      { title: "Nearby Events", href: "/events" }
    );
  }

  if (contentType === "attraction") {
    links.push(
      { title: "More Attractions", href: "/attractions" },
      { title: "Nearby Restaurants", href: "/restaurants" },
      { title: "Plan Your Visit", href: "/trip-planner" }
    );
  }

  if (contentType === "playground") {
    links.push(
      { title: "More Playgrounds", href: "/playgrounds" },
      { title: "Kids Events", href: "/events/kids" },
      { title: "Family Attractions", href: "/attractions" }
    );
  }

  // Add location-specific links
  if (location) {
    const locationSlug = location.toLowerCase().replace(/\s+/g, '-');
    if (!locationSlug.includes('des-moines')) {
      links.push({ title: `More in ${location}`, href: `/events/${locationSlug}` });
    }
  }

  return (
    <RelatedLinks
      title="You Might Also Like"
      links={links.slice(0, 5)}
      variant="list"
      className={className}
    />
  );
}
