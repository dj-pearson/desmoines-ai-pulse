import { Link, useLocation } from "react-router-dom";
import { Home, Calendar, Navigation, UtensilsCrossed, Map, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { prefetchRoute } from "@/lib/prefetch";
import { hapticTap } from "@/lib/capacitorUtils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  requiresAuth?: boolean;
}

export default function BottomNav() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  const navItems: NavItem[] = [
    {
      href: "/",
      label: "Home",
      icon: Home,
    },
    {
      href: "/events",
      label: "Events",
      icon: Calendar,
    },
    {
      href: "/events/near-me",
      label: "Near Me",
      icon: Navigation,
    },
    {
      href: "/restaurants",
      label: "Dine",
      icon: UtensilsCrossed,
    },
    {
      href: "/map",
      label: "Map",
      icon: Map,
    },
    {
      href: isAuthenticated ? "/dashboard" : "/auth",
      label: isAuthenticated ? "Account" : "Sign In",
      icon: User,
    },
  ];

  const matchesPath = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return (
      location.pathname === path || location.pathname.startsWith(path + "/")
    );
  };

  // Only the most-specific matching item should appear active, so a deeper
  // route like /events/near-me highlights "Near Me" and not the "/events" tab.
  const activeHref = navItems
    .filter((item) => matchesPath(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const isActivePath = (path: string) => path === activeHref;

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t border-border safe-area-bottom"
      role="navigation"
      aria-label="Bottom navigation"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = isActivePath(item.href);

          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "relative flex flex-1 min-w-0 flex-col items-center justify-center h-full px-1 smooth-transition touch-feedback rounded-xl",
                isActive
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-muted/30 active:scale-95"
              )}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              onMouseEnter={() => prefetchRoute(item.href)}
              onTouchStart={() => prefetchRoute(item.href)}
              onFocus={() => prefetchRoute(item.href)}
              onClick={() => {
                // Native haptic feedback (Capacitor) with web fallback
                hapticTap();
              }}
            >
              {isActive && (
                <div className="absolute -top-[1px] left-1/2 -translate-x-1/2 w-8 h-1.5 bg-primary rounded-b-full shadow-sm" />
              )}
              <Icon
                className={cn(
                  "h-6 w-6 mb-1 smooth-transition",
                  isActive && "scale-110"
                )}
                aria-hidden="true"
              />
              <span
                className={cn(
                  "text-xs font-medium truncate max-w-full",
                  isActive && "font-semibold"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
