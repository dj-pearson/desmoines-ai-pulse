import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMediaQuery } from "@/hooks/use-media-query";
import { orderExamplesForHour } from "@/hooks/useNLPSearch";
import {
  MIN_CHARS,
  useEntitySuggestions,
  type EntitySuggestion,
  type EntityType,
} from "@/hooks/useEntitySuggestions";
import { storage } from "@/lib/safeStorage";
import { nowInCentralTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";

/**
 * Recent searches from the hero box. A new key: the per-type
 * `recent-searches-<type>` keys belong to the list pages' SearchAutocomplete,
 * and a Home query is not a restaurants query. Versioned so a shape change can
 * write to _v2 and migrate on read.
 */
export const RECENT_SEARCHES_KEY = "dmi_recent_searches_all_v1";
const MAX_RECENT = 8;
const RECENT_SHOWN = 5;
const EXAMPLES_SHOWN = 6;
const PER_TYPE_SHOWN = 3;

function readRecent(): string[] {
  const value = storage.get<unknown>(RECENT_SEARCHES_KEY, []);
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];
}

function rememberSearch(query: string) {
  const q = query.trim();
  if (q.length < 2) return;
  const rest = readRecent().filter((s) => s.toLowerCase() !== q.toLowerCase());
  storage.set(RECENT_SEARCHES_KEY, [q, ...rest].slice(0, MAX_RECENT));
}

const searchHref = (q: string) => `/search?q=${encodeURIComponent(q)}`;

const GROUP_LABELS: Record<EntityType, string> = {
  events: "Events",
  restaurants: "Restaurants",
  attractions: "Places",
};

interface NLPSearchBarProps {
  placeholder?: string;
  /** Shorter placeholder below the `sm` breakpoint, where the long one is cut off. */
  mobilePlaceholder?: string;
  showExamples?: boolean;
  className?: string;
  /** Classes for the input itself (the hero sizes it up). */
  inputClassName?: string;
}

/**
 * The home page's one search box (home-pass2 WP1 items 5, 7, 8 and 12).
 *
 * Everything in it navigates. Enter, an example chip and "Search everything"
 * go to /search?q=, the page the WebSite SearchAction names; a suggestion goes
 * straight to that event, restaurant or place. Nothing here calls the
 * nlp-search model: the inline results panel that did (once per example chip,
 * and again on /search) is gone, and with it the tabs, the scroll area and the
 * result renderer from the hero chunk.
 *
 * The suggestions region is a disclosure, not a combobox: the input reports
 * `aria-expanded` and `aria-controls`, and the panel holds ordinary links a
 * keyboard reaches with Tab. Escape closes it from anywhere inside and returns
 * focus to the input without reopening it.
 */
