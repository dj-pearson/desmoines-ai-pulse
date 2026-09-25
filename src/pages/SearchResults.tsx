import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { IntentChips } from "@/components/search/IntentChips";
import { SearchEmptyState } from "@/components/search/SearchEmptyState";
import { SearchResultSection } from "@/components/search/SearchResultSection";
import { WatchSearchButton } from "@/components/search/WatchSearchButton";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useSearchPairings } from "@/hooks/useSearchPairings";
import {
  KEYWORD_TYPE_LIMIT,
  NLP_TYPE_LIMIT,
  SEARCH_TYPES,
  useKeywordResults,
  useSearchResults,
  type NLPSearchBody,
  type SearchRow,
} from "@/hooks/useSearchResults";
import { handleError, ErrorSeverity } from "@/lib/errorHandler";
import type { SearchResultType } from "@/lib/searchResultHref";
import {
  MAX_QUERY_LENGTH,
  SECTION_LABELS,
  isSearchableQuery,
  parseSearchUrl,
  resultTypeTab,
  tabResultType,
  withDrop,
  withQuery,
  withTab,
  writeSearchUrl,
  type FilterKey,
  type SearchTab,
  type SearchUrlState,
} from "@/lib/searchUrlState";
import type { TonightEvent } from "@/lib/tonightPairings";

/** What the results area is showing, and why. Drives the status line and the data source. */
type Phase =
  /** The model is still reading the query; keyword matches are on screen meanwhile. */
  | "searching"
  /** nlp-search answered and its rows are shown. */
  | "understood"
  /** nlp-search failed or answered degraded; keyword matches stand in. */
  | "keyword"
  /** nlp-search answered with nothing; keyword matches found something. */
  | "keyword-after-empty";

interface SectionModel {
  type: SearchResultType;
  rows: SearchRow[];
  cap: number;
}

function sumRows(results: Partial<Record<SearchResultType, SearchRow[]>> | undefined): number {
  return SEARCH_TYPES.reduce((n, t) => n + (results?.[t]?.length ?? 0), 0);
}

/**
 * Section order: the parse's own contentTypes first (they say what the visitor
 * asked about), the rest after; events lead whenever a date filter was applied,
 * because a dated question is about what's on.
 */
function sectionOrder(data: NLPSearchBody | null): SearchResultType[] {
  const asked = (data?.parsedIntent?.contentTypes ?? []).filter((t): t is SearchResultType =>
    (SEARCH_TYPES as readonly string[]).includes(t),
  );
  const order = [...new Set<SearchResultType>([...asked, ...SEARCH_TYPES])];
  if (data?.appliedFilters?.some((f) => f.key === "when")) {
    return ["events", ...order.filter((t) => t !== "events")];
  }
  return order;
}

/**
 * Which rows each section shows.
 *
 * Understood: the function's rows. A type it reports as failed (errors[type])
 * falls back to its keyword rows, and so does a type an older deployment never
 * returns (hotels before WP1). A deployment that reports appliedFilters is
 * trusted completely: an absent key there means the parse excluded the type.
 */
function buildSections(
  phase: Phase,
  data: NLPSearchBody | null,
  keyword: Record<SearchResultType, SearchRow[]>,
): SectionModel[] {
  const trustAbsence = Boolean(data?.appliedFilters);
  return sectionOrder(phase === "understood" ? data : null).map((type) => {
    if (phase === "understood" && data) {
      const rows = data.results?.[type];
      const failed = Boolean(data.errors?.[type]);
      if (rows && !failed) return { type, rows, cap: NLP_TYPE_LIMIT };
      if (!rows && trustAbsence && !failed) return { type, rows: [], cap: NLP_TYPE_LIMIT };
    }
    return { type, rows: keyword[type], cap: KEYWORD_TYPE_LIMIT };
  });
}

