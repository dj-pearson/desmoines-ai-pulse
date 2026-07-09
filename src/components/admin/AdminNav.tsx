import { Link, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Bot,
  ChevronDown,
  CreditCard,
  FileText,
  Flame,
  HandCoins,
  Hotel,
  Image as ImageIcon,
  Inbox,
  LandPlot,
  Mail,
  Menu as MenuIcon,
  MessageCircle,
  Receipt,
  Settings,
  Share2,
  Shield,
  Sparkles,
  Tag,
  TreeDeciduous,
  TrendingUp,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";
import { useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { useAdminAuth, type UserRole } from "@/hooks/useAdminAuth";

interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  description?: string;
}

interface NavGroup {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /**
   * Lowest role allowed to see this group. moderator < admin < root_admin.
   */
  minRole: "moderator" | "admin" | "root_admin";
  items: NavItem[];
}

const ROLE_RANK: Record<UserRole, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
  root_admin: 3,
};

const NAV_GROUPS: NavGroup[] = [
  {
    key: "content",
    label: "Content",
    icon: FileText,
    minRole: "moderator",
    items: [
      { label: "All content", href: "/admin/content", icon: FileText, description: "Events, restaurants, articles" },
      { label: "Hotels", href: "/admin/hotels", icon: Hotel },
      { label: "Attractions", href: "/admin/attractions", icon: LandPlot },
      { label: "Playgrounds", href: "/admin/playgrounds", icon: TreeDeciduous },
      { label: "Event submissions", href: "/admin/event-submissions", icon: Inbox, description: "User-submitted events queue" },
      { label: "Menus", href: "/admin/menus", icon: UtensilsCrossed },
      { label: "Media", href: "/admin/media", icon: ImageIcon },
    ],
  },
  {
    key: "growth",
    label: "Growth",
    icon: TrendingUp,
    minRole: "admin",
    items: [
      { label: "Campaigns", href: "/admin/campaigns", icon: CreditCard },
      { label: "Deals", href: "/admin/deals", icon: Tag },
      { label: "Email", href: "/admin/email", icon: Mail },
      { label: "Social", href: "/admin/social", icon: Share2 },
      { label: "Partnerships", href: "/admin/partnerships", icon: HandCoins },
    ],
  },
  {
    key: "insights",
    label: "Insights",
    icon: BarChart3,
    minRole: "moderator",
    items: [
      { label: "Analytics", href: "/admin/analytics-dashboard", icon: BarChart3 },
      { label: "Feedback", href: "/admin/feedback", icon: MessageCircle },
      { label: "Trending tuner", href: "/admin/trending", icon: Flame },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    icon: Wrench,
    minRole: "admin",
    items: [
      { label: "AI tools", href: "/admin/ai", icon: Bot },
      { label: "Escalation inbox", href: "/admin/inbox", icon: Inbox, description: "Tier-2/3 agent tasks for a human" },
      { label: "Site tools", href: "/admin/tools", icon: Wrench },
      { label: "Refunds", href: "/admin/refunds", icon: Receipt },
      { label: "Security", href: "/admin/security", icon: Shield },
      { label: "System", href: "/admin/system", icon: Settings },
    ],
  },
];

function canSeeGroup(group: NavGroup, role: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[group.minRole];
}

function isActiveItem(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname.startsWith(href);
}

function isActiveGroup(pathname: string, group: NavGroup): boolean {
  return group.items.some((item) => isActiveItem(pathname, item.href));
}

function GroupPopover({
  group,
  pathname,
}: {
  group: NavGroup;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const Icon = group.icon;
  const active = isActiveGroup(pathname, group);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
            active
              ? "bg-primary/10 text-primary border border-primary/20"
              : "hover:bg-accent hover:text-accent-foreground text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
          <span>{group.label}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <ul className="space-y-0.5">
          {group.items.map((item) => {
            const ItemIcon = item.icon;
            const itemActive = isActiveItem(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  to={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-start gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                    itemActive
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent text-foreground",
                  )}
                >
                  <ItemIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium leading-snug">{item.label}</div>
                    {item.description && (
                      <div
                        className={cn(
                          "text-xs leading-tight mt-0.5",
                          itemActive
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground",
                        )}
                      >
                        {item.description}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function MobileNav({
  groups,
  pathname,
}: {
  groups: NavGroup[];
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const defaultOpenGroups = groups
    .filter((g) => isActiveGroup(pathname, g))
    .map((g) => g.key);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="md:hidden gap-2">
          <MenuIcon className="h-4 w-4" />
          <span className="text-sm">Menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-4">
        <SheetHeader className="mb-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-primary" />
            Admin
          </SheetTitle>
        </SheetHeader>
        <Link
          to="/admin"
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium mb-2",
            pathname === "/admin"
              ? "bg-primary text-primary-foreground"
              : "hover:bg-accent text-foreground",
          )}
        >
          <Sparkles className="h-4 w-4" />
          Overview
        </Link>
        <Accordion
          type="multiple"
          defaultValue={defaultOpenGroups}
          className="w-full"
        >
          {groups.map((group) => {
            const GroupIcon = group.icon;
            return (
              <AccordionItem key={group.key} value={group.key}>
                <AccordionTrigger className="py-2 text-sm font-medium hover:no-underline">
                  <span className="flex items-center gap-2">
                    <GroupIcon className="h-4 w-4" />
                    {group.label}
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-0.5 pl-2">
                    {group.items.map((item) => {
                      const ItemIcon = item.icon;
                      const itemActive = isActiveItem(pathname, item.href);
                      return (
                        <li key={item.href}>
                          <Link
                            to={item.href}
                            onClick={() => setOpen(false)}
                            className={cn(
                              "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                              itemActive
                                ? "bg-primary text-primary-foreground border-l-4 border-primary"
                                : "hover:bg-accent text-foreground border-l-4 border-transparent",
                            )}
                          >
                            <ItemIcon className="h-4 w-4" />
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </SheetContent>
    </Sheet>
  );
}

export default function AdminNav() {
  const location = useLocation();
  const { userRole } = useAdminAuth();

  const visibleGroups = NAV_GROUPS.filter((g) => canSeeGroup(g, userRole));

  return (
    <nav className="bg-card border-b border-border sticky top-0 z-40">
      <div className="flex items-center justify-between px-4 py-2 gap-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-semibold hidden sm:inline">Admin</span>
        </div>

        {/* Mobile: hamburger Sheet */}
        <MobileNav groups={visibleGroups} pathname={location.pathname} />

        {/* Desktop: overview + group popovers */}
        <div className="hidden md:flex flex-1 overflow-x-auto mx-4">
          <div className="flex items-center gap-1 min-w-max">
            <Link
              to="/admin"
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                location.pathname === "/admin"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent hover:text-accent-foreground text-muted-foreground",
              )}
            >
              <Sparkles className="h-4 w-4" />
              Overview
            </Link>
            {visibleGroups.map((group) => (
              <GroupPopover
                key={group.key}
                group={group}
                pathname={location.pathname}
              />
            ))}
          </div>
        </div>

        <Link to="/" className="flex-shrink-0">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to Site</span>
          </Button>
        </Link>
      </div>
    </nav>
  );
}