export function NLPSearchBar({
  placeholder = "Search events, restaurants, places...",
  mobilePlaceholder = "Search Des Moines",
  showExamples = true,
  className = "",
  inputClassName,
}: NLPSearchBarProps) {
  const [query, setQuery] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  // Set just before Escape hands focus back to the input, so the onFocus that
  // follows does not reopen the panel Escape just closed.
  const suppressReopen = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLFormElement>(null);
  const navigate = useNavigate();
  const panelId = useId();
  const statusId = useId();
  const isNarrow = useMediaQuery("(max-width: 639px)");

  const trimmed = query.trim();
  const { suggestions, term, isFetching } = useEntitySuggestions(query);

  // Central hour, computed once per mount: the examples describe Des Moines
  // time, not the visitor's clock.
  const orderedExamples = useMemo(
    () => orderExamplesForHour(nowInCentralTime().getHours()).slice(0, EXAMPLES_SHOWN),
    [],
  );

  const open = useCallback(() => {
    // Read on open rather than on mount: a search from another tab or an
    // earlier visit shows up without a reload.
    setRecent(readRecent().slice(0, RECENT_SHOWN));
    setPanelOpen(true);
  }, []);

  const close = useCallback(() => setPanelOpen(false), []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!trimmed) {
      // Submit stays enabled; on an empty box it offers the suggestions.
      inputRef.current?.focus();
      open();
      return;
    }
    rememberSearch(trimmed);
    close();
    navigate(searchHref(trimmed));
  };

  const handleClear = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Escape" || !panelOpen) return;
    e.stopPropagation();
    close();
    if (document.activeElement !== inputRef.current) {
      suppressReopen.current = true;
      inputRef.current?.focus();
    }
  };

  const handleFocus = () => {
    if (suppressReopen.current) {
      suppressReopen.current = false;
      return;
    }
    open();
  };

  // Keyboard focus leaving the box closes the panel. A null relatedTarget is a
  // click on nothing focusable, which the outside-mousedown listener below
  // decides, so a click on the panel's own padding does not close it.
  const handleBlur = (e: FocusEvent<HTMLFormElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && !containerRef.current?.contains(next)) close();
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [close]);

  const onNavigate = (q?: string) => {
    if (q) rememberSearch(q);
    close();
  };

  const groups = (["events", "restaurants", "attractions"] as const)
    .map((type) => ({ type, items: suggestions[type].slice(0, PER_TYPE_SHOWN) }))
    .filter((g) => g.items.length > 0);
  const matchCount = groups.reduce((n, g) => n + g.items.length, 0);
  const typing = trimmed.length > 0;
  // Suggestions belong to the debounced term; while the input has moved on,
  // they are not shown as if they answered it.
  const suggestionsCurrent = trimmed.length >= MIN_CHARS && term === trimmed;
  const shownGroups = suggestionsCurrent ? groups : [];
  const idleList = recent.length > 0 ? recent : showExamples ? orderedExamples : [];
  const idleLabel = recent.length > 0 ? "Recent searches" : "Try";
  // Open with nothing to show would be an empty box under the input.
  const expanded = panelOpen && (typing || idleList.length > 0);

  const status = !expanded
    ? ""
    : suggestionsCurrent && !isFetching
      ? matchCount > 0
        ? `${matchCount} suggestion${matchCount === 1 ? "" : "s"} for ${trimmed}.`
        : `No direct matches for ${trimmed}. Search everything instead.`
      : "";

  return (
    <form
      ref={containerRef}
      role="search"
      aria-label="Search Des Moines events, restaurants and places"
      className={cn("relative", className)}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          name="q"
          autoComplete="off"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-describedby={statusId}
          aria-label="Search events, restaurants and things to do"
          placeholder={isNarrow ? mobilePlaceholder : placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!panelOpen) open();
          }}
          onFocus={handleFocus}
          className={cn(
            "h-12 pl-11 text-base [&::-webkit-search-cancel-button]:appearance-none",
            // Room for Search alone, or for Clear and Search (item 12).
            query ? "pr-28" : "pr-14",
            inputClassName,
          )}
        />
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 w-11 p-0"
              onClick={handleClear}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          <Button type="submit" size="sm" className="h-11 w-11 p-0" aria-label="Search">
            <Search className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <p id={statusId} className="sr-only" aria-live="polite">
        {status}
      </p>

      <div
        id={panelId}
        role="region"
        aria-label="Search suggestions"
        hidden={!expanded}
        className="absolute left-0 right-0 top-full z-50 mt-2 rounded-xl border bg-popover p-2 text-left text-popover-foreground shadow-lg"
      >
        {expanded && (
          <>
            {!typing && idleList.length > 0 && (
              <div className="p-2">
                <p className="mb-2 text-sm text-muted-foreground">{idleLabel}</p>
                <ul className="flex flex-wrap gap-2">
                  {idleList.map((q) => (
                    <li key={q}>
                      <Link
                        to={searchHref(q)}
                        onClick={() => onNavigate(q)}
                        data-search-chip
                        className="inline-flex min-h-11 items-center rounded-full bg-secondary/10 px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {q}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {shownGroups.map((group) => (
              <div key={group.type} className="py-1">
                <p className="px-3 pb-1 pt-2 text-sm text-muted-foreground">{GROUP_LABELS[group.type]}</p>
                <ul>
                  {group.items.map((item) => (
                    <SuggestionRow key={`${item.type}-${item.id}`} item={item} onNavigate={() => onNavigate()} />
                  ))}
                </ul>
              </div>
            ))}

            {typing && (
              <Link
                to={searchHref(trimmed)}
                onClick={() => onNavigate(trimmed)}
                data-search-everything
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  shownGroups.length > 0 && "mt-1 border-t pt-1",
                )}
              >
                <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">Search everything for "{trimmed}"</span>
              </Link>
            )}
          </>
        )}
      </div>
    </form>
  );
}

interface SuggestionRowProps {
  item: EntitySuggestion;
  onNavigate: () => void;
}

function SuggestionRow({ item, onNavigate }: SuggestionRowProps) {
  return (
    <li>
      <Link
        to={item.href}
        onClick={onNavigate}
        data-result-type={item.type}
        className="flex min-h-11 flex-col justify-center rounded-lg px-3 py-1.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate text-sm font-medium">{item.title}</span>
        {item.subtitle && <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>}
      </Link>
    </li>
  );
}

export default NLPSearchBar;
