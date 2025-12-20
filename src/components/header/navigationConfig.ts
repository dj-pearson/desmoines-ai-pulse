import {
  Calendar,
  CalendarDays,
  Utensils,
  Clock,
  Gift,
  Baby,
  Camera,
  Gamepad2,
  FileText,
  Compass,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  featured?: boolean;
  priority?: boolean;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  href?: string;
  items: NavItem[];
}

export const navigationGroups: Record<string, NavGroup> = {
  events: {
    label: "Events",
    icon: Calendar,
    href: "/events",
    items: [
      { href: "/events", label: "All Events", icon: Calendar, featured: true },
      { href: "/events/today", label: "Today's Events", icon: Calendar },
      { href: "/events/this-weekend", label: "This Weekend", icon: CalendarDays },
      { href: "/events/free", label: "Free Events", icon: Gift },
      { href: "/events/kids", label: "Kids & Family", icon: Baby },
      { href: "/events/date-night", label: "Date Night", icon: Camera },
    ],
  },
  dining: {
    label: "Dining",
    icon: Utensils,
    href: "/restaurants",
    items: [
      { href: "/restaurants", label: "All Restaurants", icon: Utensils, featured: true },
      { href: "/restaurants/open-now", label: "Open Now", icon: Clock },
    ],
  },
  explore: {
    label: "Explore",
    icon: Compass,
    items: [
      { href: "/trip-planner", label: "AI Trip Planner", icon: Sparkles, featured: true },
      { href: "/weekend", label: "Weekend Guide", icon: CalendarDays, featured: true },
      { href: "/attractions", label: "Attractions", icon: Camera },
      { href: "/playgrounds", label: "Playgrounds", icon: Gamepad2 },
    ],
  },
  resources: {
    label: "Resources",
    icon: FileText,
    items: [
      { href: "/articles", label: "Articles & Guides", icon: FileText },
    ],
  },
};

export const navigationLinks: NavItem[] = [
  { href: "/events", label: "Events", icon: Calendar },
  { href: "/events/today", label: "Today's Events", icon: Calendar, priority: true },
  { href: "/events/this-weekend", label: "This Weekend", icon: Calendar, priority: true },
  { href: "/events/free", label: "Free Events", icon: Gift },
  { href: "/events/kids", label: "Kids & Family", icon: Baby },
  { href: "/events/date-night", label: "Date Night", icon: Camera },
  { href: "/trip-planner", label: "AI Trip Planner", icon: Sparkles, priority: true },
  { href: "/weekend", label: "Weekend Guide", icon: CalendarDays },
  { href: "/restaurants", label: "Restaurants", icon: Utensils },
  { href: "/restaurants/open-now", label: "Open Now", icon: Clock },
  { href: "/attractions", label: "Attractions", icon: Camera },
  { href: "/playgrounds", label: "Playgrounds", icon: Gamepad2 },
  { href: "/articles", label: "Articles", icon: FileText },
];
