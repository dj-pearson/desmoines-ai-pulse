import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpDown } from "lucide-react";

export interface SortOption {
  value: string;
  label: string;
}

interface SortDropdownProps {
  options: SortOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SortDropdown({ options, value, onChange, className }: SortDropdownProps) {
  return (
    <div className={className}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[180px] h-9 text-sm" aria-label="Sort results">
          <ArrowUpDown className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
          <SelectValue placeholder="Sort by" />
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
