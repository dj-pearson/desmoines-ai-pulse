import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Search,
  Leaf,
  WheatOff,
  Flame,
  Star,
  Trash2,
  ExternalLink,
  Clock,
  Hash,
} from "lucide-react";
import type { MenuVersion, MenuSection, MenuItemRow } from "@/hooks/useRestaurantMenu";

interface MenuItemsViewerProps {
  restaurantId: string;
  restaurantName: string;
  menu: MenuVersion | null;
  sections: MenuSection[];
  versions: MenuVersion[];
  onClose: () => void;
}

function dietaryIcon(tag: string) {
  if (tag === "vegan" || tag === "vegetarian")
    return <Leaf className="h-3 w-3 text-green-600" />;
  if (tag === "gluten-free") return <WheatOff className="h-3 w-3 text-yellow-600" />;
  if (tag === "spicy") return <Flame className="h-3 w-3 text-red-500" />;
  return null;
}

function sourceLabel(type: string) {
  const map: Record<string, string> = {
    scraped: "Web scrape",
    uploaded_image: "Uploaded image",
    uploaded_pdf: "Uploaded PDF",
    manual: "Manual entry",
    api: "API",
  };
  return map[type] ?? type;
}

export function MenuItemsViewer({
  restaurantId,
  restaurantName,
  menu,
  sections,
  versions,
  onClose,
}: MenuItemsViewerProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(sections.map((s) => s.name))
  );
  const [showVersions, setShowVersions] = useState(false);
  const [deletingItem, setDeletingItem] = useState<string | null>(null);

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("restaurant_menu_items")
        .delete()
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item removed");
      queryClient.invalidateQueries({ queryKey: ["restaurant-menu", restaurantId] });
      queryClient.invalidateQueries({ queryKey: ["admin-menu-restaurants"] });
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  });

  const deleteMenu = useMutation({
    mutationFn: async (menuId: string) => {
      const { error } = await supabase
        .from("restaurant_menus")
        .delete()
        .eq("id", menuId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Menu version deleted");
      queryClient.invalidateQueries({ queryKey: ["restaurant-menu", restaurantId] });
      queryClient.invalidateQueries({ queryKey: ["admin-menu-restaurants"] });
      onClose();
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  });

  const setCurrentVersion = useMutation({
    mutationFn: async (menuId: string) => {
      const { error } = await supabase
        .from("restaurant_menus")
        .update({ is_current: true })
        .eq("id", menuId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Version restored as current menu");
      queryClient.invalidateQueries({ queryKey: ["restaurant-menu", restaurantId] });
      queryClient.invalidateQueries({ queryKey: ["admin-menu-restaurants"] });
    },
    onError: (err: Error) => toast.error(`Restore failed: ${err.message}`),
  });

  const toggleSection = (name: string) =>
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const filteredSections = sections
    .map((s) => ({
      ...s,
      items: s.items.filter(
        (item) =>
          !search ||
          item.item_name.toLowerCase().includes(search.toLowerCase()) ||
          (item.item_description || "").toLowerCase().includes(search.toLowerCase())
      ),
    }))
    .filter((s) => s.items.length > 0);

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{restaurantName}</DialogTitle>
          <DialogDescription>
            {menu ? (
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <span className="flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  v{menu.version} · {sourceLabel(menu.source_type)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(menu.captured_at).toLocaleDateString()}
                </span>
                <span>{totalItems} items</span>
                {menu.source_url && (
                  <a
                    href={menu.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Source
                  </a>
                )}
              </span>
            ) : (
              "No current menu"
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search items…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-8 text-sm"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setShowVersions(!showVersions)}
          >
            History ({versions.length})
          </Button>
          {menu && (
            <Button
              variant="destructive"
              size="sm"
              className="h-8"
              disabled={deleteMenu.isPending}
              onClick={() => {
                if (confirm(`Delete current menu for ${restaurantName}? This removes all ${totalItems} items.`)) {
                  deleteMenu.mutate(menu.id);
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete Menu
            </Button>
          )}
        </div>

        {/* Version history */}
        {showVersions && versions.length > 0 && (
          <div className="rounded-md border text-sm divide-y bg-muted/20">
            {versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between px-3 py-2 gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {v.is_current && (
                    <Badge variant="default" className="text-xs shrink-0">Current</Badge>
                  )}
                  <span className="font-medium">v{v.version}</span>
                  <span className="text-muted-foreground text-xs">
                    {sourceLabel(v.source_type)} · {new Date(v.captured_at).toLocaleDateString()}
                  </span>
                  {v.notes && (
                    <span className="text-muted-foreground text-xs truncate">{v.notes}</span>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {!v.is_current && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs"
                      disabled={setCurrentVersion.isPending}
                      onClick={() => setCurrentVersion.mutate(v.id)}
                    >
                      Restore
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-destructive hover:text-destructive"
                    disabled={deleteMenu.isPending}
                    onClick={() => {
                      if (confirm("Delete this version?")) deleteMenu.mutate(v.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Menu items */}
        <ScrollArea className="flex-1 min-h-0 pr-1">
          {!menu && (
            <p className="text-center text-muted-foreground py-12">
              No menu data for this restaurant yet.
            </p>
          )}
          {menu && filteredSections.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No items match your search.</p>
          )}
          {filteredSections.map((section) => (
            <Collapsible
              key={section.name}
              open={expandedSections.has(section.name)}
              onOpenChange={() => toggleSection(section.name)}
              className="mb-2"
            >
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-semibold text-sm py-2 px-1 hover:text-primary transition-colors">
                {expandedSections.has(section.name) ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                {section.name}
                <Badge variant="secondary" className="ml-auto text-xs">
                  {section.items.length}
                </Badge>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-6 space-y-0.5">
                  {section.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-2 py-1.5 text-sm border-b border-border/50 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium">{item.item_name}</span>
                          {item.is_popular && (
                            <Star className="h-3 w-3 text-amber-500 fill-amber-400" />
                          )}
                          {item.dietary_tags.map((tag) => {
                            const icon = dietaryIcon(tag);
                            return icon ? (
                              <span key={tag} title={tag}>{icon}</span>
                            ) : null;
                          })}
                        </div>
                        {item.item_description && (
                          <p className="text-muted-foreground text-xs leading-snug mt-0.5">
                            {item.item_description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-start gap-2 shrink-0">
                        {item.price && (
                          <span className="text-muted-foreground text-xs whitespace-nowrap">
                            {item.price}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          aria-label="Delete menu item"
                          disabled={deletingItem === item.id}
                          onClick={() => {
                            setDeletingItem(item.id);
                            deleteItem.mutate(item.id, {
                              onSettled: () => setDeletingItem(null),
                            });
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
