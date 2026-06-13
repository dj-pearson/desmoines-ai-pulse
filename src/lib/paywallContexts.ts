/**
 * Contextual paywall copy catalog — web parity with the iOS PaywallView
 * (IOS-SUB-010/011). Each context surfaces tailored copy at the exact moment
 * of feature desire so per-surface conversion can be measured (WEB-FEAT-001).
 *
 * Context `id`s match the web `useSubscription().hasFeature()` keys so a single
 * `feature` string resolves to both the entitlement check AND the paywall copy.
 * iOS-flavoured aliases (saved_searches / custom_alerts) are mapped through
 * `resolvePaywallContext` so the two platforms stay copy-consistent.
 */
import {
  Heart,
  Map as MapIcon,
  Lightbulb,
  Utensils,
  Star,
  Bookmark,
  Bell,
  SlidersHorizontal,
  EyeOff,
  Sparkles,
  Crown,
  CalendarCheck,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";

export type PaywallTier = "insider" | "vip";

export interface PaywallContext {
  /** Stable id used as the analytics context dimension. */
  id: string;
  icon: LucideIcon;
  headline: string;
  subheadline: string;
  benefits: string[];
  recommendedTier: PaywallTier;
}

/**
 * Canonical context catalog. Keys are the canonical feature ids; copy mirrors
 * the iOS PaywallContext cases so a user sees the same promise on either client.
 */
export const PAYWALL_CONTEXTS: Record<string, PaywallContext> = {
  unlimited_favorites: {
    id: "unlimited_favorites",
    icon: Heart,
    headline: "Save everything you love",
    subheadline:
      "You've reached the free limit of 3 saved items. Go Insider for unlimited favorites.",
    benefits: [
      "Unlimited saved events, restaurants & attractions",
      "Sync your saves across all your devices",
      "Never lose track of a place again",
    ],
    recommendedTier: "insider",
  },
  trip_planner: {
    id: "trip_planner",
    icon: MapIcon,
    headline: "Plan the perfect day with AI",
    subheadline:
      "The AI Trip Planner builds a personalized Des Moines itinerary in seconds.",
    benefits: [
      "AI-built itineraries tuned to your tastes",
      "5 trips / month on Insider, unlimited on VIP",
      "Mix events, dining and attractions automatically",
    ],
    recommendedTier: "insider",
  },
  insider_tips: {
    id: "insider_tips",
    icon: Lightbulb,
    headline: "Unlock insider tips",
    subheadline:
      "Local-only tips, the best times to go, and what not to miss — for every event.",
    benefits: [
      "Insider tips on events across the city",
      "Know the best time to arrive & beat the crowd",
      "Local secrets you won't find anywhere else",
    ],
    recommendedTier: "insider",
  },
  dining_tips: {
    id: "dining_tips",
    icon: Utensils,
    headline: "Eat like a local",
    subheadline:
      "Get dining tips, must-order dishes and reservation know-how for every restaurant.",
    benefits: [
      "Must-order dishes & menu tips",
      "When to go and how to get a table",
      "Local favorites the guides skip",
    ],
    recommendedTier: "insider",
  },
  write_reviews: {
    id: "write_reviews",
    icon: Star,
    headline: "Share your take with the city",
    subheadline:
      "Write reviews and ratings on events, restaurants, and attractions as an Insider.",
    benefits: [
      "Rate & review any place in Des Moines",
      "Help locals find the best spots",
      "Your reviews, editable anytime",
    ],
    recommendedTier: "insider",
  },
  save_searches: {
    id: "save_searches",
    icon: Bookmark,
    headline: "Save your searches",
    subheadline:
      "Keep your favorite searches one tap away and let us watch them for you.",
    benefits: [
      "Save any search or filter combination",
      "Jump back in with a single tap",
      "Pairs with custom alerts for new matches",
    ],
    recommendedTier: "insider",
  },
  create_alerts: {
    id: "create_alerts",
    icon: Bell,
    headline: "Never miss what matters",
    subheadline:
      "Get notified the moment new events match what you care about.",
    benefits: [
      "Custom alerts for your interests & areas",
      "Email alerts for new matching events",
      "First to know about can't-miss happenings",
    ],
    recommendedTier: "insider",
  },
  advanced_filters: {
    id: "advanced_filters",
    icon: SlidersHorizontal,
    headline: "Filter like a pro",
    subheadline:
      "Narrow results by distance, price, rating and more to find exactly what you want.",
    benefits: [
      "Distance radius, price & minimum-rating filters",
      "Combine advanced facets in one search",
      "Find the perfect spot, faster",
    ],
    recommendedTier: "insider",
  },
  ad_free: {
    id: "ad_free",
    icon: EyeOff,
    headline: "Enjoy an ad-free experience",
    subheadline:
      "Go Insider to remove ads and support local Des Moines coverage.",
    benefits: [
      "No banner or in-feed ads, anywhere",
      "A faster, cleaner browsing experience",
      "Support independent local journalism",
    ],
    recommendedTier: "insider",
  },
  early_access: {
    id: "early_access",
    icon: Sparkles,
    headline: "Be first through the door",
    subheadline:
      "Get early access to new events before they sell out.",
    benefits: [
      "See and save new events before everyone else",
      "Beat the rush on limited-capacity happenings",
      "Plan ahead with the freshest listings",
    ],
    recommendedTier: "insider",
  },
  daily_digest: {
    id: "daily_digest",
    icon: Sparkles,
    headline: "Your city, personalized daily",
    subheadline:
      "A daily digest of events and dining picked just for you.",
    benefits: [
      "Daily recommendations tuned to your tastes",
      "Never miss what's happening this week",
      "Curated, not cluttered",
    ],
    recommendedTier: "insider",
  },
  // VIP-tier contexts
  vip_events: {
    id: "vip_events",
    icon: Crown,
    headline: "Get into VIP-only experiences",
    subheadline:
      "Unlock exclusive VIP events and experiences across Des Moines.",
    benefits: [
      "Access VIP-only events & experiences",
      "Priority entry to sought-after happenings",
      "Everything in Insider, included",
    ],
    recommendedTier: "vip",
  },
  reservation_assistance: {
    id: "reservation_assistance",
    icon: CalendarCheck,
    headline: "Skip the reservation hassle",
    subheadline:
      "Let us help book hard-to-get restaurant reservations.",
    benefits: [
      "Help securing tough reservations",
      "Local connections at top restaurants",
      "Everything in Insider, included",
    ],
    recommendedTier: "vip",
  },
  sms_alerts: {
    id: "sms_alerts",
    icon: MessageSquareText,
    headline: "Instant text alerts",
    subheadline:
      "Get instant SMS notifications for the events you care about most.",
    benefits: [
      "Real-time text alerts for your interests",
      "Never miss a can't-miss event",
      "Everything in Insider, included",
    ],
    recommendedTier: "vip",
  },
  concierge: {
    id: "concierge",
    icon: Crown,
    headline: "Your personal local concierge",
    subheadline:
      "Personalized recommendations from our local Des Moines experts.",
    benefits: [
      "One-on-one recommendations from locals",
      "Tailored plans for any occasion",
      "Everything in Insider, included",
    ],
    recommendedTier: "vip",
  },
};

/**
 * The fallback context for any feature without dedicated copy. Mirrors the iOS
 * `onboarding` paywall promise.
 */
export const GENERIC_PAYWALL_CONTEXT: PaywallContext = {
  id: "generic",
  icon: Sparkles,
  headline: "Unlock the full Des Moines Insider",
  subheadline:
    "Go Insider to unlock the complete experience. Cancel anytime.",
  benefits: [
    "Unlimited saved favorites",
    "AI Trip Planner itineraries",
    "Advanced filters & insider tips",
    "Ad-free browsing",
  ],
  recommendedTier: "insider",
};

/**
 * Aliases mapping iOS / legacy feature ids onto the canonical context keys so
 * either spelling resolves to the same copy.
 */
const CONTEXT_ALIASES: Record<string, string> = {
  saved_searches: "save_searches",
  custom_alerts: "create_alerts",
  unlimited_trips: "trip_planner",
  priority_support: "concierge",
  local_perks: "vip_events",
  onboarding: "generic",
};

/**
 * Resolve a feature/context id (in either platform's spelling) to its paywall
 * copy, falling back to the generic Insider promise for unmapped ids.
 */
export function resolvePaywallContext(
  idOrFeature?: string | null,
): PaywallContext {
  if (!idOrFeature) return GENERIC_PAYWALL_CONTEXT;
  const canonical = CONTEXT_ALIASES[idOrFeature] ?? idOrFeature;
  return PAYWALL_CONTEXTS[canonical] ?? GENERIC_PAYWALL_CONTEXT;
}
