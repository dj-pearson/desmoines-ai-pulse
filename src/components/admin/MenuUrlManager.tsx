import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { ExternalLink, Link2, Link2Off, Save, RotateCcw, Search } from "lucide-react";

export interface RestaurantMenuRow {
  id: string;
  name: string;
  website: string | null;
  menu_url: string | null;
  menu_scrape_enabled: boolean;
  has_menu: boolean;
  last_captured: string | null;
  items_count: number;
}

interface MenuUrlManagerProps {
  restaurants: RestaurantMenuRow[];
}

interface EditState {
  [id: string]: string;
}

export function MenuUrlManager({ restaurants }: MenuUrlManagerProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editUrls, setEditUrls] = useState<EditState>({});
  const [saving, setSaving] = useState<string | null>(null);

  const filtered = restaurants.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.menu_url || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.website || "").toLowerCase().includes(search.toLowerCase())
  );

  const updateMenuUrl = useMutation({
    mutationFn: async ({
      id,
      menu_url,
    }: {
      id: string;
      menu_url: string | null;
    }) => {
      const { error } = await supabase
        .from("restaurants")
        .update({ menu_url: menu_url || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      toast.success("Menu URL saved");
      setEditUrls((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["admin-menu-restaurants"] });
    },
    onError: (err: Error) => toast.error(`Save failed: ${err.message}`),
  });

  const toggleScrapeEnabled = useMutation({
    mutationFn: async ({
      id,
      enabled,
    }: {
      id: string;
      enabled: boolean;
    }) => {
      const { error } = await supabase
        .from("restaurants")
        .update({ menu_scrape_enabled: enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { enabled }) => {
      toast.success(enabled ? "Scraping enabled" : "Scraping disabled");
      queryClient.invalidateQueries({ queryKey: ["admin-menu-restaurants"] });
    },
    onError: (err: Error) => toast.error(`Update failed: ${err.message}`),
  });

  const handleSave = async (id: string) => {
    const url = editUrls[id]?.trim() || null;
    setSaving(id);
    await updateMenuUrl.mutateAsync({ id, menu_url: url });
    setSaving(null);
  };

  const handleClear = async (id: string) => {
    setSaving(id);
    await updateMenuUrl.mutateAsync({ id, menu_url: null });
    setSaving(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search restaurants or URLs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {filtered.length} of {restaurants.length} restaurants
        </p>
      </div>

      <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-3">
        Set a <strong>Menu URL</strong> when a restaurant's menu lives at a different address
        than their main website (e.g. a third-party ordering platform, a separate menu subdomain,
        or a direct PDF link). This URL will be used <em>exclusively</em> for all future scrape
        runs, skipping the pattern-guessing step entirely.
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Restaurant</TableHead>
              <TableHead className="min-w-[220px]">Website</TableHead>
              <TableHead className="min-w-[300px]">Custom Menu URL</TableHead>
              <TableHead className="w-[100px] text-center">Auto-Scrape</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                  No restaurants match your search.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => {
              const currentEdit = editUrls[r.id];
              const isSaving = saving === r.id;

              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col gap-0.5">
                      <span className="truncate max-w-[190px]" title={r.name}>
                        {r.name}
                      </span>
                      {r.has_menu && (
                        <Badge variant="secondary" className="w-fit text-xs">
                          Has menu
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    {r.website ? (
                      <a
                        href={r.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-primary hover:underline truncate max-w-[210px]"
                        title={r.website}
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        {r.website.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="https://restaurant.com/menu"
                        value={currentEdit ?? r.menu_url ?? ""}
                        onChange={(e) =>
                          setEditUrls((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        className="h-8 text-sm"
                      />
                      {(r.menu_url || currentEdit) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={currentEdit ?? r.menu_url ?? ""}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>Open URL</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Switch
                        checked={r.menu_scrape_enabled}
                        disabled={toggleScrapeEnabled.isPending}
                        onCheckedChange={(checked) =>
                          toggleScrapeEnabled.mutate({ id: r.id, enabled: checked })
                        }
                      />
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1">
                      {(editUrls[r.id] !== undefined) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                aria-label="Save URL"
                                disabled={isSaving}
                                onClick={() => handleSave(r.id)}
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Save URL</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {r.menu_url && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                aria-label="Clear URL"
                                disabled={isSaving}
                                onClick={() => handleClear(r.id)}
                              >
                                <Link2Off className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Clear custom URL</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
