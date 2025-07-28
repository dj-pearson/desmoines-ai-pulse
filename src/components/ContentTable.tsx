import React, { useState, useMemo } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { Edit, Trash2, Search, Filter, Star, Plus, Sparkles, AlertTriangle, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ContentType = "event" | "restaurant" | "attraction" | "playground" | "restaurant_opening";

interface ContentTableProps {
  type: ContentType;
  items: any[];
  isLoading: boolean;
  totalCount: number;
  onEdit: (item: any) => void;
  onDelete: (id: string) => void;
  onSearch: (search: string) => void;
  onFilter: (filter: any) => void;
  onCreate?: () => void;
}

const tableConfigs = {
  event: {
    title: "Events",
    searchPlaceholder: "Search events...",
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
    ],
    filters: [
      { key: "category", label: "Category", options: ["All", "Art", "Sports", "Music", "Food", "Entertainment"] },
      { key: "status", label: "Status", options: ["All", "Featured", "Enhanced", "Pending"] },
    ]
  },
  restaurant: {
    title: "Restaurants",
    searchPlaceholder: "Search restaurants...",
    columns: [
      { key: "name", label: "Name", type: "text" },
      { key: "cuisine", label: "Cuisine", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "price_range", label: "Price", type: "badge" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "website", label: "Website", type: "link" },
      { key: "description", label: "Description", type: "truncated" },
      { key: "rating", label: "Rating", type: "rating" },
      { key: "is_featured", label: "Featured", type: "boolean" },
    ],
    filters: [
      { key: "cuisine", label: "Cuisine", options: ["All", "American", "Italian", "Mexican", "Asian", "Other"] },
      { key: "price_range", label: "Price Range", options: ["All", "$", "$$", "$$$", "$$$$"] },
    ]
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
      { key: "type", label: "Type", options: ["All", "Museum", "Park", "Entertainment", "Historic", "Other"] },
    ]
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
      { key: "age_range", label: "Age Range", options: ["All", "0-2", "2-5", "5-12", "All Ages"] },
    ]
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
      { key: "status", label: "Status", options: ["All", "announced", "opening_soon", "soft_opening", "open", "delayed", "cancelled"] },
      { key: "cuisine", label: "Cuisine", options: ["All", "American", "Italian", "Mexican", "Asian", "Other"] },
    ]
  }
};

export default function ContentTable({ type, items, isLoading, totalCount, onEdit, onDelete, onSearch, onFilter, onCreate }: ContentTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [enhancingId, setEnhancingId] = useState<string | null>(null);
  
  const config = tableConfigs[type];

  // Sort and filter items with null date handling
  const processedItems = useMemo(() => {
    let filtered = [...items];
    
    // Sort items - special handling for events to sort by date
    if (type === 'event') {
      filtered.sort((a, b) => {
        // Put null dates at the end
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        
        // Sort by date ascending (earliest first)
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
    }
    
    return filtered;
  }, [items, type]);

  // Get events with missing dates for the banner
  const eventsWithoutDates = useMemo(() => {
    if (type === 'event') {
      return items.filter(item => !item.date);
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
      const { data, error } = await supabase.functions.invoke('enhance-content', {
        body: { 
          contentType: type,
          contentId: item.id,
          currentData: item
        }
      });

      if (error) throw error;

      if (data.success) {
        toast.success('Content enhanced successfully!');
        // Trigger a refresh of the data
        onSearch(searchTerm);
      } else {
        throw new Error(data.error || 'Enhancement failed');
      }
    } catch (error) {
      console.error('Enhancement error:', error);
      toast.error('Failed to enhance content: ' + (error as Error).message);
    } finally {
      setEnhancingId(null);
    }
  };

  const renderCellContent = (item: any, column: any) => {
    const value = item[column.key];
    
    // Special highlighting for null dates
    if (column.key === 'date' && type === 'event' && !value) {
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
        return value ? new Date(value).toLocaleDateString() : (
          <span className="text-muted-foreground">No date</span>
        );
      
      case "badge":
        return value ? (
          <Badge variant="secondary">{value}</Badge>
        ) : "-";
      
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
        ) : "-";
      
      case "truncated":
        return value ? (
          <div className="max-w-[200px] truncate" title={value}>
            {value}
          </div>
        ) : "-";
      
      case "link":
        return value ? (
          <a 
            href={value} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline max-w-[150px] truncate block"
            title={value}
          >
            {value.replace(/^https?:\/\//, '')}
          </a>
        ) : "-";
      
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
        ) : "-";
      
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
      {type === 'event' && eventsWithoutDates.length > 0 && (
        <Alert className="border-destructive bg-destructive/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-destructive">
                  {eventsWithoutDates.length} event(s) missing dates:
                </span>
                <span className="ml-2 text-sm">
                  {eventsWithoutDates.slice(0, 3).map(e => e.title).join(", ")}
                  {eventsWithoutDates.length > 3 && ` and ${eventsWithoutDates.length - 3} more`}
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
          <h2 className="text-mobile-title md:text-2xl font-bold">{config.title}</h2>
          <p className="text-muted-foreground text-mobile-caption">
            Manage your {config.title.toLowerCase()} ({totalCount} total)
            {type === 'event' && (
              <span className="ml-2 text-destructive">
                {eventsWithoutDates.length > 0 && `• ${eventsWithoutDates.length} missing dates`}
              </span>
            )}
          </p>
        </div>
        {onCreate && (
          <Button onClick={onCreate} className="touch-target">
            <Plus className="h-4 w-4 mr-2" />
            Add New
          </Button>
        )}
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
            
            <Button variant="outline">
              <Filter className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{config.title} List</span>
            {type === 'event' && (
              <Badge variant="outline" className="text-xs">
                Sorted by date (earliest first)
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {processedItems.length} of {totalCount} items shown
            {type === 'event' && eventsWithoutDates.length > 0 && (
              <span className="ml-2 text-destructive font-medium">
                • {eventsWithoutDates.length} need dates
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {config.columns.map((column) => (
                  <TableHead key={column.key}>{column.label}</TableHead>
                ))}
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {processedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={config.columns.length + 1} className="text-center py-8">
                    <div className="text-muted-foreground">
                      <p>No {config.title.toLowerCase()} found.</p>
                      <p className="text-sm mt-1">
                        Try adjusting your search or filters.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                processedItems.map((item) => (
                  <TableRow 
                    key={item.id}
                    className={
                      type === 'event' && !item.date 
                        ? "bg-destructive/5 border-l-4 border-l-destructive" 
                        : ""
                    }
                  >
                    {config.columns.map((column) => (
                      <TableCell key={column.key}>
                        {renderCellContent(item, column)}
                      </TableCell>
                    ))}
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
                         <Button
                           size="sm"
                           variant="destructive"
                           onClick={() => {
                             if (confirm(`Are you sure you want to delete this ${type}?`)) {
                               onDelete(item.id);
                             }
                           }}
                         >
                           <Trash2 className="h-4 w-4" />
                         </Button>
                       </div>
                     </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}