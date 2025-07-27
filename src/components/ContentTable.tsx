import React, { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Edit, Trash2, Search, Filter, Star, Plus } from "lucide-react";

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
      { key: "date", label: "Date", type: "date" },
      { key: "category", label: "Category", type: "badge" },
      { key: "is_featured", label: "Featured", type: "boolean" },
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
    ],
    filters: [
      { key: "status", label: "Status", options: ["All", "announced", "opening_soon", "soft_opening", "open", "delayed", "cancelled"] },
      { key: "cuisine", label: "Cuisine", options: ["All", "American", "Italian", "Mexican", "Asian", "Other"] },
    ]
  }
};

export default function ContentTable({
  type,
  items,
  isLoading,
  totalCount,
  onEdit,
  onDelete,
  onSearch,
  onFilter,
  onCreate
}: ContentTableProps) {
  const config = tableConfigs[type];
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    onSearch(value);
  };

  const handleFilterChange = (filterKey: string, value: string) => {
    const newFilters = { ...activeFilters, [filterKey]: value };
    setActiveFilters(newFilters);
    onFilter(newFilters);
  };

  const renderCellContent = (item: any, column: any) => {
    const value = item[column.key];

    switch (column.type) {
      case "text":
        return <span className="font-medium">{value || "-"}</span>;
      
      case "date":
        return value ? new Date(value).toLocaleDateString() : "-";
      
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{config.title}</h2>
          <p className="text-muted-foreground">
            Manage your {config.title.toLowerCase()} ({totalCount} total)
          </p>
        </div>
        {onCreate && (
          <Button onClick={onCreate}>
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
          <CardTitle>{config.title} List</CardTitle>
          <CardDescription>
            {items.length} of {totalCount} items shown
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
              {items.length === 0 ? (
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
                items.map((item) => (
                  <TableRow key={item.id}>
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