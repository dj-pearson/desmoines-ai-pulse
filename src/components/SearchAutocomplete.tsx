import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { storage } from '@/lib/safeStorage';
import { ChefHat, MapPin, Search, X } from "lucide-react";
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/logger';
import { applyEventVisibility } from '@/lib/eventQuery';
import { escapeLikePattern } from '@/lib/postgrestPattern';
import { createEventSlugWithCentralTime, upcomingFloorUtc } from '@/lib/timezone';
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { restaurantFilterOptionsQuery } from '@/hooks/useRestaurants';
import { matchCuisines } from '@/lib/restaurantPresets';

const log = createLogger('SearchAutocomplete');

type ContentType = 'events' | 'restaurants' | 'attractions';

interface SearchAutocompleteProps {
  contentType: ContentType;
  value: string;
  onSelect: (value: string) => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  className?: string;
  /**
   * Restaurants only: apply a cuisine filter picked from the Cuisines group.
   * Without it, picking a cuisine opens /restaurants?cuisine=<name>, which
   * replaces every other filter.
   */
  onSelectCuisine?: (cuisine: string) => void;
}

interface Suggestion {
  id: string;
  title: string;
  subtitle?: string;
  /** When set, choosing the suggestion opens this page instead of searching. */
  href?: string;
}

/** Venues offered in the events dropdown (docs/page-plans/events.md WP2 item 7). */
const MAX_VENUES = 3;
/** Rows scanned to find distinct venues; one venue can hold many events. */
const VENUE_SCAN_ROWS = 30;

/** Distinct, case-insensitive, first spelling wins. */
function distinctVenues(rows: ReadonlyArray<{ venue: string | null }>, limit = MAX_VENUES): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const venue = row.venue?.trim();
    if (!venue) continue;
    const key = venue.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(venue);
    if (out.length >= limit) break;
  }
  return out;
}

const STORAGE_KEY_PREFIX = 'recent-searches-';
const MAX_RECENT = 10;

function getRecentSearches(contentType: ContentType): string[] {
  return storage.get<string[]>(`${STORAGE_KEY_PREFIX}${contentType}`, []) || [];
}

function addRecentSearch(contentType: ContentType, query: string) {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return;
  const recent = getRecentSearches(contentType);
  const filtered = recent.filter((s) => s.toLowerCase() !== trimmed.toLowerCase());
  filtered.unshift(trimmed);
  storage.set(`${STORAGE_KEY_PREFIX}${contentType}`, filtered.slice(0, MAX_RECENT));
}

function clearRecentSearches(contentType: ContentType) {
  storage.remove(`${STORAGE_KEY_PREFIX}${contentType}`);
}

export { addRecentSearch };

