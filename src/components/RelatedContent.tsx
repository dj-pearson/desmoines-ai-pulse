import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Gift,
  Baby,
  Heart,
  Clock,
  Leaf,
  Calendar,
  MapPin,
  Utensils,
  Music,
  Users,
} from "lucide-react";

interface RelatedLink {
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: "events" | "restaurants" | "guides";
}

const ALL_RELATED_LINKS: RelatedLink[] = [
  // Events
  {
    href: "/events/free",
    label: "Free Events",
    description: "No-cost activities and entertainment",
    icon: <Gift className="h-5 w-5" />,
    category: "events",
  },
  {
    href: "/events/kids",
    label: "Kids & Family",
    description: "Family-friendly activities for all ages",
    icon: <Baby className="h-5 w-5" />,
    category: "events",
  },
  {
    href: "/events/date-night",
    label: "Date Night",
    description: "Romantic outings and couple activities",
    icon: <Heart className="h-5 w-5" />,
    category: "events",
  },
  {
    href: "/events/today",
    label: "Today's Events",
    description: "What's happening right now",
    icon: <Calendar className="h-5 w-5" />,
    category: "events",
  },
  {
    href: "/events/this-weekend",
    label: "This Weekend",
    description: "Weekend activities and entertainment",
    icon: <Calendar className="h-5 w-5" />,
    category: "events",
  },
  {
    href: "/events",
    label: "All Events",
    description: "Browse all Des Moines events",
    icon: <Calendar className="h-5 w-5" />,
    category: "events",
  },
  // Restaurants
  {
    href: "/restaurants/open-now",
    label: "Open Now",
    description: "Restaurants currently serving",
    icon: <Clock className="h-5 w-5" />,
    category: "restaurants",
  },
  {
    href: "/restaurants/dietary",
    label: "Dietary Options",
    description: "Vegan, gluten-free, and more",
    icon: <Leaf className="h-5 w-5" />,
    category: "restaurants",
  },
  {
    href: "/restaurants",
    label: "All Restaurants",
    description: "Browse all Des Moines dining",
    icon: <Utensils className="h-5 w-5" />,
    category: "restaurants",
  },
  // Guides
  {
    href: "/attractions",
    label: "Attractions",
    description: "Museums, parks, and landmarks",
    icon: <MapPin className="h-5 w-5" />,
    category: "guides",
  },
  {
    href: "/playgrounds",
    label: "Playgrounds",
    description: "Parks and play areas for kids",
    icon: <Users className="h-5 w-5" />,
    category: "guides",
  },
];

interface RelatedContentProps {
  /** Current page path to exclude from related links */
  currentPath: string;
  /** Title for the section */
  title?: string;
  /** Maximum number of links to show */
  maxLinks?: number;
  /** Filter to specific categories */
  categories?: Array<"events" | "restaurants" | "guides">;
  /** Show cross-category suggestions */
  showCrossCategory?: boolean;
}

export default function RelatedContent({
  currentPath,
  title = "Explore More in Des Moines",
  maxLinks = 6,
  categories,
  showCrossCategory = true,
}: RelatedContentProps) {
  // Determine current category based on path
  const currentCategory = currentPath.includes("/restaurants")
    ? "restaurants"
    : currentPath.includes("/events")
      ? "events"
      : "guides";

  // Filter and prioritize links
  let links = ALL_RELATED_LINKS.filter((link) => link.href !== currentPath);

  if (categories) {
    links = links.filter((link) => categories.includes(link.category));
  } else if (showCrossCategory) {
    // Prioritize same category but include others
    const sameCategory = links.filter(
      (link) => link.category === currentCategory
    );
    const otherCategories = links.filter(
      (link) => link.category !== currentCategory
    );

    // Mix: 2/3 same category, 1/3 cross-category
    const sameCategoryCount = Math.ceil((maxLinks * 2) / 3);
    const otherCategoryCount = maxLinks - sameCategoryCount;

    links = [
      ...sameCategory.slice(0, sameCategoryCount),
      ...otherCategories.slice(0, otherCategoryCount),
    ];
  }

  links = links.slice(0, maxLinks);

  if (links.length === 0) return null;

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {links.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="group flex items-start gap-3 p-3 rounded-lg border border-transparent hover:border-primary/20 hover:bg-primary/5 transition-colors"
            >
              <div className="flex-shrink-0 p-2 rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                {link.icon}
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
                  {link.label}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {link.description}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Cross-category suggestion */}
        {showCrossCategory && currentCategory === "events" && (
          <div className="mt-6 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Planning dinner too?</span> Check
              out{" "}
              <Link
                to="/restaurants/open-now"
                className="text-primary hover:underline font-semibold"
              >
                restaurants open now
              </Link>{" "}
              or explore{" "}
              <Link
                to="/restaurants/dietary"
                className="text-primary hover:underline font-semibold"
              >
                dietary-friendly options
              </Link>
              .
            </p>
          </div>
        )}

        {showCrossCategory && currentCategory === "restaurants" && (
          <div className="mt-6 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Looking for entertainment?</span>{" "}
              Browse{" "}
              <Link
                to="/events/today"
                className="text-primary hover:underline font-semibold"
              >
                today's events
              </Link>{" "}
              or find{" "}
              <Link
                to="/events/free"
                className="text-primary hover:underline font-semibold"
              >
                free activities
              </Link>{" "}
              in Des Moines.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
