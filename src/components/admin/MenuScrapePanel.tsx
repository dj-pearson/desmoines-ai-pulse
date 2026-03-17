import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Loader2,
  SkipForward,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { RestaurantMenuRow } from "./MenuUrlManager";

interface MenuScrapePanelProps {
  restaurants: RestaurantMenuRow[];
}

interface ScrapeLogEntry {
  restaurant_id: string;
  name: string;
  status: "pending" | "running" | "success" | "skipped" | "error";
  message?: string;
  items_count?: number;
}

export function MenuScrapePanel({ restaurants }: MenuScrapePanelProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "no_menu" | "stale" | "has_menu">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchSize, setBatchSize] = useState("10");
  const [forceUpdate, setForceUpdate] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<ScrapeLogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const filtered = restaurants.filter((r) => {
    const matchSearch =
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase());

    const stale =
      r.last_captured &&
      now - new Date(r.last_captured).getTime() > thirtyDaysMs;

    const matchFilter =
      filterMode === "all" ||
      (filterMode === "no_menu" && !r.has_menu) ||
      (filterMode === "stale" && r.has_menu && stale) ||
      (filterMode === "has_menu" && r.has_menu);

    return matchSearch && matchFilter;
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.id)));
    }
  };

  const appendLog = (entry: ScrapeLogEntry) => {
    setLog((prev) => {
      const idx = prev.findIndex((e) => e.restaurant_id === entry.restaurant_id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = entry;
        return next;
      }
      return [...prev, entry];
    });
    setTimeout(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }), 50);
  };

  const scrapeOne = async (restaurantId: string, name: string): Promise<void> => {
    appendLog({ restaurant_id: restaurantId, name, status: "running" });
    try {
      const { data, error } = await supabase.functions.invoke("scrape-restaurant-menus", {
        body: { restaurant_id: restaurantId, force_update: forceUpdate },
      });
      if (error) throw new Error(error.message);
      const result = data as {
        success: boolean;
        processed: number;
        succeeded: number;
        total_items: number;
        errors?: string[];
      };
      const skipped = result.total_items === 0 && result.succeeded === 0;
      appendLog({
        restaurant_id: restaurantId,
        name,
        status: skipped ? "skipped" : result.succeeded > 0 ? "success" : "error",
        items_count: result.total_items,
        message: result.errors?.[0] ?? (skipped ? "Already current / no content found" : undefined),
      });
    } catch (err) {
      appendLog({
        restaurant_id: restaurantId,
        name,
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const runBatch = async (restaurantIds?: string[]) => {
    if (running) return;
    setRunning(true);
    setLog([]);

    try {
      if (restaurantIds && restaurantIds.length > 0) {
        // Process one-by-one for granular logging
        for (const id of restaurantIds) {
          const r = restaurants.find((x) => x.id === id);
          if (r) await scrapeOne(id, r.name);
        }
      } else {
        // Let the edge function handle batch selection
        appendLog({ restaurant_id: "batch", name: "Batch Scrape", status: "running", message: `Requesting batch of ${batchSize}...` });
        const { data, error } = await supabase.functions.invoke("scrape-restaurant-menus", {
          body: { batch_size: parseInt(batchSize), force_update: forceUpdate },
        });
        if (error) throw new Error(error.message);
        const result = data as {
          success: boolean;
          processed: number;
          succeeded: number;
          total_items: number;
          errors?: string[];
        };
        appendLog({
          restaurant_id: "batch",
          name: "Batch Scrape",
          status: result.succeeded > 0 || result.processed > 0 ? "success" : "error",
          items_count: result.total_items,
          message: `${result.succeeded}/${result.processed} succeeded · ${result.total_items} items${result.errors?.length ? ` · ${result.errors.length} errors` : ""}`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["admin-menu-restaurants"] });
      toast.success("Scrape run complete");
    } catch (err) {
      toast.error(`Scrape failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  const statusIcon = (status: ScrapeLogEntry["status"]) => {
    if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    if (status === "success") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === "skipped") return <SkipForward className="h-4 w-4 text-yellow-500" />;
    if (status === "error") return <XCircle className="h-4 w-4 text-red-500" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const noMenuCount = restaurants.filter((r) => !r.has_menu).length;
  const staleCount = restaurants.filter(
    (r) => r.has_menu && r.last_captured && now - new Date(r.last_captured).getTime() > thirtyDaysMs
  ).length;

  return (
    <div className="space-y-6">
      {/* Controls row */}
      <div className="flex flex-wrap items-end gap-4 p-4 bg-muted/30 rounded-lg">
        <div className="space-y-1">
          <Label>Batch Size</Label>
          <Select value={batchSize} onValueChange={setBatchSize}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["5", "10", "25", "50"].map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pb-1">
          <Switch
            id="force-update"
            checked={forceUpdate}
            onCheckedChange={setForceUpdate}
          />
          <Label htmlFor="force-update" className="cursor-pointer">
            Force re-scrape (ignore 30-day cooldown)
          </Label>
        </div>

        <div className="flex gap-2 pb-1 ml-auto">
          <Button
            variant="outline"
            disabled={running || noMenuCount === 0}
            onClick={() => {
              const ids = restaurants.filter((r) => !r.has_menu).map((r) => r.id);
              runBatch(ids.slice(0, parseInt(batchSize)));
            }}
          >
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Scrape No-Menu ({noMenuCount})
          </Button>
          <Button
            disabled={running || selected.size === 0}
            onClick={() => runBatch([...selected])}
          >
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Scrape Selected ({selected.size})
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Restaurant selector table */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-8"
              />
            </div>
            <Select value={filterMode} onValueChange={(v) => setFilterMode(v as typeof filterMode)}>
              <SelectTrigger className="w-36 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="no_menu">No Menu ({noMenuCount})</SelectItem>
                <SelectItem value="stale">Stale &gt;30d ({staleCount})</SelectItem>
                <SelectItem value="has_menu">Has Menu</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected.size > 0 && selected.size === filtered.length}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Restaurant</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-16">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      disabled={running || selected.size === 0}
                      onClick={() => runBatch([...selected])}
                    >
                      Run
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
            </Table>
            <ScrollArea className="h-72">
              <Table>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No restaurants match your filters.
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((r) => {
                    const logEntry = log.find((l) => l.restaurant_id === r.id);
                    const stale =
                      r.has_menu &&
                      r.last_captured &&
                      now - new Date(r.last_captured).getTime() > thirtyDaysMs;

                    return (
                      <TableRow key={r.id} className={selected.has(r.id) ? "bg-muted/50" : ""}>
                        <TableCell className="w-10">
                          <Checkbox
                            checked={selected.has(r.id)}
                            onCheckedChange={() => toggleSelect(r.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium leading-tight">{r.name}</span>
                            <div className="flex gap-1">
                              {!r.has_menu && (
                                <Badge variant="outline" className="text-xs px-1 py-0 text-orange-600 border-orange-300">
                                  No menu
                                </Badge>
                              )}
                              {stale && (
                                <Badge variant="outline" className="text-xs px-1 py-0 text-yellow-600 border-yellow-300">
                                  Stale
                                </Badge>
                              )}
                              {r.menu_url && (
                                <Badge variant="outline" className="text-xs px-1 py-0 text-blue-600 border-blue-300">
                                  Custom URL
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="w-24">
                          {logEntry ? (
                            <div className="flex items-center gap-1">
                              {statusIcon(logEntry.status)}
                              <span className="text-xs text-muted-foreground">
                                {logEntry.status === "success" ? `${logEntry.items_count} items` : logEntry.status}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {r.has_menu ? `${r.items_count} items` : "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="w-16">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={running}
                            onClick={() => runBatch([r.id])}
                          >
                            {logEntry?.status === "running" ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Play className="h-3 w-3" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </div>

        {/* Live log */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Run Log</h3>
            {log.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setLog([])}>
                Clear
              </Button>
            )}
          </div>

          <div
            ref={logRef}
            className="rounded-md border bg-muted/20 h-80 overflow-y-auto p-3 space-y-2 font-mono text-xs"
          >
            {log.length === 0 && (
              <p className="text-muted-foreground">No runs yet. Select restaurants and click Run.</p>
            )}
            {log.map((entry, i) => (
              <div key={i} className="flex items-start gap-2">
                {statusIcon(entry.status)}
                <div>
                  <span className="font-semibold">{entry.name}</span>
                  {entry.items_count !== undefined && entry.items_count > 0 && (
                    <span className="text-green-600 ml-1">· {entry.items_count} items</span>
                  )}
                  {entry.message && (
                    <div className="text-muted-foreground">{entry.message}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {log.length > 0 && (
            <div className="flex gap-4 text-xs text-muted-foreground pt-1">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                {log.filter((e) => e.status === "success").length} succeeded
              </span>
              <span className="flex items-center gap-1">
                <SkipForward className="h-3 w-3 text-yellow-500" />
                {log.filter((e) => e.status === "skipped").length} skipped
              </span>
              <span className="flex items-center gap-1">
                <XCircle className="h-3 w-3 text-red-500" />
                {log.filter((e) => e.status === "error").length} failed
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
