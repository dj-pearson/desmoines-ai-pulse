import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SortOption {
  value: string;
  label: string;
}

interface SortDropdownProps {
  options: SortOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /**
   * Icon-only trigger below `sm`, full label from `sm` up. For one-row bars on
   * a phone; the accessible name stays "Sort results" either way.
   */
  compact?: boolean;
}

// 44px trigger (docs/page-plans/events.md WP2 item 5); it was h-9.
export function SortDropdown({ options, value, onChange, className, compact = false }: SortDropdownProps) {
  return (
    <div className={className}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          className={cn(
            "h-11 text-sm",
            compact
              ? "w-11 justify-center px-0 sm:w-[180px] sm:justify-between sm:px-3 [&>svg:last-child]:hidden sm:[&>svg:last-child]:inline"
              : "w-[180px]"
          )}
          aria-label="Sort results"
        >
          <ArrowUpDown
            className={cn("h-3.5 w-3.5 text-muted-foreground", compact ? "sm:mr-2" : "mr-2")}
            aria-hidden="true"
          />
          <SelectValue placeholder="Sort by" className={compact ? "sr-only sm:not-sr-only" : undefined} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export const EVENT_SORT_OPTIONS: SortOption[] = [
  { value: "date_asc", label: "Date (Soonest)" },
  { value: "date_desc", label: "Date (Latest)" },
  { value: "newest", label: "Recently Added" },
  { value: "title_asc", label: "Name (A-Z)" },
];

export const RESTAURANT_SORT_OPTIONS: SortOption[] = [
  { value: "popularity", label: "Most Popular" },
  { value: "rating", label: "Highest Rated" },
  { value: "price_low", label: "Price (Low-High)" },
  { value: "price_high", label: "Price (High-Low)" },
  { value: "newest", label: "Recently Added" },
  { value: "alphabetical", label: "Name (A-Z)" },
];

export const ATTRACTION_SORT_OPTIONS: SortOption[] = [
  { value: "rating", label: "Highest Rated" },
  { value: "newest", label: "Recently Added" },
  { value: "name_asc", label: "Name (A-Z)" },
];
