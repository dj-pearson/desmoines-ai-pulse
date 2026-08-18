import { Suspense, lazy } from "react";
import { Brain, MessageSquare, Mic, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { QuickActions, QuickActionsMobile } from "./QuickActions";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { isMobileApp } from "@/lib/capacitorUtils";

// Build-time constant: true in mobile builds, undefined in web builds.
// Rollup can inline and dead-code-eliminate based on this.
declare const __MOBILE_APP__: boolean | undefined;
const IS_NATIVE = typeof __MOBILE_APP__ !== 'undefined' && __MOBILE_APP__;

// Lazy load the 3D component – skip entirely in mobile app builds
// AND on mobile-width browsers (Three.js + WebGL is too heavy for mobile)
const HeroCityLite = IS_NATIVE
  ? null
  : lazy(() => import("./HeroCityLite"));

interface EnhancedHeroProps {
  eventsToday?: number;
  restaurantsCount?: number;
  newThisWeek?: number;
  isLoadingStats?: boolean;
  onAIPlanClick?: () => void;
  className?: string;
}

export function EnhancedHero({
  eventsToday = 0,
  restaurantsCount = 0,
  newThisWeek = 0,
  isLoadingStats = false,
  onAIPlanClick,
  className,
}: EnhancedHeroProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isNativeApp = isMobileApp();
  // Compute greeting synchronously to avoid CLS from empty-to-filled text
  const hour = new Date().getHours();
  const greeting = hour < 12
    ? "Good Morning, Des Moines!"
    : hour < 17
      ? "Good Afternoon!"
      : hour < 21
        ? "Good Evening!"
        : "Tonight in Des Moines";
  const subheading = hour < 12
    ? "Start your day with the perfect brunch spot or morning activity"
    : hour < 17
      ? "Discover afternoon events and dining experiences across the city"
      : hour < 21
        ? "Find the perfect dinner reservation or tonight's entertainment"
        : "Late-night dining, live music, and events happening right now";

  // Use zero as placeholder so the numeric width stays stable (prevents CLS)
  const statPlaceholder = 0;

  return (
    <section
      className={cn(
        "relative bg-[#0a0a1a] overflow-hidden",
        isNativeApp ? "min-h-[70vh] py-10 pt-14" : "min-h-screen py-16",
        className
      )}
    >
      {/* 3D City Background – skip on mobile web (saves 800KB Three.js) and native apps */}
      {HeroCityLite && !isMobile ? (
        <Suspense fallback={<div className="absolute inset-0 bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#2D1B69]" />}>
          <HeroCityLite />
        </Suspense>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#071e62] via-[#1a1a2e] to-[#2D1B69]">
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }} />
          {/* Glow accent — use smaller blur on mobile to reduce GPU overhead */}
          <div className={cn(
            "absolute top-1/3 left-1/2 -translate-x-1/2 rounded-full bg-[#DC143C]/15",
            isMobile ? "w-[200px] h-[200px] blur-[60px]" : "w-[300px] h-[300px] blur-[100px]"
          )} />
        </div>
      )}

      {/* Animated background gradient overlay for extra depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#2D1B69]/10 via-transparent to-[#8B0000]/10 pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top badge */}
        <div className="flex justify-center mb-6">
          <div className={cn(
            "inline-flex items-center gap-2 bg-[#FFD700]/20 border border-[#FFD700]/30 rounded-full px-4 py-2 animate-fade-in",
            !isMobile && "backdrop-blur-sm"
          )}>
            <Brain className="h-4 w-4 text-[#FFD700]" aria-hidden="true" />
            <span className="text-sm text-[#FFD700] font-semibold">
              First AI-Powered Conversational City Guide
            </span>
          </div>
        </div>

        {/* Main headline - Dynamic based on time */}
        <div className="text-center mb-8 animate-slide-in">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 md:drop-shadow-lg">
            <span className="block text-lg md:text-2xl font-semibold text-[#FFD700] mb-2">Des Moines Insider</span>
            {greeting}
          </h1>
          <p className="text-xl md:text-2xl text-white/90 mb-4 max-w-3xl mx-auto md:drop-shadow-md">
            {subheading}
          </p>

          {/* WEB-LEGAL-002: a trust bar sat here claiming "15,000+ locals trust us",
              "4.8/5 user rating" and "500+ events weekly". Nothing counts users, there
              is no review system to average, and the event figure was not merely
              unverifiable but wrong. Re-add individual figures only when a real query
              backs them - see SocialProof.tsx for the pattern. */}
        </div>

        {/* Live Stats - Database-driven
             CLS fix: min-h on each tile + tabular-nums ensures numbers occupy
             consistent space regardless of loading state. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 max-w-4xl mx-auto">
          {([
            { to: "/events/today", value: isLoadingStats ? statPlaceholder : eventsToday, label: "Events Today" },
            { to: "/restaurants/open-now", value: isLoadingStats ? statPlaceholder : restaurantsCount, label: "Restaurants" },
            { to: "/events", value: isLoadingStats ? statPlaceholder : newThisWeek, label: "New This Week" },
            { to: "/trip-planner", value: "24/7", label: "AI Assistant" },
          ] as const).map((stat) => (
            <Link
              key={stat.to}
              to={stat.to}
              className={cn(
                "bg-white/10 rounded-lg p-4 border border-white/20 hover:bg-white/15 transition-colors duration-200 min-h-[76px]",
                !isMobile && "backdrop-blur-sm hover:scale-105 transition-all duration-200"
              )}
            >
              <div className="text-3xl font-bold text-[#FFD700] mb-1 min-h-[36px] tabular-nums">
                {stat.value}
              </div>
              <p className="text-sm text-white/80">{stat.label}</p>
            </Link>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mb-12">
          {isMobile ? (
            <QuickActionsMobile onAIPlanClick={onAIPlanClick} />
          ) : (
            <QuickActions onAIPlanClick={onAIPlanClick} />
          )}
        </div>

        {/* Multi-channel badges */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-8" role="list" aria-label="Available access channels">
          {([
            { icon: MessageSquare, label: "SMS Concierge" },
            { icon: Mic, label: "Voice Assistant" },
            { icon: Sparkles, label: "ChatGPT Plugin" },
            { icon: Brain, label: "Web Intelligence" },
          ] as const).map((badge) => (
            <div
              key={badge.label}
              className={cn(
                "flex items-center gap-2 bg-white/10 rounded-full px-4 py-2 border border-white/20 hover:bg-white/15 transition-colors",
                !isMobile && "backdrop-blur-sm"
              )}
              role="listitem"
            >
              <badge.icon className="h-4 w-4 text-[#FFD700]" aria-hidden="true" />
              <span className="text-sm text-white/90">{badge.label}</span>
            </div>
          ))}
        </div>

        {/* Scroll indicator */}
        <div className="flex justify-center pt-8">
          <div className="animate-bounce" role="presentation" aria-hidden="true">
            <svg
              className="w-6 h-6 text-white/60"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
