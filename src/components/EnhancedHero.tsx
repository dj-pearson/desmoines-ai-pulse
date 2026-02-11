import { useState, useEffect, Suspense, lazy } from "react";
import { Brain, MessageSquare, Mic, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { QuickActions, QuickActionsMobile } from "./QuickActions";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

// Lazy load the 3D component
const HeroCityLite = lazy(() => import("./HeroCityLite"));

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
  const [greeting, setGreeting] = useState("");
  const [subheading, setSubheading] = useState("");

  useEffect(() => {
    const hour = new Date().getHours();

    if (hour < 12) {
      setGreeting("Good Morning, Des Moines!");
      setSubheading(
        "Start your day with the perfect brunch spot or morning activity"
      );
    } else if (hour < 17) {
      setGreeting("Good Afternoon!");
      setSubheading(
        "Discover afternoon events and dining experiences across the city"
      );
    } else if (hour < 21) {
      setGreeting("Good Evening!");
      setSubheading(
        "Find the perfect dinner reservation or tonight's entertainment"
      );
    } else {
      setGreeting("Tonight in Des Moines");
      setSubheading(
        "Late-night dining, live music, and events happening right now"
      );
    }
  }, []);

  const statPlaceholder = "—";

  return (
    <section
      className={cn(
        "relative min-h-screen bg-[#0a0a1a] py-16 overflow-hidden",
        className
      )}
    >
      {/* 3D City Background */}
      <Suspense fallback={<div className="absolute inset-0 bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#2D1B69]" />}>
        <HeroCityLite />
      </Suspense>

      {/* Animated background gradient overlay for extra depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#2D1B69]/10 via-transparent to-[#8B0000]/10 pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top badge */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 bg-[#FFD700]/20 backdrop-blur-sm border border-[#FFD700]/30 rounded-full px-4 py-2 animate-fade-in">
            <Brain className="h-4 w-4 text-[#FFD700]" aria-hidden="true" />
            <span className="text-sm text-[#FFD700] font-semibold">
              First AI-Powered Conversational City Guide
            </span>
          </div>
        </div>

        {/* Main headline - Dynamic based on time */}
        <div className="text-center mb-8 animate-slide-in">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 drop-shadow-lg">
            {greeting}
          </h1>
          <p className="text-xl md:text-2xl text-white/90 mb-6 max-w-3xl mx-auto drop-shadow-md">
            {subheading}
          </p>
        </div>

        {/* Live Stats - Database-driven */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 max-w-4xl mx-auto">
          <Link to="/events/today" className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20 hover:bg-white/15 transition-all duration-300 hover:scale-105">
            <div className="text-3xl font-bold text-[#FFD700] mb-1">
              {isLoadingStats ? statPlaceholder : eventsToday}
            </div>
            <p className="text-sm text-white/80">Events Today</p>
          </Link>
          <Link to="/restaurants/open-now" className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20 hover:bg-white/15 transition-all duration-300 hover:scale-105">
            <div className="text-3xl font-bold text-[#FFD700] mb-1">
              {isLoadingStats ? statPlaceholder : restaurantsCount}
            </div>
            <p className="text-sm text-white/80">Restaurants</p>
          </Link>
          <Link to="/events" className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20 hover:bg-white/15 transition-all duration-300 hover:scale-105">
            <div className="text-3xl font-bold text-[#FFD700] mb-1">
              {isLoadingStats ? statPlaceholder : newThisWeek}
            </div>
            <p className="text-sm text-white/80">New This Week</p>
          </Link>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20 hover:bg-white/15 transition-all duration-300 hover:scale-105">
            <div className="text-3xl font-bold text-[#FFD700] mb-1">
              24/7
            </div>
            <p className="text-sm text-white/80">AI Assistant</p>
          </div>
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
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 border border-white/20 hover:bg-white/15 transition-all" role="listitem">
            <MessageSquare className="h-4 w-4 text-[#FFD700]" aria-hidden="true" />
            <span className="text-sm text-white/90">SMS Concierge</span>
          </div>
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 border border-white/20 hover:bg-white/15 transition-all" role="listitem">
            <Mic className="h-4 w-4 text-[#FFD700]" aria-hidden="true" />
            <span className="text-sm text-white/90">Voice Assistant</span>
          </div>
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 border border-white/20 hover:bg-white/15 transition-all" role="listitem">
            <Sparkles className="h-4 w-4 text-[#FFD700]" aria-hidden="true" />
            <span className="text-sm text-white/90">ChatGPT Plugin</span>
          </div>
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 border border-white/20 hover:bg-white/15 transition-all" role="listitem">
            <Brain className="h-4 w-4 text-[#FFD700]" aria-hidden="true" />
            <span className="text-sm text-white/90">Web Intelligence</span>
          </div>
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
