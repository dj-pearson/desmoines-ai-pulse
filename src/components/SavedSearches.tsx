import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Heart, Search, MoreVertical, Trash2, Edit } from "lucide-react";
import { AdvancedSearchFilters } from "./AdvancedSearchFilters";

export interface SavedSearch {
  id: string;
  name: string;
  filters: AdvancedSearchFilters;
  createdAt: Date;
  lastUsed?: Date;
  useCount: number;
}

interface SavedSearchesProps {
  savedSearches: SavedSearch[];
  onLoadSearch: (search: SavedSearch) => void;
  onDeleteSearch: (searchId: string) => void;
  onRenameSearch?: (searchId: string, newName: string) => void;
  className?: string;
}

export function SavedSearches({
  savedSearches,
  onLoadSearch,
  onDeleteSearch,
  onRenameSearch,
  className
}: SavedSearchesProps) {
  const getSearchDescription = (filters: AdvancedSearchFilters) => {
    const parts = [];
    
    if (filters.category !== 'All') {
      parts.push(filters.category);
    }
    
    if (filters.location) {
      parts.push(filters.location);
    }
    
    if (filters.rating > 0) {
      parts.push(`${filters.rating}+ stars`);
    }
    
    if (filters.features.length > 0) {
      parts.push(`${filters.features.length} features`);
    }
    
    return parts.length > 0 ? parts.join(' • ') : 'Custom search';
  };

  const formatLastUsed = (date?: Date) => {
    if (!date) return 'Never used';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  if (savedSearches.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Saved Searches</h3>
          <p className="text-muted-foreground mb-4">
            Save your favorite search combinations for quick access
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Heart className="h-4 w-4" />
            <span>Use the "Save" button when searching to get started</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="h-5 w-5" />
          Saved Searches ({savedSearches.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {savedSearches.map((search) => (
          <div
            key={search.id}
            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium truncate">{search.name}</h4>
                <Badge variant="secondary" className="text-xs">
                  {search.useCount} uses
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {getSearchDescription(search.filters)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Last used: {formatLastUsed(search.lastUsed)}
              </p>
            </div>
            
            <div className="flex items-center gap-2 ml-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onLoadSearch(search)}
                className="flex items-center gap-1"
              >
                <Search className="h-3 w-3" />
                Use
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onRenameSearch && (
                    <DropdownMenuItem
                      onClick={() => {
                        const newName = prompt('Enter new name:', search.name);
                        if (newName && newName.trim()) {
                          onRenameSearch(search.id, newName.trim());
                        }
                      }}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Rename
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => onDeleteSearch(search.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}