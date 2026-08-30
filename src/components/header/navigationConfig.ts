import {
  Calendar,
  CalendarDays,
  Utensils,
  Clock,
  Gift,
  Baby,
  Building2,
  Camera,
  Gamepad2,
  FileText,
  Compass,
  Sparkles,
  Trophy,
  Music,
  TreePine,
  Beer,
  Navigation,
  BookOpen,
  Briefcase,
  MapPin,
  Map,
  DollarSign,
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

/**
 * Header IA consolidated into 4 unambiguous groups (WEB-UX-016):
 * Events | Eat & Drink | Explore | Plan. One canonical URL per concept
 * (e.g. Visitor Guide = /visitors-guide; /things-to-do/tourists 301s to it).
 * Object insertion order is the render order for both desktop and mobile nav.
 */
export const navigationGroups: Record<string, NavGroup> = {
  events: {
    label: "Events",
    icon: Calendar,
    href: "/events",
    items: [
      { href: "/events", label: "All Events", icon: Calendar, featured: true },
      { href: "/events/near-me", label: "Near Me", icon: Navigation, featured: true },
      { href: "/events/today", label: "Today's Events", icon: Calendar, priority: true },
      { href: "/events/this-weekend", label: "This Weekend", icon: CalendarDays, priority: true },
      { href: "/events/free", label: "Free Events", icon: Gift },
      { href: "/events/kids", label: "Kids & Family", icon: Baby },
      { href: "/events/date-night", label: "Date Night", icon: Camera },
    ],
  },
  eatDrink: {
    label: "Eat & Drink",
    icon: Utensils,
    href: "/restaurants",
    items: [
      { href: "/restaurants", label: "All Restaurants", icon: Utensils, featured: true },
      { href: "/restaurants/open-now", label: "Open Now", icon: Clock, priority: true },
      { href: "/breweries", label: "Brewery Trail", icon: Beer },
    ],
  },
  explore: {
    label: "Explore",
    icon: Compass,
    href: "/things-to-do",
    items: [
      { href: "/things-to-do", label: "All Things to Do", icon: MapPin, featured: true },
      { href: "/map", label: "Map", icon: Map, featured: true },
      { href: "/attractions", label: "Attractions", icon: Camera },
      { href: "/playgrounds", label: "Playgrounds", icon: Gamepad2 },
      { href: "/music", label: "Live Music", icon: Music },
      { href: "/sports", label: "Sports", icon: Trophy },
      { href: "/outdoors", label: "Trails & Outdoors", icon: TreePine },
      { href: "/deals", label: "Deals & Coupons", icon: DollarSign },
    ],
  },
  plan: {
    label: "Plan",
    icon: Navigation,
    href: "/trip-planner",
    items: [
      { href: "/trip-planner", label: "AI Trip Planner", icon: Sparkles, featured: true, priority: true },
      { href: "/weekend", label: "Weekend Guide", icon: CalendarDays },
      { href: "/stay", label: "Hotels & Stay", icon: Building2 },
      { href: "/visitors-guide", label: "Visitor Guide", icon: BookOpen },
      { href: "/getting-around", label: "Getting Around", icon: Navigation },
      { href: "/group-travel", label: "Group & Meetings", icon: Briefcase },
      { href: "/articles", label: "Articles & Guides", icon: FileText },
      { href: "/best-of", label: "Des Best Voting", icon: Trophy },
      { href: "/whats-new", label: "What's New", icon: Sparkles },
    ],
  },
};

// Flat list (mobile fallback / search). De-duplicated to one entry per concept.
export const navigationLinks: NavItem[] = [
  { href: "/events", label: "Events", icon: Calendar },
  { href: "/events/near-me", label: "Near Me", icon: Navigation, priority: true },
  { href: "/events/today", label: "Today's Events", icon: Calendar, priority: true },
  { href: "/events/this-weekend", label: "This Weekend", icon: CalendarDays, priority: true },
  { href: "/events/free", label: "Free Events", icon: Gift },
  { href: "/events/kids", label: "Kids & Family", icon: Baby },
  { href: "/events/date-night", label: "Date Night", icon: Camera },
  { href: "/restaurants", label: "Restaurants", icon: Utensils },
  { href: "/restaurants/open-now", label: "Open Now", icon: Clock },
  { href: "/breweries", label: "Brewery Trail", icon: Beer },
  { href: "/things-to-do", label: "Things to Do", icon: MapPin },
  { href: "/map", label: "Map", icon: Map },
  { href: "/attractions", label: "Attractions", icon: Camera },
  { href: "/playgrounds", label: "Playgrounds", icon: Gamepad2 },
  { href: "/music", label: "Live Music", icon: Music },
  { href: "/sports", label: "Sports", icon: Trophy },
  { href: "/outdoors", label: "Trails & Outdoors", icon: TreePine },
  { href: "/deals", label: "Deals & Coupons", icon: DollarSign },
  { href: "/trip-planner", label: "AI Trip Planner", icon: Sparkles, priority: true },
  { href: "/weekend", label: "Weekend Guide", icon: CalendarDays },
  { href: "/stay", label: "Hotels & Stay", icon: Building2 },
  { href: "/visitors-guide", label: "Visitor Guide", icon: BookOpen },
  { href: "/getting-around", label: "Getting Around", icon: Navigation },
  { href: "/group-travel", label: "Group & Meetings", icon: Briefcase },
  { href: "/articles", label: "Articles", icon: FileText },
  { href: "/best-of", label: "Des Best", icon: Trophy, priority: true },
  { href: "/whats-new", label: "What's New", icon: Sparkles },
];
