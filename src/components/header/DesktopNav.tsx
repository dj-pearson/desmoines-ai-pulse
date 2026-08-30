import { Link, useLocation } from "react-router-dom";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";
import { prefetchRoute } from "@/lib/prefetch";
import { navigationGroups, type NavGroup } from "./navigationConfig";

export function DesktopNav() {
  const location = useLocation();

  const isActivePath = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  // A group's trigger is active when the current route is its hub or any of its items.
  const isGroupActive = (group: NavGroup) =>
    (group.href ? isActivePath(group.href) : false) ||
    group.items.some((item) => isActivePath(item.href));

  return (
    <NavigationMenu className="hidden lg:flex flex-1 min-w-0" aria-label="Main navigation">
      <NavigationMenuList className="gap-1">
        {Object.values(navigationGroups).map((group) => {
          const GroupIcon = group.icon;
          const groupActive = isGroupActive(group);
          return (
            <NavigationMenuItem key={group.label}>
              <NavigationMenuTrigger
                className={cn("h-9 text-sm", groupActive && "bg-accent/60 text-accent-foreground")}
                aria-current={groupActive ? "true" : undefined}
              >
                <GroupIcon className="h-4 w-4 mr-1.5" aria-hidden="true" />
                {group.label}
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-[420px] gap-2 p-4 md:w-[520px] md:grid-cols-2">
                  {group.items.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <li key={item.href}>
                        <NavigationMenuLink asChild>
                          <Link
                            to={item.href}
                            className={cn(
                              "block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                              item.featured && "bg-primary/5 border-l-2 border-primary",
                              isActivePath(item.href) && "bg-accent/50"
                            )}
                            onMouseEnter={() => prefetchRoute(item.href)}
                            aria-current={isActivePath(item.href) ? "page" : undefined}
                          >
                            <div className="flex items-center gap-2">
                              <ItemIcon className="h-4 w-4" aria-hidden="true" />
                              <div className="text-sm font-medium leading-none">
                                {item.label}
                              </div>
                              {item.priority && (
                                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-primary">
                                  Popular
                                </span>
                              )}
                            </div>
                          </Link>
                        </NavigationMenuLink>
                      </li>
                    );
                  })}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