function statusText(phase: Phase, q: string, term: string, total: number, capped: boolean, hasRows: boolean): string {
  const keywordFor = term.toLowerCase() === q.toLowerCase() ? "" : ` for "${term}"`;
  switch (phase) {
    case "searching":
      return hasRows ? "Searching... keyword matches so far" : "Searching...";
    case "keyword":
      return `Showing keyword matches${keywordFor}`;
    case "keyword-after-empty":
      return `Nothing matched every part of that search. Showing keyword matches${keywordFor}`;
    case "understood":
      if (total === 0) return `No results for "${q}"`;
      if (capped) return `Top ${total} results for "${q}"`;
      return `${total} ${total === 1 ? "result" : "results"} for "${q}"`;
  }
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-xl border p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

const TAB_LABELS: Record<SearchTab, string> = {
  all: "All",
  events: SECTION_LABELS.events,
  restaurants: SECTION_LABELS.restaurants,
  places: SECTION_LABELS.attractions,
  stay: SECTION_LABELS.hotels,
};

interface TypeTabsProps {
  current: SearchTab;
  counts: Record<SearchResultType, number>;
  onSelect: (tab: SearchTab) => void;
}

function TypeTabs({ current, counts, onSelect }: TypeTabsProps) {
  const tabs: SearchTab[] = ["all", ...SEARCH_TYPES.map(resultTypeTab)];
  return (
    <div role="group" aria-label="Result type" className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map((tab) => {
        const type = tabResultType(tab);
        const count = type ? counts[type] : null;
        // A type with nothing in it is not offered, unless it is the one selected.
        if (type && count === 0 && tab !== current) return null;
        const active = tab === current;
        return (
          <button
            key={tab}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(tab)}
            className={
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
              (active ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-secondary")
            }
          >
            {TAB_LABELS[tab]}
            {count !== null && <span className={active ? "opacity-80" : "text-muted-foreground"}>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Events plus their dinner and hotel lines. Its own component so the pairing queries run only with events on screen. */
function EventsSection(props: Omit<Parameters<typeof SearchResultSection>[0], "pairings" | "type">) {
  const pairings = useSearchPairings(props.rows as unknown as TonightEvent[]);
  return <SearchResultSection {...props} type="events" pairings={pairings} />;
}

interface ResultsViewProps {
  state: SearchUrlState;
  navigate: (next: SearchUrlState) => void;
}

/**
 * Mounted only for a searchable query: the keyword hooks list everything when
 * given no search, which is not a search result.
 */
function ResultsView({ state, navigate }: ResultsViewProps) {
  const { q, tab, drop } = state;
  const nlp = useSearchResults(q, drop);
  const keyword = useKeywordResults(q);
  const { trackSearch } = useAnalytics();

  const nlpError = nlp.isError ? nlp.error : null;
  useEffect(() => {
    // Handled on the page (keyword matches stand in), so no toast.
    if (nlpError) {
      handleError(nlpError, { component: "SearchResults", action: "nlp-search" }, ErrorSeverity.WARNING);
    }
  }, [nlpError]);

  const nlpTotal = sumRows(nlp.data?.results);
  const keywordTotal = sumRows(keyword.results);

  let phase: Phase;
  if (nlp.isPending && !nlp.data) phase = "searching";
  else if (nlp.isError || !nlp.data || nlp.data.degraded) phase = "keyword";
  else if (nlpTotal === 0 && keywordTotal > 0) phase = "keyword-after-empty";
  else phase = "understood";

  const sections = buildSections(phase, nlp.data, keyword.results);
  const counts = Object.fromEntries(sections.map((s) => [s.type, s.rows.length])) as Record<
    SearchResultType,
    number
  >;
  const onlyType = tabResultType(tab);
  const visible = sections.filter((s) => s.rows.length > 0 && (!onlyType || s.type === onlyType));
  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  const capped = sections.some((s) => s.rows.length >= s.cap);

  const waiting = (nlp.isPending || keyword.isLoading) && total === 0;
  const settled = !nlp.isPending && !keyword.isLoading;
  const empty = settled && total === 0;
  const busy = nlp.isPending || keyword.isLoading;

  const status = empty
    ? `No results for "${q}"`
    : statusText(phase, q, keyword.term, total, capped, total > 0);

  const onOpen = useCallback(
    (item: SearchRow, type: SearchResultType) => {
      void trackSearch(q, { type }, total, item.id);
    },
    [trackSearch, q, total],
  );

  const retry = () => {
    nlp.refetch();
    keyword.refetch();
  };

  const understood = phase === "understood" ? nlp.data : null;

  return (
    <div className="mt-8 space-y-6">
      <div className="space-y-3">
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {status}
        </p>
        {understood && (
          <IntentChips
            applied={understood.appliedFilters}
            unapplied={understood.unappliedFilters}
            busy={nlp.isPending}
            onRemove={(key: FilterKey) => navigate(withDrop(state, key))}
          />
        )}
        <WatchSearchButton
          query={q}
          appliedFilters={understood?.appliedFilters ?? []}
          hasEvents={(counts.events ?? 0) > 0 || tab === "events"}
        />
        {total > 0 && <TypeTabs current={tab} counts={counts} onSelect={(t) => navigate(withTab(state, t))} />}
      </div>

      <div aria-busy={busy} className="space-y-10">
        {waiting && <ResultsSkeleton />}
        {empty && <SearchEmptyState query={q} onRetry={retry} />}
        {!empty && total > 0 && visible.length === 0 && onlyType && (
          <p className="text-muted-foreground">
            No {SECTION_LABELS[onlyType].toLowerCase()} for &ldquo;{q}&rdquo;.{" "}
            <button
              type="button"
              className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-2"
              onClick={() => navigate(withTab(state, "all"))}
            >
              Show all results
            </button>
          </p>
        )}
        {visible.map((section) => {
          const common = {
            rows: section.rows,
            cap: section.cap,
            hubTerm: keyword.term,
            expanded: onlyType !== null,
            onShowAll: (type: SearchResultType) => navigate(withTab(state, resultTypeTab(type))),
            onOpen,
          };
          return section.type === "events" ? (
            <EventsSection key="events" {...common} />
          ) : (
            <SearchResultSection key={section.type} type={section.type} {...common} />
          );
        })}
      </div>
    </div>
  );
}

/**
 * /search. The destination of the site's main search box.
 *
 * Everything is read from the URL (?q, ?type, ?drop; src/lib/searchUrlState.ts),
 * so Back, reload and a shared link all show the same view, and the query
 * cache keyed on those values answers Back without another model call.
 */
export default function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo(() => parseSearchUrl(searchParams), [searchParams]);
  const { q } = state;
  const [input, setInput] = useState(q);

  useEffect(() => {
    setInput(q);
  }, [q]);

  const navigate = useCallback(
    (next: SearchUrlState) => setSearchParams(writeSearchUrl(next)),
    [setSearchParams],
  );

  const submit = (value: string) => {
    if (!isSearchableQuery(value)) return;
    navigate(withQuery(state, value));
  };

  const searchable = isSearchableQuery(q);

  return (
    <>
      {/* WEB-SEO-005: internal search results are thin by construction, so
          noindex,follow. public/_headers sends the same directive as an
          X-Robots-Tag, so a crawler has it before any JS runs (and before it
          costs a model call); this tag is the in-document copy. */}
      <SEOHead
        title={q ? `Search: ${q}` : "Search"}
        description="Search events, restaurants, places and hotels in Des Moines. Describe what you want in plain words."
        robots="noindex, follow"
      />
      <div className="flex min-h-screen flex-col">
        <Header />
        {/* Plain <div>, not <main>: App.tsx already provides the single
            top-level <main id="main-content"> landmark. */}
        <div className="container mx-auto flex-1 px-4 py-8">
          <div className="max-w-3xl">
            <h1 className="mb-2 text-2xl font-bold sm:text-3xl">Search Des Moines</h1>
            <p className="mb-4 max-w-prose text-muted-foreground">
              Events, restaurants, places and hotels. Describe what you want, like &ldquo;free things to do this
              weekend with kids&rdquo;.
            </p>
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                submit(input);
              }}
              className="relative"
            >
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                enterKeyHint="search"
                maxLength={MAX_QUERY_LENGTH}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="What are you looking for?"
                aria-label="Search Des Moines"
                className="h-12 pl-11 pr-28 text-base"
              />
              <Button
                type="submit"
                className="absolute right-1.5 top-1/2 min-h-11 -translate-y-1/2"
                disabled={!isSearchableQuery(input)}
              >
                Search
              </Button>
            </form>
          </div>

          {!q && (
            <div className="mt-8 max-w-3xl">
              <SearchEmptyState onExample={submit} />
            </div>
          )}

          {/* WEB-QA-033. A query under three characters never reaches a
              search, so without this branch /search?q=x rendered a box and
              nothing else. */}
          {q && !searchable && (
            <div className="mt-8 max-w-3xl rounded-xl border p-6 sm:p-8">
              <h2 className="mb-2 text-lg font-semibold">Keep typing</h2>
              <p className="text-muted-foreground">
                Searches need at least three characters. Try
                describing what you&rsquo;re after, like &ldquo;live music this weekend&rdquo;.
              </p>
            </div>
          )}

          {searchable && <ResultsView state={state} navigate={navigate} />}
        </div>
        <Footer />
      </div>
    </>
  );
}
