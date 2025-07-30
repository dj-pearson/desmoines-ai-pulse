import React, { useState, useMemo, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import {
  Edit,
  Trash2,
  Search,
  Filter,
  Star,
  Plus,
  Sparkles,
  AlertTriangle,
  Calendar,
  Brain,
  FileText,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useDomainHighlights } from "@/hooks/useDomainHighlights";
import EventDataEnhancer from "./EventDataEnhancer";
import { useWriteupGenerator } from "@/hooks/useWriteupGenerator";

type ContentType =
  | "event"
  | "restaurant"
  | "attraction"
  | "playground"
  | "restaurant_opening";

interface ContentTableProps {
  type: ContentType;
  items: any[];
  isLoading: boolean;
  totalCount: number;
  searchValue?: string; // Add external search value prop
  onEdit: (item: any) => void;
  onDelete: (id: string) => void;
  onSearch: (search: string) => void;
  onFilter: (filter: any) => void;
  onCreate?: () => void;
  onRefresh?: () => void;
}

const tableConfigs = {
  event: {
    title: "Events",
    searchPlaceholder: "Search events...",
    // Primary columns shown on all screen sizes
    primaryColumns: [
      { key: "title", label: "Title", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "category", label: "Category", type: "badge" },
      { key: "is_featured", label: "Featured", type: "boolean" },
    ],
    // Secondary columns shown on larger screens
    secondaryColumns: [
      { key: "venue", label: "Venue", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "price", label: "Price", type: "text" },
      { key: "original_description", label: "Description", type: "truncated" },
      { key: "source_url", label: "Source", type: "link" },
      { key: "is_enhanced", label: "Enhanced", type: "boolean" },
      { key: "ai_writeup", label: "AI Writeup", type: "boolean" },
    ],
    // All columns for backward compatibility
    columns: [
      { key: "title", label: "Title", type: "text" },
      { key: "venue", label: "Venue", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "price", label: "Price", type: "text" },
      { key: "category", label: "Category", type: "badge" },
      { key: "original_description", label: "Description", type: "truncated" },
      { key: "source_url", label: "Source", type: "link" },
      { key: "is_featured", label: "Featured", type: "boolean" },
      { key: "is_enhanced", label: "Enhanced", type: "boolean" },
      { key: "ai_writeup", label: "AI Writeup", type: "boolean" },
    ],
    filters: [
      {
        key: "category",
        label: "Category",
        options: ["All", "Art", "Sports", "Music", "Food", "Entertainment"],
      },
      {
        key: "status",
        label: "Status",
        options: ["All", "Featured", "Enhanced", "Pending"],
      },
    ],
    sortOptions: [
      { key: "date", label: "Event Date" },
      { key: "title", label: "Title (A-Z)" },
      { key: "venue", label: "Venue" },
      { key: "location", label: "Location" },
      { key: "category", label: "Category" },
      { key: "price", label: "Price" },
      { key: "created_at", label: "Date Added" },
      { key: "is_featured", label: "Featured First" },
      { key: "is_enhanced", label: "Enhanced First" },
      { key: "ai_writeup", label: "Has AI Writeup" },
    ],
  },
  restaurant: {
    title: "Restaurants",
    searchPlaceholder: "Search restaurants...",
    columns: [
      { key: "name", label: "Name", type: "text" },
      { key: "cuisine", label: "Cuisine", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "price_range", label: "Price", type: "badge" },
      { key: "opening_date", label: "Opening Date", type: "date" },
      { key: "opening_timeframe", label: "Opening Timeframe", type: "text" },
      { key: "status", label: "Status", type: "badge" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "website", label: "Website", type: "link" },
      { key: "description", label: "Description", type: "truncated" },
      { key: "rating", label: "Rating", type: "rating" },
      { key: "is_featured", label: "Featured", type: "boolean" },
      { key: "ai_writeup", label: "AI Writeup", type: "boolean" },
    ],
    filters: [
      {
        key: "cuisine",
        label: "Cuisine",
        options: ["All", "American", "Italian", "Mexican", "Asian", "Other"],
      },
      {
        key: "price_range",
        label: "Price Range",
        options: ["All", "$", "$$", "$$$", "$$$$"],
      },
      {
        key: "status",
        label: "Status",
        options: [
          "All",
          "open",
          "opening_soon",
          "newly_opened",
          "announced",
          "closed",
        ],
      },
    ],
    sortOptions: [
      { key: "name", label: "Name (A-Z)" },
      { key: "cuisine", label: "Cuisine" },
      { key: "location", label: "Location" },
      { key: "price_range", label: "Price Range" },
      { key: "opening_date", label: "Opening Date" },
      { key: "rating", label: "Rating" },
      { key: "is_featured", label: "Featured First" },
      { key: "ai_writeup", label: "Has AI Writeup" },
    ],
  },
  attraction: {
    title: "Attractions",
    searchPlaceholder: "Search attractions...",
    columns: [
      { key: "name", label: "Name", type: "text" },
      { key: "type", label: "Type", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "website", label: "Website", type: "link" },
      { key: "description", label: "Description", type: "truncated" },
      { key: "rating", label: "Rating", type: "rating" },
      { key: "is_featured", label: "Featured", type: "boolean" },
    ],
    filters: [
      {
        key: "type",
        label: "Type",
        options: [
          "All",
          "Museum",
          "Park",
          "Entertainment",
          "Historic",
          "Other",
        ],
      },
    ],
    sortOptions: [
      { key: "name", label: "Name (A-Z)" },
      { key: "type", label: "Type" },
      { key: "location", label: "Location" },
      { key: "rating", label: "Rating" },
      { key: "is_featured", label: "Featured First" },
    ],
  },
  playground: {
    title: "Playgrounds",
    searchPlaceholder: "Search playgrounds...",
    columns: [
      { key: "name", label: "Name", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "age_range", label: "Age Range", type: "badge" },
      { key: "amenities", label: "Amenities", type: "array" },
      { key: "description", label: "Description", type: "truncated" },
      { key: "rating", label: "Rating", type: "rating" },
      { key: "is_featured", label: "Featured", type: "boolean" },
    ],
    filters: [
      {
        key: "age_range",
        label: "Age Range",
        options: ["All", "0-2", "2-5", "5-12", "All Ages"],
      },
    ],
    sortOptions: [
      { key: "name", label: "Name (A-Z)" },
      { key: "location", label: "Location" },
      { key: "age_range", label: "Age Range" },
      { key: "rating", label: "Rating" },
      { key: "is_featured", label: "Featured First" },
    ],
  },
  restaurant_opening: {
    title: "Restaurant Openings",
    searchPlaceholder: "Search restaurant openings...",
    columns: [
      { key: "name", label: "Name", type: "text" },
      { key: "cuisine", label: "Cuisine", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "opening_date", label: "Opening Date", type: "date" },
      { key: "status", label: "Status", type: "badge" },
      { key: "description", label: "Description", type: "truncated" },
      { key: "source_url", label: "Source", type: "link" },
    ],
    filters: [
      {
        key: "status",
        label: "Status",
        options: [
          "All",
          "announced",
          "opening_soon",
          "soft_opening",
          "open",
          "delayed",
          "cancelled",
        ],
      },
      {
        key: "cuisine",
        label: "Cuisine",
        options: ["All", "American", "Italian", "Mexican", "Asian", "Other"],
      },
    ],
    sortOptions: [
      { key: "name", label: "Name (A-Z)" },
      { key: "cuisine", label: "Cuisine" },
      { key: "location", label: "Location" },
      { key: "opening_date", label: "Opening Date" },
      { key: "status", label: "Status" },
    ],
  },
};

export default function ContentTable({
  type,
  items,
  isLoading,
  totalCount,
  searchValue = "",
  onEdit,
  onDelete,
  onSearch,
  onFilter,
  onCreate,
  onRefresh,
}: ContentTableProps) {
  const [searchTerm, setSearchTerm] = useState(searchValue);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>(
    {}
  );
  const [enhancingId, setEnhancingId] = useState<string | null>(null);
  const [showDataEnhancer, setShowDataEnhancer] = useState(false);
  const [compactView, setCompactView] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<string>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const { isHighlightedDomain } = useDomainHighlights();
  const { generateWriteup, isGeneratingId } = useWriteupGenerator();

  // Sync internal search term with external search value
  useEffect(() => {
    setSearchTerm(searchValue);
  }, [searchValue]);

  const config = tableConfigs[type];

  // Helper function to toggle row expansion
  const toggleRowExpansion = (itemId: string) => {
    const newExpandedRows = new Set(expandedRows);
    if (newExpandedRows.has(itemId)) {
      newExpandedRows.delete(itemId);
    } else {
      newExpandedRows.add(itemId);
    }
    setExpandedRows(newExpandedRows);
  };

  // Get columns to display based on view mode
  const getDisplayColumns = () => {
    if (compactView && type === "event" && "primaryColumns" in config) {
      return config.primaryColumns;
    }
    return config.columns;
  };

  // Get additional details for expanded rows
  const getAdditionalColumns = () => {
    if (compactView && type === "event" && "secondaryColumns" in config) {
      return config.secondaryColumns;
    }
    return [];
  };

  // Comprehensive sorting function
  const sortItems = (
    items: any[],
    field: string,
    direction: "asc" | "desc"
  ) => {
    return [...items].sort((a, b) => {
      let aValue = a[field];
      let bValue = b[field];

      // Handle null/undefined values
      if (aValue === null || aValue === undefined) {
        return direction === "asc" ? 1 : -1;
      }
      if (bValue === null || bValue === undefined) {
        return direction === "asc" ? -1 : 1;
      }

      // Special handling for different data types
      switch (field) {
        case "date":
        case "created_at":
        case "updated_at":
          aValue = new Date(aValue).getTime();
          bValue = new Date(bValue).getTime();
          break;

        case "is_featured":
        case "is_enhanced":
        case "ai_writeup":
          // Convert to boolean for sorting
          aValue = Boolean(aValue);
          bValue = Boolean(bValue);
          // For boolean fields, show true values first
          if (aValue === bValue) return 0;
          return direction === "asc" ? (aValue ? -1 : 1) : aValue ? 1 : -1;

        case "price": {
          // Extract numeric value from price strings
          const priceA =
            parseFloat(String(aValue).replace(/[^0-9.]/g, "")) || 0;
          const priceB =
            parseFloat(String(bValue).replace(/[^0-9.]/g, "")) || 0;
          aValue = priceA;
          bValue = priceB;
          break;
        }

        case "title":
        case "venue":
        case "location":
        case "category":
          // String comparison (case insensitive)
          aValue = String(aValue).toLowerCase();
          bValue = String(bValue).toLowerCase();
          break;
      }

      // Compare values
      if (aValue < bValue) {
        return direction === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return direction === "asc" ? 1 : -1;
      }
      return 0;
    });
  };

  // Handle sort change
  const handleSortChange = (field: string) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new field with default direction
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Sort and filter items with comprehensive sorting
  const processedItems = useMemo(() => {
    let filtered = [...items];

    // Apply sorting
    if (type === "event") {
      filtered = sortItems(filtered, sortField, sortDirection);
    } else {
      // Default sorting for other types
      filtered.sort((a, b) => {
        const aTitle = String(a.name || a.title || "").toLowerCase();
        const bTitle = String(b.name || b.title || "").toLowerCase();
        return aTitle.localeCompare(bTitle);
      });
    }

    return filtered;
  }, [items, type, sortField, sortDirection]);

  // Get events with missing dates for the banner
  const eventsWithoutDates = useMemo(() => {
    if (type === "event") {
      return items.filter((item) => !item.date);
    }
    return [];
  }, [items, type]);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    onSearch(value);
  };

  const handleFilterChange = (filterKey: string, value: string) => {
    const newFilters = { ...activeFilters, [filterKey]: value };
    setActiveFilters(newFilters);
    onFilter(newFilters);
  };

  const handleEnhanceContent = async (item: any) => {
    setEnhancingId(item.id);
    try {
      const { data, error } = await supabase.functions.invoke(
        "enhance-content",
        {
          body: {
            contentType: type,
            contentId: item.id,
            currentData: item,
          },
        }
      );

      if (error) throw error;

      if (data.success) {
        toast.success("Content enhanced successfully!");
        // Trigger a refresh of the data
        onSearch(searchTerm);
      } else {
        throw new Error(data.error || "Enhancement failed");
      }
    } catch (error) {
      console.error("Enhancement error:", error);
      toast.error("Failed to enhance content: " + (error as Error).message);
    } finally {
      setEnhancingId(null);
    }
  };

  const handleGenerateWriteup = async (item: any) => {
    try {
      // Determine the URL field based on type
      const url = type === "event" ? item.source_url : item.website;

      if (!url) {
        toast.error("No URL available for writeup generation", {
          description: `This ${type} needs a ${
            type === "event" ? "source URL" : "website"
          } to generate a writeup.`,
        });
        return;
      }

      await generateWriteup({
        type: type as "event" | "restaurant",
        id: item.id,
        url: url,
        title: type === "event" ? item.title : item.name,
        description: item.description || item.original_description,
        location: item.location,
        cuisine: type === "restaurant" ? item.cuisine : undefined,
        category: type === "event" ? item.category : undefined,
      });

      // Refresh the data to show the new writeup
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error("Writeup generation error:", error);
    }
  };

  const renderCellContent = (item: any, column: any) => {
    const value = item[column.key];

    // Special highlighting for null dates
    if (column.key === "date" && type === "event" && !value) {
      return (
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">Missing Date</span>
        </div>
      );
    }

    switch (column.type) {
      case "text":
        return <span className="font-medium">{value || "-"}</span>;

      case "date":
        return value ? (
          new Date(value).toLocaleDateString()
        ) : (
          <span className="text-muted-foreground">No date</span>
        );

      case "badge":
        return value ? <Badge variant="secondary">{value}</Badge> : "-";

      case "boolean":
        return value ? (
          <Badge variant="default" className="bg-green-100 text-green-800">
            <Star className="h-3 w-3 mr-1" />
            Yes
          </Badge>
        ) : (
          <Badge variant="outline">No</Badge>
        );

      case "rating":
        return value ? (
          <div className="flex items-center">
            <Star className="h-4 w-4 text-yellow-400 mr-1" />
            {value.toFixed(1)}
          </div>
        ) : (
          "-"
        );

      case "truncated":
        return value ? (
          <div className="max-w-[200px] truncate" title={value}>
            {value}
          </div>
        ) : (
          "-"
        );

      case "link":
        return value ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline max-w-[150px] truncate block"
            title={value}
          >
            {value.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          "-"
        );

      case "array":
        return value && Array.isArray(value) && value.length > 0 ? (
          <div className="flex flex-wrap gap-1 max-w-[200px]">
            {value.slice(0, 3).map((item, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {item}
              </Badge>
            ))}
            {value.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{value.length - 3}
              </Badge>
            )}
          </div>
        ) : (
          "-"
        );

      default:
        return value || "-";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{config.title}</CardTitle>
            <CardDescription>Loading...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Missing Dates Banner for Events */}
      {type === "event" && eventsWithoutDates.length > 0 && (
        <Alert className="border-destructive bg-destructive/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-destructive">
                  {eventsWithoutDates.length} event(s) missing dates:
                </span>
                <span className="ml-2 text-sm">
                  {eventsWithoutDates
                    .slice(0, 3)
                    .map((e) => e.title)
                    .join(", ")}
                  {eventsWithoutDates.length > 3 &&
                    ` and ${eventsWithoutDates.length - 3} more`}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Scroll to first event without date
                  const firstMissingEvent = eventsWithoutDates[0];
                  if (firstMissingEvent) {
                    onEdit(firstMissingEvent);
                  }
                }}
              >
                <Calendar className="h-4 w-4 mr-1" />
                Fix First
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-mobile-title md:text-2xl font-bold">
            {config.title}
          </h2>
          <p className="text-muted-foreground text-mobile-caption">
            Manage your {config.title.toLowerCase()} ({totalCount} total)
            {type === "event" && (
              <span className="ml-2 text-destructive">
                {eventsWithoutDates.length > 0 &&
                  `• ${eventsWithoutDates.length} missing dates`}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {type === "event" && (
            <>
              <Button
                variant="outline"
                onClick={() => setCompactView(!compactView)}
                className="touch-target"
                size="sm"
              >
                {compactView ? "Full View" : "Compact"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowDataEnhancer(true)}
                className="touch-target"
              >
                <Brain className="h-4 w-4 mr-2" />
                AI Enhance
              </Button>
            </>
          )}
          {onCreate && (
            <Button onClick={onCreate} className="touch-target">
              <Plus className="h-4 w-4 mr-2" />
              Add New
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters & Search</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                <Input
                  placeholder={config.searchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Sort Controls */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                Sort by:
              </label>
              <Select value={sortField} onValueChange={setSortField}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {("sortOptions" in config ? config.sortOptions : []).map(
                    (option) => (
                      <SelectItem key={option.key} value={option.key}>
                        {option.label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>

              <div className="flex items-center border border-gray-300 rounded-md">
                <button
                  onClick={() => setSortDirection("asc")}
                  className={`p-2 rounded-l-md ${
                    sortDirection === "asc"
                      ? "bg-blue-500 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                  title="Sort Ascending"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setSortDirection("desc")}
                  className={`p-2 rounded-r-md ${
                    sortDirection === "desc"
                      ? "bg-blue-500 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                  title="Sort Descending"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>
            </div>

            {config.filters.map((filter) => (
              <Select
                key={filter.key}
                value={activeFilters[filter.key] || "All"}
                onValueChange={(value) => handleFilterChange(filter.key, value)}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder={filter.label} />
                </SelectTrigger>
                <SelectContent>
                  {filter.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}

            <Button
              variant="outline"
              onClick={() => {
                handleFilterChange("", "All");
                setSortField("date");
                setSortDirection("asc");
                handleSearch("");
              }}
            >
              <Filter className="h-4 w-4 mr-2" />
              Reset All
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{config.title} List</span>
            <div className="flex items-center gap-4">
              {type === "event" && "sortOptions" in config && (
                <Badge variant="outline" className="text-xs">
                  Sorted by{" "}
                  {config.sortOptions
                    .find((opt) => opt.key === sortField)
                    ?.label.toLowerCase()}{" "}
                  ({sortDirection === "asc" ? "ascending" : "descending"})
                </Badge>
              )}

              {/* View Toggle */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">View:</span>
                <div className="flex items-center border border-gray-300 rounded-md">
                  <button
                    onClick={() => setCompactView(false)}
                    className={`px-3 py-1 text-sm rounded-l-md ${
                      !compactView
                        ? "bg-blue-500 text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    Full
                  </button>
                  <button
                    onClick={() => setCompactView(true)}
                    className={`px-3 py-1 text-sm rounded-r-md ${
                      compactView
                        ? "bg-blue-500 text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    Compact
                  </button>
                </div>
              </div>
            </div>
          </CardTitle>
          <CardDescription>
            {processedItems.length} of {totalCount} items shown
            {type === "event" && eventsWithoutDates.length > 0 && (
              <span className="ml-2 text-destructive font-medium">
                • {eventsWithoutDates.length} need dates
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {compactView && type === "event" && (
                    <TableHead className="w-8"></TableHead>
                  )}
                  {getDisplayColumns().map((column) => (
                    <TableHead key={column.key}>{column.label}</TableHead>
                  ))}
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processedItems.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={config.columns.length + 1}
                      className="text-center py-8"
                    >
                      <div className="text-muted-foreground">
                        <p>No {config.title.toLowerCase()} found.</p>
                        <p className="text-sm mt-1">
                          Try adjusting your search or filters.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  processedItems.map((item) => {
                    const isHighlighted =
                      type === "event" &&
                      item.source_url &&
                      isHighlightedDomain(item.source_url);
                    const hasMissingDate = type === "event" && !item.date;
                    const isExpanded = expandedRows.has(item.id);
                    const hasAdditionalDetails =
                      compactView &&
                      type === "event" &&
                      getAdditionalColumns().length > 0;

                    return (
                      <React.Fragment key={item.id}>
                        <TableRow
                          className={`
                          ${
                            hasMissingDate
                              ? "bg-destructive/5 border-l-4 border-l-destructive"
                              : ""
                          }
                          ${
                            isHighlighted
                              ? "bg-warning/10 border-l-4 border-l-warning"
                              : ""
                          }
                          ${
                            isHighlighted && hasMissingDate
                              ? "bg-gradient-to-r from-destructive/5 to-warning/10 border-l-4 border-l-destructive border-r-4 border-r-warning"
                              : ""
                          }
                        `.trim()}
                        >
                          {/* Expand/Collapse button for compact view */}
                          {hasAdditionalDetails && (
                            <TableCell className="w-8">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleRowExpansion(item.id)}
                                className="h-6 w-6 p-0"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )}
                              </Button>
                            </TableCell>
                          )}

                          {/* Main columns */}
                          {getDisplayColumns().map((column) => (
                            <TableCell key={column.key}>
                              {renderCellContent(item, column)}
                            </TableCell>
                          ))}

                          {/* Actions */}
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onEdit(item)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEnhanceContent(item)}
                                disabled={enhancingId === item.id}
                              >
                                <Sparkles className="h-4 w-4" />
                              </Button>
                              {(type === "event" || type === "restaurant") && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleGenerateWriteup(item)}
                                  disabled={isGeneratingId(item.id)}
                                  title="Generate AI Writeup"
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Are you sure you want to delete this ${type}?`
                                    )
                                  ) {
                                    onDelete(item.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expanded row with additional details */}
                        {hasAdditionalDetails && isExpanded && (
                          <TableRow>
                            <TableCell></TableCell>
                            <TableCell
                              colSpan={getDisplayColumns().length + 1}
                              className="bg-muted/20 p-4"
                            >
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {getAdditionalColumns().map((column) => (
                                  <div key={column.key} className="space-y-1">
                                    <span className="text-sm font-medium text-muted-foreground">
                                      {column.label}:
                                    </span>
                                    <div className="text-sm">
                                      {renderCellContent(item, column)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Event Data Enhancer Dialog */}
      {type === "event" && (
        <EventDataEnhancer
          open={showDataEnhancer}
          onOpenChange={setShowDataEnhancer}
          events={items}
          onSuccess={() => {
            // Refresh the events data
            if (onRefresh) {
              onRefresh();
            } else {
              window.location.reload();
            }
          }}
        />
      )}
    </div>
  );
}
