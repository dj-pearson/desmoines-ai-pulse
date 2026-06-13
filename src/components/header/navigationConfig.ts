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
  Heart,
  Users,
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

export const navigationGroups: Record<string, NavGroup> = {
  thingsToDo: {
    label: "Things to Do",
    icon: MapPin,
    href: "/things-to-do",
    items: [
      { href: "/things-to-do", label: "All Things to Do", icon: MapPin, featured: true },
      { href: "/things-to-do/downtown", label: "Downtown", icon: MapPin },
      { href: "/things-to-do/east-village", label: "East Village", icon: MapPin },
      { href: "/things-to-do/west-des-moines", label: "West Des Moines", icon: MapPin },
      { href: "/things-to-do/ankeny", label: "Ankeny", icon: MapPin },
      { href: "/things-to-do/families", label: "For Families", icon: Baby },
      { href: "/things-to-do/date-night", label: "Date Night", icon: Heart },
      { href: "/things-to-do/budget", label: "Budget-Friendly", icon: DollarSign },
      { href: "/things-to-do/tourists", label: "Visitor Guide", icon: Camera },
      { href: "/things-to-do/groups", label: "For Groups", icon: Users },
      { href: "/things-to-do/this-weekend", label: "This Weekend", icon: CalendarDays, featured: true },
      { href: "/things-to-do/today", label: "Today", icon: Clock },
    ],
  },
  events: {
    label: "Events",
    icon: Calendar,
    href: "/events",
    items: [
      { href: "/events", label: "All Events", icon: Calendar, featured: true },
      { href: "/events/near-me", label: "Near Me", icon: Navigation, featured: true },
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
      { href: "/stay", label: "Hotels & Stay", icon: Building2, featured: true },
      { href: "/music", label: "Live Music", icon: Music, featured: true },
      { href: "/sports", label: "Sports", icon: Trophy },
      { href: "/outdoors", label: "Trails & Outdoors", icon: TreePine },
      { href: "/breweries", label: "Brewery Trail", icon: Beer },
      { href: "/attractions", label: "Attractions", icon: Camera },
      { href: "/playgrounds", label: "Playgrounds", icon: Gamepad2 },
    ],
  },
  plan: {
    label: "Plan",
    icon: Navigation,
    items: [
      { href: "/getting-around", label: "Getting Around", icon: Navigation },
      { href: "/visitors-guide", label: "Visitor Guide", icon: BookOpen, featured: true },
      { href: "/group-travel", label: "Group & Meetings", icon: Briefcase },
    ],
  },
  resources: {
    label: "Resources",
    icon: FileText,
    items: [
      { href: "/articles", label: "Articles & Guides", icon: FileText },
      { href: "/best-of", label: "Des Best Voting", icon: Trophy, featured: true },
      { href: "/whats-new", label: "What's New in DSM", icon: Sparkles },
    ],
  },
};

export const navigationLinks: NavItem[] = [
  { href: "/events", label: "Events", icon: Calendar },
  { href: "/events/near-me", label: "Near Me", icon: Navigation, priority: true },
  { href: "/events/today", label: "Today's Events", icon: Calendar, priority: true },
  { href: "/events/this-weekend", label: "This Weekend", icon: Calendar, priority: true },
  { href: "/events/free", label: "Free Events", icon: Gift },
  { href: "/events/kids", label: "Kids & Family", icon: Baby },
  { href: "/events/date-night", label: "Date Night", icon: Camera },
  { href: "/trip-planner", label: "AI Trip Planner", icon: Sparkles, priority: true },
  { href: "/weekend", label: "Weekend Guide", icon: CalendarDays },
  { href: "/restaurants", label: "Restaurants", icon: Utensils },
  { href: "/restaurants/open-now", label: "Open Now", icon: Clock },
  { href: "/stay", label: "Hotels & Stay", icon: Building2 },
  { href: "/music", label: "Live Music", icon: Music },
  { href: "/sports", label: "Sports", icon: Trophy },
  { href: "/outdoors", label: "Trails & Outdoors", icon: TreePine },
  { href: "/breweries", label: "Brewery Trail", icon: Beer },
  { href: "/attractions", label: "Attractions", icon: Camera },
  { href: "/playgrounds", label: "Playgrounds", icon: Gamepad2 },
  { href: "/getting-around", label: "Getting Around", icon: Navigation },
  { href: "/visitors-guide", label: "Visitor Guide", icon: BookOpen },
  { href: "/group-travel", label: "Group & Meetings", icon: Briefcase },
  { href: "/articles", label: "Articles", icon: FileText },
  { href: "/best-of", label: "Des Best", icon: Trophy, priority: true },
  { href: "/whats-new", label: "What's New", icon: Sparkles },
];
