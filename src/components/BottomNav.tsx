import { Link, useLocation } from "react-router-dom";
import { Home, Calendar, UtensilsCrossed, Star, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { prefetchRoute } from "@/lib/prefetch";

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
      href: "/restaurants",
      label: "Dine",
      icon: UtensilsCrossed,
    },
    {
      href: isAuthenticated ? "/my-events" : "/events/today",
      label: isAuthenticated ? "Saved" : "Today",
      icon: Star,
    },
    {
      href: isAuthenticated ? "/dashboard" : "/auth",
      label: isAuthenticated ? "Me" : "Sign In",
      icon: User,
    },
  ];

  const isActivePath = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return (
      location.pathname === path || location.pathname.startsWith(path + "/")
    );
  };

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
                "flex flex-col items-center justify-center min-w-[60px] h-full px-2 smooth-transition touch-feedback rounded-lg",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground active:scale-95"
              )}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              onMouseEnter={() => prefetchRoute(item.href)}
              onFocus={() => prefetchRoute(item.href)}
              onClick={() => {
                // Haptic feedback if supported
                if ("vibrate" in navigator) {
                  navigator.vibrate(10);
                }
              }}
            >
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
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-b-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
