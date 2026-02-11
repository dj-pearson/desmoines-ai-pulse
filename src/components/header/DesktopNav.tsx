import { Link, useLocation } from "react-router-dom";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { Calendar, Utensils, Compass, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { prefetchRoute } from "@/lib/prefetch";
import { navigationGroups } from "./navigationConfig";

export function DesktopNav() {
  const location = useLocation();

  const isActivePath = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  return (
    <NavigationMenu className="hidden lg:flex flex-1 min-w-0" aria-label="Main navigation">
      <NavigationMenuList className="gap-1">
        {/* Events */}
        <NavigationMenuItem>
          <NavigationMenuTrigger className="h-9 text-sm">
            <Calendar className="h-4 w-4 mr-1.5" />
            Events
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2">
              {navigationGroups.events.items.map((item) => (
                <li key={item.href}>
                  <NavigationMenuLink asChild>
                    <Link
                      to={item.href}
                      className={cn(
                        "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                        item.featured && "bg-primary/5 border-l-2 border-primary",
                        isActivePath(item.href) && "bg-accent/50"
                      )}
                      onMouseEnter={() => prefetchRoute(item.href)}
                      aria-current={isActivePath(item.href) ? "page" : undefined}
                    >
                      <div className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" aria-hidden="true" />
                        <div className="text-sm font-medium leading-none">
                          {item.label}
                        </div>
                      </div>
                    </Link>
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        {/* Dining */}
        <NavigationMenuItem>
          <NavigationMenuTrigger className="h-9 text-sm">
            <Utensils className="h-4 w-4 mr-1.5" />
            Dining
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[300px] gap-3 p-4">
              {navigationGroups.dining.items.map((item) => (
                <li key={item.href}>
                  <NavigationMenuLink asChild>
                    <Link
                      to={item.href}
                      className={cn(
                        "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                        item.featured && "bg-primary/5 border-l-2 border-primary",
                        isActivePath(item.href) && "bg-accent/50"
                      )}
                      onMouseEnter={() => prefetchRoute(item.href)}
                      aria-current={isActivePath(item.href) ? "page" : undefined}
                    >
                      <div className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" aria-hidden="true" />
                        <div className="text-sm font-medium leading-none">
                          {item.label}
                        </div>
                      </div>
                    </Link>
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        {/* Explore */}
        <NavigationMenuItem>
          <NavigationMenuTrigger className="h-9 text-sm">
            <Compass className="h-4 w-4 mr-1.5" />
            Explore
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[300px] gap-3 p-4">
              {navigationGroups.explore.items.map((item) => (
                <li key={item.href}>
                  <NavigationMenuLink asChild>
                    <Link
                      to={item.href}
                      className={cn(
                        "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                        item.featured && "bg-primary/5 border-l-2 border-primary",
                        isActivePath(item.href) && "bg-accent/50"
                      )}
                      onMouseEnter={() => prefetchRoute(item.href)}
                      aria-current={isActivePath(item.href) ? "page" : undefined}
                    >
                      <div className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" aria-hidden="true" />
                        <div className="text-sm font-medium leading-none">
                          {item.label}
                        </div>
                      </div>
                    </Link>
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        {/* Resources */}
        <NavigationMenuItem>
          <NavigationMenuLink asChild>
            <Link
              to="/articles"
              className={cn(
                "group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50",
                isActivePath("/articles") && "bg-accent/50"
              )}
              onMouseEnter={() => prefetchRoute("/articles")}
              aria-current={isActivePath("/articles") ? "page" : undefined}
            >
              <FileText className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Articles
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
