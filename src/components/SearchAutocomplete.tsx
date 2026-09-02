import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { storage } from '@/lib/safeStorage';
import { Search, X } from "lucide-react";
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/logger';
import { SpriteIcon } from "@/components/ui/SpriteIcon";

const log = createLogger('SearchAutocomplete');

type ContentType = 'events' | 'restaurants' | 'attractions';

interface SearchAutocompleteProps {
  contentType: ContentType;
  value: string;
  onSelect: (value: string) => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  className?: string;
}

interface Suggestion {
  id: string;
  title: string;
  subtitle?: string;
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
}: SearchAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debouncedValue = useDebouncedValue(value, 300);

  const listboxId = `search-listbox-${contentType}`;
  const optionId = (idx: number) => `${listboxId}-option-${idx}`;

  const recentSearches = getRecentSearches(contentType);

  const { data: suggestions = [] } = useQuery({
    queryKey: ['search-suggestions', contentType, debouncedValue],
    queryFn: async (): Promise<Suggestion[]> => {
      if (debouncedValue.length < 3) return [];

      const searchTerm = `%${debouncedValue}%`;

      if (contentType === 'events') {
        const { data, error } = await supabase
          .from('events')
          .select('id, title, venue')
          .ilike('title', searchTerm)
          .gte('date', new Date().toISOString())
          .neq('is_hidden', true) // Exclude soft-hidden stale events (WEB-AUTO-006)
          // WEB-BE-034: archived_at is the other unpublish switch.
          .is('archived_at', null)
          .limit(5);
        // A search that FAILED and a search with no matches both render as
        // "no suggestions", so a user typing a restaurant that exists is told it
        // is not listed. The empty result is still the right UI; the silence was not.
        if (error) log.error('suggestions', 'Suggestion query failed', { contentType, error });
        return (data || []).map((e) => ({
          id: e.id,
          title: e.title,
          subtitle: e.venue || undefined,
        }));
      }

      if (contentType === 'restaurants') {
        const { data, error } = await supabase
          .from('restaurants')
          .select('id, name, cuisine')
          .ilike('name', searchTerm)
          .limit(5);
        // A search that FAILED and a search with no matches both render as
        // "no suggestions", so a user typing a restaurant that exists is told it
        // is not listed. The empty result is still the right UI; the silence was not.
        if (error) log.error('suggestions', 'Suggestion query failed', { contentType, error });
        return (data || []).map((r) => ({
          id: r.id,
          title: r.name,
          subtitle: r.cuisine || undefined,
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

  const showRecent = filteredRecent.length > 0;
  const showSuggestions = suggestions.length > 0;
  const hasContent = showRecent || showSuggestions;

  // Build flat list of all selectable items for keyboard nav
  const allItems: { type: 'recent' | 'suggestion'; value: string }[] = [];
  if (showRecent) {
    filteredRecent.slice(0, 5).forEach((s) =>
      allItems.push({ type: 'recent', value: s })
    );
  }
  if (showSuggestions) {
    suggestions.forEach((s) =>
      allItems.push({ type: 'suggestion', value: s.title })
    );
  }

  // Show dropdown when input is focused and there's content
  useEffect(() => {
    if (hasContent) {
      setIsOpen(true);
    }
  }, [hasContent]);

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
    (selectedValue: string) => {
      addRecentSearch(contentType, selectedValue);
      onSelect(selectedValue);
      setIsOpen(false);
    },
    [contentType, onSelect]
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
        handleSelect(allItems[activeIndex].value);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    },
    [isOpen, allItems, activeIndex, handleSelect]
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
    const handleFocus = () => {
      if (hasContent) setIsOpen(true);
    };
    input.addEventListener('focus', handleFocus);
    return () => input.removeEventListener('focus', handleFocus);
  }, [inputRef, hasContent]);

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
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <SpriteIcon name="clock" className="h-3 w-3" />
              Recent Searches
            </span>
            <button
              onClick={handleClearRecent}
              className="text-xs text-gray-500 hover:text-gray-600 flex items-center gap-0.5"
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
                  'w-full text-left px-3 py-2 text-sm rounded-lg flex items-center gap-2 transition-colors',
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
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1">
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
                  'w-full text-left px-3 py-2 text-sm rounded-lg flex items-center gap-2 transition-colors',
                  activeIndex === idx
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50'
                )}
                onClick={() => handleSelect(suggestion.title)}
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