export function SearchAutocomplete({
  contentType,
  value,
  onSelect,
  inputRef,
  className,
  onSelectCuisine,
}: SearchAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debouncedValue = useDebouncedValue(value, 300);
  const navigate = useNavigate();

  const listboxId = `search-listbox-${contentType}`;
  const optionId = (idx: number) => `${listboxId}-option-${idx}`;

  const recentSearches = getRecentSearches(contentType);

  const { data: venueSuggestions = [] } = useQuery({
    queryKey: ['search-venue-suggestions', contentType, debouncedValue],
    queryFn: async (): Promise<string[]> => {
      const term = escapeLikePattern(debouncedValue);
      if (term.length < 3) return [];
      // No DISTINCT over PostgREST, so scan a few upcoming rows and dedupe.
      const { data, error } = await applyEventVisibility(
        supabase.from('events').select('venue')
      )
        .ilike('venue', `%${term}%`)
        .gte('date', upcomingFloorUtc())
        .order('date', { ascending: true })
        .limit(VENUE_SCAN_ROWS);
      if (error) log.error('suggestions', 'Venue suggestion query failed', { contentType, error });
      return distinctVenues(data || []);
    },
    enabled: contentType === 'events' && debouncedValue.length >= 3,
    staleTime: 30 * 1000,
  });

  // Shares the hub's cached facet query; disabled off the restaurants page so
  // events and attractions never pay for it.
  const { data: facet } = useQuery({
    ...restaurantFilterOptionsQuery,
    enabled: contentType === 'restaurants',
  });

  const { data: suggestions = [] } = useQuery({
    queryKey: ['search-suggestions', contentType, debouncedValue],
    queryFn: async (): Promise<Suggestion[]> => {
      if (debouncedValue.length < 3) return [];

      // `%` and `_` typed by the user are literal, not wildcards.
      const escaped = escapeLikePattern(debouncedValue);
      if (!escaped) return [];
      const searchTerm = `%${escaped}%`;

      if (contentType === 'events') {
        // Same visibility rule as every list (is_merged / is_hidden /
        // archived_at), and the upcoming floor is the start of today in
        // Central, so a show that began at 7pm is still offered at 9pm.
        const { data, error } = await applyEventVisibility(
          supabase
            .from('events')
            .select('id, title, venue, date, event_start_utc, event_start_local')
        )
          .ilike('title', searchTerm)
          .gte('date', upcomingFloorUtc())
          .order('date', { ascending: true })
          .limit(5);
        // A search that FAILED and a search with no matches both render as
        // "no suggestions", so a user typing a restaurant that exists is told it
        // is not listed. The empty result is still the right UI; the silence was not.
        if (error) log.error('suggestions', 'Suggestion query failed', { contentType, error });
        // An event suggestion is a specific event, so it opens that event
        // rather than running a text search for its title.
        return (data || []).map((e) => ({
          id: e.id,
          title: e.title,
          subtitle: e.venue || undefined,
          href: `/events/${createEventSlugWithCentralTime(e.title, e)}`,
        }));
      }

      if (contentType === 'restaurants') {
        const { data, error } = await supabase
          .from('restaurants')
          .select('id, name, cuisine, slug')
          .ilike('name', searchTerm)
          // Same rule as every restaurant list (WEB-AUTO-005): a row merged
          // into its duplicate is not a place to send anyone.
          .neq('is_merged', true)
          .limit(5);
        // A search that FAILED and a search with no matches both render as
        // "no suggestions", so a user typing a restaurant that exists is told it
        // is not listed. The empty result is still the right UI; the silence was not.
        if (error) log.error('suggestions', 'Suggestion query failed', { contentType, error });
        // A restaurant suggestion is a specific place, so it opens that
        // restaurant rather than running a text search for its name.
        return (data || []).map((r) => ({
          id: r.id,
          title: r.name,
          subtitle: r.cuisine || undefined,
          href: `/restaurants/${r.slug || r.id}`,
        }));
      }

      if (contentType === 'attractions') {
        const { data, error } = await supabase
          .from('attractions')
          .select('id, name, type')
          .ilike('name', searchTerm)
          .limit(5);
        // A search that FAILED and a search with no matches both render as
        // "no suggestions", so a user typing a restaurant that exists is told it
        // is not listed. The empty result is still the right UI; the silence was not.
        if (error) log.error('suggestions', 'Suggestion query failed', { contentType, error });
        return (data || []).map((a) => ({
          id: a.id,
          title: a.name,
          subtitle: a.type || undefined,
        }));
      }

      return [];
    },
    enabled: debouncedValue.length >= 3,
    staleTime: 30 * 1000,
  });

  const filteredRecent = value
    ? recentSearches.filter((s) =>
        s.toLowerCase().includes(value.toLowerCase())
      )
    : recentSearches;

  const venues = contentType === 'events' && debouncedValue.length >= 3 ? venueSuggestions : [];
  const cuisineMatches =
    contentType === 'restaurants' ? matchCuisines(facet?.cuisines ?? [], value) : [];

  const showRecent = filteredRecent.length > 0;
  const showSuggestions = suggestions.length > 0;
  const showVenues = venues.length > 0;
  const showCuisines = cuisineMatches.length > 0;
  const hasContent = showRecent || showSuggestions || showVenues || showCuisines;

  // Build flat list of all selectable items for keyboard nav, in render order.
  const allItems: { type: 'recent' | 'suggestion' | 'venue' | 'cuisine'; value: string; href?: string }[] = [];
  if (showRecent) {
    filteredRecent.slice(0, 5).forEach((s) =>
      allItems.push({ type: 'recent', value: s })
    );
  }
  if (showSuggestions) {
    suggestions.forEach((s) =>
      allItems.push({ type: 'suggestion', value: s.title, href: s.href })
    );
  }
  if (showVenues) {
    venues.forEach((v) => allItems.push({ type: 'venue', value: v }));
  }
  if (showCuisines) {
    cuisineMatches.forEach((c) => allItems.push({ type: 'cuisine', value: c }));
  }

  // Open on focus or typing only. This used to open whenever there was
  // anything to show, so a visitor with saved recent searches got the dropdown
  // over the page on load, before touching the search box.
  const lastValueRef = useRef(value);
  useEffect(() => {
    if (lastValueRef.current === value) return;
    lastValueRef.current = value;
    const input = inputRef?.current;
    if (input && typeof document !== 'undefined' && document.activeElement === input) {
      setIsOpen(true);
    }
  }, [value, inputRef]);

  // Reset active index when items change
  useEffect(() => {
    setActiveIndex(-1);
  }, [value]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef?.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputRef]);

  const handleSelect = useCallback(
    (selectedValue: string, href?: string) => {
      setIsOpen(false);
      if (href) {
        navigate(href);
        return;
      }
      addRecentSearch(contentType, selectedValue);
      // The value change this causes is not typing; keep the list closed.
      lastValueRef.current = selectedValue;
      onSelect(selectedValue);
    },
    [contentType, onSelect, navigate]
  );

  const handleSelectCuisine = useCallback(
    (cuisine: string) => {
      setIsOpen(false);
      if (onSelectCuisine) {
        // The caller clears the search box when it applies the cuisine. That
        // value change is not typing, so it must not reopen the list (the
        // input still has focus after a keyboard pick).
        lastValueRef.current = '';
        onSelectCuisine(cuisine);
        return;
      }
      navigate(`/restaurants?cuisine=${encodeURIComponent(cuisine)}`);
    },
    [onSelectCuisine, navigate]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || allItems.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < allItems.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : allItems.length - 1
        );
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        const item = allItems[activeIndex];
        if (item.type === 'cuisine') handleSelectCuisine(item.value);
        else handleSelect(item.value, item.href);
      } else if (e.key === 'Escape') {
        // Claim this Esc so the page's shortcut (useFilterKeyboardShortcuts)
        // does not also clear the search text: one Esc closes the list.
        e.preventDefault();
        setIsOpen(false);
      }
    },
    [isOpen, allItems, activeIndex, handleSelect, handleSelectCuisine]
  );

  // Attach keyboard handler to input
  useEffect(() => {
    const input = inputRef?.current;
    if (!input) return;
    input.addEventListener('keydown', handleKeyDown);
    return () => input.removeEventListener('keydown', handleKeyDown);
  }, [inputRef, handleKeyDown]);

  // Show on focus
  useEffect(() => {
    const input = inputRef?.current;
    if (!input) return;
    // Rendering is still gated on hasContent, so an empty list shows nothing.
    const handleFocus = () => setIsOpen(true);
    input.addEventListener('focus', handleFocus);
    return () => input.removeEventListener('focus', handleFocus);
  }, [inputRef]);

  // Wire ARIA combobox semantics onto the parent-owned input so screen readers
  // announce the active suggestion as the user arrows through them.
  useEffect(() => {
    const input = inputRef?.current;
    if (!input) return;
    const open = isOpen && hasContent;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', String(open));
    if (open) {
      input.setAttribute('aria-controls', listboxId);
    } else {
      input.removeAttribute('aria-controls');
    }
    if (open && activeIndex >= 0) {
      input.setAttribute('aria-activedescendant', optionId(activeIndex));
    } else {
      input.removeAttribute('aria-activedescendant');
    }
    return () => {
      input.removeAttribute('aria-activedescendant');
      input.removeAttribute('aria-expanded');
      input.removeAttribute('aria-controls');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputRef, isOpen, hasContent, activeIndex]);

  const [, forceUpdate] = useState(0);
  const handleClearRecent = useCallback(() => {
    clearRecentSearches(contentType);
    forceUpdate((n) => n + 1);
  }, [contentType]);

  if (!isOpen || !hasContent) return null;

  let itemIndex = -1;

  return (
    <div
      ref={dropdownRef}
      id={listboxId}
      className={cn(
        'absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50 max-h-80 overflow-y-auto',
        className
      )}
      role="listbox"
      aria-label="Search suggestions"
    >
      {showRecent && (
        <div className="p-2">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <SpriteIcon name="clock" className="h-3 w-3" />
              Recent Searches
            </span>
            <button
              type="button"
              onClick={handleClearRecent}
              className="min-h-[44px] px-2 text-xs text-gray-500 hover:text-gray-600 flex items-center gap-0.5"
              aria-label="Clear recent searches"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          </div>
          {filteredRecent.slice(0, 5).map((search) => {
            itemIndex++;
            const idx = itemIndex;
            return (
              <button
                key={`recent-${search}`}
                id={optionId(idx)}
                role="option"
                aria-selected={activeIndex === idx}
                className={cn(
                  'w-full text-left px-3 py-2 min-h-[44px] text-sm rounded-lg flex items-center gap-2 transition-colors',
                  activeIndex === idx
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50'
                )}
                onClick={() => handleSelect(search)}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <SpriteIcon name="clock" className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                {search}
              </button>
            );
          })}
        </div>
      )}

      {showRecent && showSuggestions && (
        <div className="border-t border-gray-100" />
      )}

      {showSuggestions && (
        <div className="p-2">
          <div className="px-2 py-1">
            <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <SpriteIcon name="trending-up" className="h-3 w-3" />
              Suggestions
            </span>
          </div>
          {suggestions.map((suggestion) => {
            itemIndex++;
            const idx = itemIndex;
            return (
              <button
                key={`suggestion-${suggestion.id}`}
                id={optionId(idx)}
                role="option"
                aria-selected={activeIndex === idx}
                className={cn(
                  'w-full text-left px-3 py-2 min-h-[44px] text-sm rounded-lg flex items-center gap-2 transition-colors',
                  activeIndex === idx
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50'
                )}
                onClick={() => handleSelect(suggestion.title, suggestion.href)}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <Search className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="truncate">{suggestion.title}</div>
                  {suggestion.subtitle && (
                    <div className="text-xs text-gray-500 truncate">
                      {suggestion.subtitle}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showVenues && (showRecent || showSuggestions) && (
        <div className="border-t border-gray-100" />
      )}

      {showVenues && (
        <div className="p-2" role="group" aria-label="Venues">
          <div className="px-2 py-1">
            <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              Venues
            </span>
          </div>
          {venues.map((venue) => {
            itemIndex++;
            const idx = itemIndex;
            return (
              <button
                key={`venue-${venue}`}
                id={optionId(idx)}
                role="option"
                aria-selected={activeIndex === idx}
                className={cn(
                  'w-full text-left px-3 py-2 min-h-[44px] text-sm rounded-lg flex items-center gap-2 transition-colors',
                  activeIndex === idx
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50'
                )}
                onClick={() => handleSelect(venue)}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <MapPin className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">{venue}</span>
              </button>
            );
          })}
        </div>
      )}

      {showCuisines && (showRecent || showSuggestions || showVenues) && (
        <div className="border-t border-gray-100" />
      )}

      {showCuisines && (
        <div className="p-2" role="group" aria-label="Cuisines">
          <div className="px-2 py-1">
            <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <ChefHat className="h-3 w-3" aria-hidden="true" />
              Cuisines
            </span>
          </div>
          {cuisineMatches.map((cuisine) => {
            itemIndex++;
            const idx = itemIndex;
            return (
              <button
                key={`cuisine-${cuisine}`}
                id={optionId(idx)}
                role="option"
                aria-selected={activeIndex === idx}
                className={cn(
                  'w-full text-left px-3 py-2 min-h-[44px] text-sm rounded-lg flex items-center gap-2 transition-colors',
                  activeIndex === idx
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50'
                )}
                onClick={() => handleSelectCuisine(cuisine)}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <ChefHat className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">{cuisine} restaurants</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
