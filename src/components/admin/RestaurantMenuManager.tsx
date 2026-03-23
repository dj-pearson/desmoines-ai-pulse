import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  UtensilsCrossed,
  Upload,
  Link2,
  Link2Off,
  RefreshCw,
  Eye,
  Play,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  BarChart3,
  Save,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { MenuScrapePanel } from "./MenuScrapePanel";
import { MenuUploadPanel } from "./MenuUploadPanel";
import { MenuUrlManager, type RestaurantMenuRow } from "./MenuUrlManager";
import { MenuItemsViewer } from "./MenuItemsViewer";
import { useRestaurantMenu } from "@/hooks/useRestaurantMenu";

// ─── Data hook ──────────────────────────────────────────────────────────────

function useAdminMenuRestaurants() {
  return useQuery<RestaurantMenuRow[]>({
    queryKey: ["admin-menu-restaurants"],
    queryFn: async () => {
      // Fetch restaurants with menu URL config
      const { data: rests, error: restErr } = await supabase
        .from("restaurants")
        .select("id, name, website, menu_url, menu_scrape_enabled")
        .order("name");

      if (restErr) throw restErr;

      // Fetch current menu stats per restaurant
      const { data: menus, error: menuErr } = await supabase
        .from("restaurant_menus")
        .select("restaurant_id, captured_at, id")
        .eq("is_current", true);

      if (menuErr) throw menuErr;

      // Fetch item counts per menu
      const menuIds = (menus || []).map((m) => m.id);
      let itemCounts: Record<string, number> = {};

      if (menuIds.length > 0) {
        const { data: counts } = await supabase
          .from("restaurant_menu_items")
          .select("menu_id")
          .in("menu_id", menuIds);

        for (const row of counts || []) {
          itemCounts[row.menu_id] = (itemCounts[row.menu_id] || 0) + 1;
        }
      }

      const menuByRestaurant = Object.fromEntries(
        (menus || []).map((m) => [m.restaurant_id, m])
      );

      return (rests || []).map((r) => {
        const currentMenu = menuByRestaurant[r.id];
        return {
          id: r.id,
          name: r.name,
          website: r.website,
          menu_url: r.menu_url,
          menu_scrape_enabled: r.menu_scrape_enabled ?? true,
          has_menu: !!currentMenu,
          last_captured: currentMenu?.captured_at ?? null,
          items_count: currentMenu ? (itemCounts[currentMenu.id] ?? 0) : 0,
        } satisfies RestaurantMenuRow;
      });
    },
    staleTime: 2 * 60 * 1000,
  });
}

// ─── Overview stats ──────────────────────────────────────────────────────────

