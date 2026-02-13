import React from "react";
import { ChevronRight, Home } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ElementType;
}

interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
  className?: string;
}

const routeMap: Record<string, string> = {
  events: "Events",
  restaurants: "Restaurants", 
  attractions: "Attractions",
  playgrounds: "Playgrounds",
  social: "Social",
  calendar: "Smart Calendar",
  gamification: "Level Up",
  profile: "Profile",
  admin: "Admin",
  auth: "Sign In",
  advertise: "Advertise",
  neighborhoods: "Neighborhoods",
  weekend: "Weekend Guide",
  dashboard: "Dashboard",
  "my-events": "My Events"
};

function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Home", href: "/", icon: Home }
  ];

  let currentPath = "";
  segments.forEach((segment, index) => {
    currentPath += `/${segment}`;
    const label = routeMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
    
    // Don't add href for the last segment (current page)
    breadcrumbs.push({
      label,
      href: index === segments.length - 1 ? undefined : currentPath
    });
  });

  return breadcrumbs;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const location = useLocation();
  const breadcrumbItems = items || generateBreadcrumbs(location.pathname);

  // Don't show breadcrumbs on home page or if only one item
  if (location.pathname === "/" || breadcrumbItems.length <= 1) {
    return null;
  }

  return (
    <nav 
      aria-label="Breadcrumb" 
      className={cn("flex items-center space-x-1 text-sm text-muted-foreground", className)}
    >
      {breadcrumbItems.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <ChevronRight className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          )}
          
          <div className="flex items-center">
            {item.href ? (
              <Link
                to={item.href}
                className="flex items-center gap-1 hover:text-foreground transition-colors"
              >
                {item.icon && <item.icon className="h-4 w-4" />}
                <span>{item.label}</span>
              </Link>
            ) : (
              <span className="flex items-center gap-1 text-foreground font-medium">
                {item.icon && <item.icon className="h-4 w-4" />}
                {item.label}
              </span>
            )}
          </div>
        </React.Fragment>
      ))}
    </nav>
  );
}

export type { BreadcrumbItem };