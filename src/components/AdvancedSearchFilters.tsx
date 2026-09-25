import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Filter, Heart } from "lucide-react";
import { PremiumGate } from "@/components/PremiumGate";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import type {
  AdvancedSearchFilters as SearchFilters,
  AdvancedSearchSort,
} from "@/hooks/useAdvancedSearch";

/** One definition, owned by the hook that runs the queries. */
export type AdvancedSearchFilters = SearchFilters;

/**
 * What the Insider gate says it unlocks. Every item here reaches a query in
 * useAdvancedSearch; keep it that way (search plan WP4 item 2).
 */
const ADVANCED_FILTERS_GATE_COPY =
  "Filter by minimum rating, area, event dates and featured picks with an Insider subscription.";

interface AdvancedSearchFiltersProps {
  filters: AdvancedSearchFilters;
  onFiltersChange: (filters: AdvancedSearchFilters) => void;
  onSaveSearch?: (name: string, filters: AdvancedSearchFilters) => void;
  onReset: () => void;
  className?: string;
}

/** Radix Select forbids an empty-string item value, so "any" stands in for ''. */
const ANY_AREA = "any";

/**
 * Areas matched as a substring of the row's `location`. Suburb names appear in
 * addresses; "Downtown Des Moines" was dropped because an address never says it.
 */
const AREA_OPTIONS = [
  'West Des Moines',
  'Ankeny',
  'Urbandale',
  'Clive',
  'Johnston',
  'Waukee',
  'Altoona',
  'Pleasant Hill',
  'Norwalk',
];

const SORT_OPTIONS: { value: AdvancedSearchSort; label: string }[] = [
  { value: 'relevance', label: 'Default order' },
  { value: 'rating', label: 'Highest rated' },
];

/** Counts only the controls on this card; the query box is on the page. */
function activeFilterCount(filters: AdvancedSearchFilters): number {
  let count = 0;
  if (filters.location) count++;
  if (filters.rating > 0) count++;
  if (filters.featuredOnly) count++;
  if (filters.dateRange.start || filters.dateRange.end) count++;
  return count;
}

export function AdvancedSearchFilters({
  filters,
  onFiltersChange,
  onSaveSearch,
  onReset,
  className
}: AdvancedSearchFiltersProps) {
  const [saveSearchName, setSaveSearchName] = useState('');

  const updateFilters = (updates: Partial<AdvancedSearchFilters>) => {
    onFiltersChange({ ...filters, ...updates });
  };

  const handleSaveSearch = () => {
    if (saveSearchName.trim() && onSaveSearch) {
      onSaveSearch(saveSearchName.trim(), filters);
      setSaveSearchName('');
    }
  };

  const activeFiltersCount = activeFilterCount(filters);

  return (
    <PremiumGate
      feature="advanced_filters"
      requiredTier="insider"
      mode="lock"
      title="Advanced search filters"
      description={ADVANCED_FILTERS_GATE_COPY}
      className={className}
    >
    <Card className={className}>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" aria-hidden="true" />
            Filters
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-2" aria-label={`${activeFiltersCount} active`}>
                {activeFiltersCount}
              </Badge>
            )}
          </CardTitle>
          <div className="flex gap-2">
            {onSaveSearch && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Heart className="h-4 w-4 mr-1" aria-hidden="true" />
                    Save
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="space-y-3">
                    <Label htmlFor="search-name">Save this search</Label>
                    <Input
                      id="search-name"
                      placeholder="Name it, e.g. Ankeny weekend"
                      value={saveSearchName}
                      onChange={(e) => setSaveSearchName(e.target.value)}
                    />
                    <Button
                      onClick={handleSaveSearch}
                      disabled={!saveSearchName.trim()}
                      className="w-full"
                    >
                      Save search
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <Button variant="outline" size="sm" onClick={onReset}>
              Clear all
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Area */}
        <div className="space-y-3">
          <Label htmlFor="advanced-area" className="flex items-center gap-2">
            <SpriteIcon name="map-pin" className="h-4 w-4" />
            Area
          </Label>
          <Select
            value={filters.location || ANY_AREA}
            onValueChange={(value) => updateFilters({ location: value === ANY_AREA ? '' : value })}
          >
            <SelectTrigger id="advanced-area">
              <SelectValue placeholder="Any area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_AREA}>Any area</SelectItem>
              {AREA_OPTIONS.map(area => (
                <SelectItem key={area} value={area}>
                  {area}
                </SelectItem>
              ))}
              {/* A saved row may hold an area no longer offered; keep it selectable. */}
              {filters.location && !AREA_OPTIONS.includes(filters.location) && (
                <SelectItem value={filters.location}>{filters.location}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Rating */}
        <fieldset className="space-y-3">
          <legend className="flex items-center gap-2 text-sm font-medium leading-none">
            <Star className="h-4 w-4" aria-hidden="true" />
            Minimum rating
          </legend>
          <div className="flex flex-wrap gap-2">
            {[0, 3, 4, 4.5].map(rating => (
              <Button
                key={rating}
                variant={filters.rating === rating ? "default" : "outline"}
                size="sm"
                aria-pressed={filters.rating === rating}
                onClick={() => updateFilters({ rating })}
                className="flex items-center gap-1"
              >
                {rating === 0 ? 'Any' : `${rating}+`}
              </Button>
            ))}
          </div>
          {filters.rating > 0 && (
            <p className="text-xs text-muted-foreground">
              Events have no rating, so they're left out while this is set.
            </p>
          )}
        </fieldset>

        {/* Event dates */}
        <fieldset className="space-y-3">
          <legend className="flex items-center gap-2 text-sm font-medium leading-none">
            <SpriteIcon name="calendar" className="h-4 w-4" />
            Event dates
          </legend>
          <div className="flex gap-2">
            <Input
              type="date"
              aria-label="From"
              value={filters.dateRange.start ?? ''}
              onChange={(e) => updateFilters({
                dateRange: { ...filters.dateRange, start: e.target.value || undefined },
              })}
              className="flex-1"
            />
            <Input
              type="date"
              aria-label="To"
              value={filters.dateRange.end ?? ''}
              onChange={(e) => updateFilters({
                dateRange: { ...filters.dateRange, end: e.target.value || undefined },
              })}
              className="flex-1"
            />
          </div>
        </fieldset>

        {/* Featured */}
        <div className="flex items-center justify-between">
          <Label htmlFor="featured-only" className="text-sm">Featured only</Label>
          <Switch
            id="featured-only"
            checked={filters.featuredOnly}
            onCheckedChange={(checked) => updateFilters({ featuredOnly: checked })}
          />
        </div>

        {/* Sort */}
        <div className="space-y-3">
          <Label htmlFor="advanced-sort">Sort</Label>
          <Select
            value={filters.sortBy}
            onValueChange={(value) => updateFilters({ sortBy: value as AdvancedSearchSort })}
          >
            <SelectTrigger id="advanced-sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
    </PremiumGate>
  );
}