function OverviewStats({ restaurants }: { restaurants: RestaurantMenuRow[] }) {
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const withMenu = restaurants.filter((r) => r.has_menu);
  const withoutMenu = restaurants.filter((r) => !r.has_menu);
  const stale = restaurants.filter(
    (r) =>
      r.has_menu &&
      r.last_captured &&
      now - new Date(r.last_captured).getTime() > thirtyDaysMs
  );
  const withCustomUrl = restaurants.filter((r) => r.menu_url);
  const scrapingDisabled = restaurants.filter((r) => !r.menu_scrape_enabled);

  const stats = [
    { label: "Total Restaurants", value: restaurants.length, icon: UtensilsCrossed, color: "text-foreground" },
    { label: "With Menus", value: withMenu.length, icon: CheckCircle2, color: "text-green-600" },
    { label: "No Menu", value: withoutMenu.length, icon: XCircle, color: "text-orange-500" },
    { label: "Stale (>30d)", value: stale.length, icon: Clock, color: "text-yellow-600" },
    { label: "Custom Menu URL", value: withCustomUrl.length, icon: Link2, color: "text-blue-500" },
    { label: "Scrape Disabled", value: scrapingDisabled.length, icon: XCircle, color: "text-muted-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <Card key={s.label} className="shadow-none">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground leading-tight mt-0.5">{s.label}</p>
                </div>
                <Icon className={`h-5 w-5 mt-0.5 ${s.color}`} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Restaurant overview table ────────────────────────────────────────────────

interface ViewerState {
  restaurantId: string;
  restaurantName: string;
}

function RestaurantTable({
  restaurants,
  onUpload,
  onScrape,
  onView,
}: {
  restaurants: RestaurantMenuRow[];
  onUpload: (id: string) => void;
  onScrape: (id: string) => void;
  onView: (id: string, name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "no_menu" | "stale" | "has_menu">("all");
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editUrls, setEditUrls] = useState<Record<string, string>>({});
  const [savingUrlId, setSavingUrlId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const filtered = restaurants.filter((r) => {
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase());
    const stale =
      r.has_menu && r.last_captured && now - new Date(r.last_captured).getTime() > thirtyDaysMs;
    const matchFilter =
      filter === "all" ||
      (filter === "no_menu" && !r.has_menu) ||
      (filter === "stale" && r.has_menu && stale) ||
      (filter === "has_menu" && r.has_menu);
    return matchSearch && matchFilter;
  });

  const handleSaveUrl = async (r: RestaurantMenuRow) => {
    const url = editUrls[r.id]?.trim() || null;
    setSavingUrlId(r.id);
    try {
      const { error } = await supabase
        .from("restaurants")
        .update({ menu_url: url })
        .eq("id", r.id);
      if (error) throw error;
      toast.success(url ? "Menu URL saved" : "Menu URL cleared");
      setEditUrls((prev) => {
        const next = { ...prev };
        delete next[r.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["admin-menu-restaurants"] });
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingUrlId(null);
    }
  };

  const handleClearUrl = async (r: RestaurantMenuRow) => {
    setSavingUrlId(r.id);
    try {
      const { error } = await supabase
        .from("restaurants")
        .update({ menu_url: null })
        .eq("id", r.id);
      if (error) throw error;
      toast.success("Menu URL cleared");
      setEditUrls((prev) => {
        const next = { ...prev };
        delete next[r.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["admin-menu-restaurants"] });
    } catch (err) {
      toast.error(`Clear failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingUrlId(null);
    }
  };

  const handleScrapeOne = async (r: RestaurantMenuRow) => {
    setScrapingId(r.id);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-restaurant-menus", {
        body: { restaurant_id: r.id, force_update: true },
      });
      if (error) throw new Error(error.message);
      const result = data as { succeeded: number; total_items: number; errors?: string[] };
      if (result.succeeded > 0) {
        toast.success(`Menu scraped: ${result.total_items} items`);
        queryClient.invalidateQueries({ queryKey: ["admin-menu-restaurants"] });
      } else {
        toast.warning(result.errors?.[0] ?? "No menu content found");
      }
    } catch (err) {
      toast.error(`Scrape failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setScrapingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search restaurants…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-36 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="no_menu">No Menu</SelectItem>
            <SelectItem value="stale">Stale &gt;30d</SelectItem>
            <SelectItem value="has_menu">Has Menu</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} restaurants</span>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Restaurant</TableHead>
              <TableHead className="w-[90px]">Menu</TableHead>
              <TableHead className="w-[80px] text-right">Items</TableHead>
              <TableHead className="w-[120px]">Last Updated</TableHead>
              <TableHead className="w-[80px]">URL</TableHead>
              <TableHead className="w-[150px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
        </Table>
        <ScrollArea className="h-[400px]">
          <Table>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    No restaurants match your filters.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => {
                const stale =
                  r.has_menu &&
                  r.last_captured &&
                  now - new Date(r.last_captured).getTime() > thirtyDaysMs;
                const isScraping = scrapingId === r.id;
                const isExpanded = expandedId === r.id;
                const currentEditUrl = editUrls[r.id];
                const displayUrl = currentEditUrl ?? r.menu_url ?? "";
                const hasUnsavedUrl = currentEditUrl !== undefined;
                const isSavingUrl = savingUrlId === r.id;

                return (
                  <>
                    <TableRow key={r.id}>
                      <TableCell className="min-w-[200px]">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-sm leading-tight">{r.name}</span>
                          {!r.menu_scrape_enabled && (
                            <Badge variant="outline" className="w-fit text-xs text-muted-foreground">
                              Scrape off
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        {r.has_menu ? (
                          <Badge
                            variant="secondary"
                            className={stale ? "bg-yellow-100 text-yellow-800 border-yellow-200" : "bg-green-100 text-green-800 border-green-200"}
                          >
                            {stale ? "Stale" : "Current"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-orange-600 border-orange-300">
                            None
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-right text-sm text-muted-foreground">
                        {r.has_menu ? r.items_count : "—"}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground">
                        {r.last_captured
                          ? new Date(r.last_captured).toLocaleDateString()
                          : "—"}
                      </TableCell>

                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 gap-1 text-xs"
                          onClick={() => setExpandedId(isExpanded ? null : r.id)}
                          aria-label={isExpanded ? "Collapse menu URL" : "Edit menu URL"}
                        >
                          {r.menu_url ? (
                            <Badge variant="outline" className="text-xs text-blue-600 border-blue-300 pointer-events-none">
                              Custom
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">Pattern</span>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </Button>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Scrape now"
                            disabled={isScraping || (!r.website && !r.menu_url)}
                            onClick={() => handleScrapeOne(r)}
                            aria-label="Scrape now"
                          >
                            {isScraping ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Upload menu"
                            onClick={() => onUpload(r.id)}
                            aria-label="Upload menu"
                          >
                            <Upload className="h-3.5 w-3.5" />
                          </Button>
                          {r.has_menu && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="View menu items"
                              onClick={() => onView(r.id, r.name)}
                              aria-label="View menu items"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Inline custom menu URL editor */}
                    {isExpanded && (
                      <TableRow key={`${r.id}-url`} className="bg-muted/30 hover:bg-muted/40">
                        <TableCell colSpan={6} className="py-2 px-4">
                          <div className="flex items-center gap-2">
                            <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <Input
                              placeholder="https://restaurant.com/menu or direct PDF link…"
                              value={displayUrl}
                              onChange={(e) =>
                                setEditUrls((prev) => ({ ...prev, [r.id]: e.target.value }))
                              }
                              className="h-8 text-sm flex-1"
                            />
                            {displayUrl && (
                              <a
                                href={displayUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary shrink-0"
                                title="Open URL"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1 shrink-0"
                              disabled={isSavingUrl || !hasUnsavedUrl}
                              onClick={() => handleSaveUrl(r)}
                            >
                              <Save className="h-3.5 w-3.5" />
                              Save
                            </Button>
                            {r.menu_url && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1 shrink-0 text-destructive hover:text-destructive"
                                disabled={isSavingUrl}
                                onClick={() => handleClearUrl(r)}
                              >
                                <Link2Off className="h-3.5 w-3.5" />
                                Clear
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="default"
                              className="h-8 gap-1 shrink-0"
                              disabled={isScraping || isSavingUrl || (!r.website && !r.menu_url && !displayUrl)}
                              onClick={async () => {
                                // Save URL first if changed, then scrape
                                if (hasUnsavedUrl) {
                                  await handleSaveUrl(r);
                                }
                                handleScrapeOne({
                                  ...r,
                                  menu_url: hasUnsavedUrl ? (editUrls[r.id]?.trim() || null) : r.menu_url,
                                });
                              }}
                            >
                              {isScraping ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                              )}
                              Scrape Now
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface RestaurantMenuManagerProps {
  defaultTab?: string;
}

export function RestaurantMenuManager({ defaultTab = "overview" }: RestaurantMenuManagerProps) {
  const { data: restaurants = [], isLoading, error } = useAdminMenuRestaurants();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [uploadRestaurantId, setUploadRestaurantId] = useState<string | undefined>();

  const restaurantForViewer = viewer
    ? restaurants.find((r) => r.id === viewer.restaurantId)
    : null;

  const { data: viewerMenuData } = useRestaurantMenu(viewer?.restaurantId);

  const handleUpload = (id: string) => {
    setUploadRestaurantId(id);
    setActiveTab("upload");
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive text-sm p-4 border border-destructive/30 rounded-lg">
        Failed to load restaurants: {error instanceof Error ? error.message : String(error)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OverviewStats restaurants={restaurants} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Restaurants
          </TabsTrigger>
          <TabsTrigger value="scrape" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Scraping
          </TabsTrigger>
          <TabsTrigger value="upload" className="gap-2">
            <Upload className="h-4 w-4" />
            Upload Menu
          </TabsTrigger>
          <TabsTrigger value="urls" className="gap-2">
            <Link2 className="h-4 w-4" />
            Menu URLs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <RestaurantTable
            restaurants={restaurants}
            onUpload={handleUpload}
            onScrape={(id) => {
              /* handled inline in RestaurantTable */
            }}
            onView={(id, name) => setViewer({ restaurantId: id, restaurantName: name })}
          />
        </TabsContent>

        <TabsContent value="scrape" className="mt-4">
          <MenuScrapePanel restaurants={restaurants} />
        </TabsContent>

        <TabsContent value="upload" className="mt-4">
          <MenuUploadPanel
            restaurants={restaurants.map((r) =>
              uploadRestaurantId && r.id === uploadRestaurantId
                ? { ...r }
                : r
            )}
          />
        </TabsContent>

        <TabsContent value="urls" className="mt-4">
          <MenuUrlManager restaurants={restaurants} />
        </TabsContent>
      </Tabs>

      {/* Menu items viewer dialog */}
      {viewer && viewerMenuData && (
        <MenuItemsViewer
          restaurantId={viewer.restaurantId}
          restaurantName={viewer.restaurantName}
          menu={viewerMenuData.menu}
          sections={viewerMenuData.sections}
          versions={viewerMenuData.versions}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
