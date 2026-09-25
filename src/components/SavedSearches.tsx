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
import type { SavedSearch } from "@/hooks/useAdvancedSearch";

export type { SavedSearch };

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
  /**
   * Reads every row defensively: the table also holds /events saves and iOS
   * saves, whose `filters` have none of this page's keys (search plan WP4
   * item 1). A row this page can't load says what it will open instead.
   */
  const getSearchDescription = (search: SavedSearch) => {
    if (!search.restorable) {
      return search.query ? `Opens search for "${search.query}"` : 'Opens search';
    }
    const filters = search.filters;
    const parts: string[] = [];

    if (filters.query) parts.push(`"${filters.query}"`);
    if (filters.category && filters.category !== 'All') parts.push(filters.category);
    if (filters.location) parts.push(filters.location);
    if (filters.rating > 0) parts.push(`${filters.rating}+ stars`);
    if (filters.featuredOnly) parts.push('Featured');
    if (filters.dateRange?.start || filters.dateRange?.end) parts.push('Date range');

    return parts.length > 0 ? parts.join(' \u00b7 ') : 'Everything';
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
          <Heart className="h-10 w-10 mx-auto text-muted-foreground mb-4" aria-hidden="true" />
          <h3 className="text-lg font-semibold mb-2">No saved searches yet</h3>
          <p className="text-sm text-muted-foreground">
            Set your filters, then press Save on the filters card.
          </p>
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
      <CardContent>
        <ul className="space-y-3" aria-label="Saved searches">
        {savedSearches.map((search) => (
          <li
            key={search.id}
            className="flex flex-col gap-3 p-3 rounded-lg border bg-card"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium truncate min-w-0">{search.name}</h4>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {search.useCount} uses
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {getSearchDescription(search)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Last used: {formatLastUsed(search.lastUsed)}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onLoadSearch(search)}
                className="flex items-center gap-1"
              >
                <Search className="h-3 w-3" aria-hidden="true" />
                {search.restorable ? 'Use' : 'Open'}
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" aria-label={`More options for ${search.name}`}>
                    <MoreVertical className="h-4 w-4" aria-hidden="true" />
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
          </li>
        ))}
        </ul>
      </CardContent>
    </Card>
  );
}