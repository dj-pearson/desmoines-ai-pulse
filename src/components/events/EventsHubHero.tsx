import type { ComponentType, ReactNode, RefObject } from "react";
import { Clock, Loader2, Navigation, Search, Star, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchAutocomplete, addRecentSearch } from "@/components/SearchAutocomplete";
import { cn } from "@/lib/utils";

/**
 * The /events hub's first screen (docs/page-plans/events.md WP1 item 8): a
 * flat surface with the h1, search, and ONE sideways-scrolling chip row -
 * Today, This weekend, Free, Near me. The old hero stacked a
 * gradient, blur blobs, a date-preset row, an action row, a presets row and a
 * filter-pill row, so on a 390px phone no event was visible until the third
 * scroll.
 *
 * Every value here is read from the URL by the page; this only renders it.
 *
 * Filters and List/Map live once, in EventsStickyBar (events-pass2 WP1 item
 * 14); a Filters chip here was the second of two on a phone's first screen.
 * The first chip says "Today" because it sets preset=today, the whole Central
 * day; the strip below owns "tonight".
 */

function SpinningIcon({ className }: { className?: string }) {
  return <Loader2 className={cn(className, "animate-spin")} />;
}

function QuickChip({
  pressed,
  onClick,
  icon: Icon,
  children,
  disabled,
}: {
  pressed?: boolean;
  onClick: () => void;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={Boolean(pressed)}
      className={cn(
        "inline-flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
        pressed
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {children}
    </button>
  );
}

export interface EventsHubHeroProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement>;
  isMobile: boolean;
  /** The active `?preset=` key, "" for none. */
  activePreset: string;
  onTogglePreset: (preset: "today" | "this-weekend") => void;
  isFree: boolean;
  onToggleFree: () => void;
  isNearMe: boolean;
  isLocating: boolean;
  onToggleNearMe: () => void;
}

export function EventsHubHero({
  searchQuery,
  onSearchChange,
  searchInputRef,
  isMobile,
  activePreset,
  onTogglePreset,
  isFree,
  onToggleFree,
  isNearMe,
  isLocating,
  onToggleNearMe,
}: EventsHubHeroProps) {
  return (
    <section className="border-b bg-muted/40">
      <div className="container mx-auto px-4 pb-4 pt-5 md:py-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            Des Moines Events
          </h1>
          <p className="mt-2 hidden text-base text-muted-foreground sm:block md:text-lg">
            Concerts, festivals, food and things to do in Des Moines, Iowa, in Central Time.
          </p>

          <div className="relative mt-3 md:mt-5">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              ref={searchInputRef}
              type="search"
              placeholder={isMobile ? "Search events..." : "Search events, venues, or keywords..."}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchQuery.trim()) addRecentSearch("events", searchQuery);
              }}
              className="h-12 rounded-xl bg-background pl-12 pr-12 text-base"
              aria-label="Search events (Press 'f' to focus)"
              role="searchbox"
              autoComplete="off"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSearchChange("")}
                className="absolute right-1 top-1/2 h-11 w-11 -translate-y-1/2 p-0 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <SearchAutocomplete
              contentType="events"
              value={searchQuery}
              onSelect={onSearchChange}
              inputRef={searchInputRef}
            />
          </div>

          <div
            role="group"
            aria-label="Quick filters"
            className="-mx-4 mt-3 flex snap-x gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide"
          >
            <QuickChip icon={Clock} pressed={activePreset === "today"} onClick={() => onTogglePreset("today")}>
              Today
            </QuickChip>
            <QuickChip
              icon={Star}
              pressed={activePreset === "this-weekend"}
              onClick={() => onTogglePreset("this-weekend")}
            >
              This weekend
            </QuickChip>
            <QuickChip icon={Tag} pressed={isFree} onClick={onToggleFree}>
              Free
            </QuickChip>
            <QuickChip
              icon={isLocating ? SpinningIcon : Navigation}
              pressed={isNearMe}
              disabled={isLocating}
              onClick={onToggleNearMe}
            >
              {isLocating ? "Locating..." : "Near me"}
            </QuickChip>
          </div>
        </div>
      </div>
    </section>
  );
}
