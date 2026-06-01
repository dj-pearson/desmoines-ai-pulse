import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Hotel as HotelIcon,
  Link2,
  Link2Off,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import HotelEditDialog from "@/components/admin/HotelEditDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebounce } from "@/hooks/useDebounce";
import { useHotelFilterOptions, useHotels } from "@/hooks/useHotels";
import type { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { handleError } from "@/lib/errorHandler";
import { toast } from "sonner";

type Hotel = Database["public"]["Tables"]["hotels"]["Row"];

const PAGE_SIZE = 25;

type SortKey = "updated" | "alphabetical" | "rating";
type AffiliateFilter = "all" | "with" | "without";

interface BulkActionState {
  open: boolean;
  kind: "delete" | "regen" | null;
}

interface RegenRow {
  id: string;
  name: string;
  brand_parent: string;
  affiliate_url: string | null;
  status: string;
}

interface RegenResult {
  success: boolean;
  updated: number;
  skipped: number;
  results?: RegenRow[];
  configured_brands?: string[];
  unconfigured_brands?: string[];
}

function HotelImage({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="h-10 w-14 rounded bg-muted flex items-center justify-center flex-shrink-0">
        <HotelIcon className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="h-10 w-14 rounded object-cover flex-shrink-0"
      loading="lazy"
    />
  );
}

function StarRating({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums text-sm">
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      {rating.toFixed(1)}
    </span>
  );
}

function HotelDetailSheet({
  hotel,
  open,
  onOpenChange,
}: {
  hotel: Hotel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!hotel) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <HotelIcon className="h-5 w-5" />
            {hotel.name}
          </SheetTitle>
          <SheetDescription>
            Read-only preview. Edit dialog ships in ADMIN-HOTEL-002.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 mt-4 text-sm">
          {hotel.image_url && (
            <img
              src={hotel.image_url}
              alt={hotel.name}
              className="w-full aspect-video object-cover rounded-md"
            />
          )}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            <dt className="text-muted-foreground">Type</dt>
            <dd>{hotel.hotel_type ?? "—"}</dd>
            <dt className="text-muted-foreground">Area</dt>
            <dd>{hotel.area ?? "—"}</dd>
            <dt className="text-muted-foreground">Star rating</dt>
            <dd>
              <StarRating rating={hotel.star_rating} />
            </dd>
            <dt className="text-muted-foreground">Price range</dt>
            <dd>{hotel.price_range ?? "—"}</dd>
            <dt className="text-muted-foreground">Chain</dt>
            <dd>{hotel.chain_name ?? "—"}</dd>
            <dt className="text-muted-foreground">Featured</dt>
            <dd>{hotel.is_featured ? "Yes" : "No"}</dd>
            <dt className="text-muted-foreground">Active</dt>
            <dd>{hotel.is_active ? "Yes" : "No"}</dd>
          </dl>
          {hotel.description && (
            <div>
              <div className="text-muted-foreground text-xs mb-1">Description</div>
              <p className="leading-snug">{hotel.description}</p>
            </div>
          )}
          {hotel.affiliate_url && (
            <div>
              <div className="text-muted-foreground text-xs mb-1">
                Affiliate URL{" "}
                {hotel.affiliate_provider && (
                  <span className="ml-1">({hotel.affiliate_provider})</span>
                )}
              </div>
              <a
                href={hotel.affiliate_url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary text-sm hover:underline break-all inline-flex items-center gap-1"
              >
                {hotel.affiliate_url}
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
            </div>
          )}
          {hotel.amenities && hotel.amenities.length > 0 && (
            <div>
              <div className="text-muted-foreground text-xs mb-1">Amenities</div>
              <div className="flex flex-wrap gap-1">
                {hotel.amenities.map((a) => (
                  <Badge key={a} variant="secondary" className="text-xs">
                    {a}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        <SheetFooter className="mt-6">
          <SheetClose asChild>
            <Button variant="outline">Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default function HotelManager() {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 300);
  const [hotelType, setHotelType] = useState<string>("all");
  const [affiliate, setAffiliate] = useState<AffiliateFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Hotel | null>(null);
  const [editing, setEditing] = useState<Hotel | null | undefined>(undefined);
  const [softDeleting, setSoftDeleting] = useState<Hotel | null>(null);
  const [bulkState, setBulkState] = useState<BulkActionState>({
    open: false,
    kind: null,
  });
  const [busy, setBusy] = useState(false);
  const [regenResult, setRegenResult] = useState<RegenResult | null>(null);

  const filterOptions = useHotelFilterOptions();
  const hotelsState = useHotels({
    search: search || undefined,
    hotelType: hotelType === "all" ? undefined : [hotelType],
    hasAffiliate:
      affiliate === "with" ? true : affiliate === "without" ? false : undefined,
    sortBy,
    activeOnly: false,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(hotelsState.totalCount / PAGE_SIZE)),
    [hotelsState.totalCount],
  );

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const pageIds = hotelsState.hotels.map((h) => h.id);
  const allOnPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function toggleAllOnPage(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const id of pageIds) next.add(id);
      } else {
        for (const id of pageIds) next.delete(id);
      }
      return next;
    });
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function resetFilters() {
    setSearchInput("");
    setHotelType("all");
    setAffiliate("all");
    setSortBy("updated");
    setPage(0);
  }

  async function bulkSetFeatured(value: boolean) {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase
        .from("hotels")
        .update({ is_featured: value })
        .in("id", selectedIds);
      if (error) throw error;
      toast.success(
        `${selectedIds.length} hotel${selectedIds.length === 1 ? "" : "s"} ${value ? "featured" : "un-featured"}`,
      );
      clearSelection();
      await hotelsState.refetch();
    } catch (error) {
      handleError(error, {
        component: "HotelManager",
        action: "bulkSetFeatured",
      });
      toast.error("Bulk update failed. Check console for details.");
    } finally {
      setBusy(false);
    }
  }

  async function softDeleteOne(hotel: Hotel) {
    setBusy(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase
        .from("hotels")
        .update({ is_active: false })
        .eq("id", hotel.id);
      if (error) throw error;
      toast.success(`Deactivated ${hotel.name}`);
      setSoftDeleting(null);
      await hotelsState.refetch();
    } catch (error) {
      handleError(error, {
        component: "HotelManager",
        action: "softDeleteOne",
      });
      toast.error("Deactivate failed. Check console for details.");
    } finally {
      setBusy(false);
    }
  }

  async function bulkRegenAffiliates() {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke<RegenResult>(
        "generate-hotel-affiliate-urls",
        { body: { hotel_ids: selectedIds } },
      );
      if (error) throw error;
      if (!data) throw new Error("Empty response from regen function");

      setRegenResult(data);
      setBulkState({ open: false, kind: null });
      toast.success(
        `Regenerated: ${data.updated} updated, ${data.skipped} skipped`,
      );
      await hotelsState.refetch();
    } catch (error) {
      handleError(error, {
        component: "HotelManager",
        action: "bulkRegenAffiliates",
      });
      toast.error("Affiliate regen failed. Check console for details.");
    } finally {
      setBusy(false);
    }
  }

  async function bulkSoftDelete() {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase
        .from("hotels")
        .update({ is_active: false })
        .in("id", selectedIds);
      if (error) throw error;
      toast.success(
        `${selectedIds.length} hotel${selectedIds.length === 1 ? "" : "s"} deactivated`,
      );
      clearSelection();
      setBulkState({ open: false, kind: null });
      await hotelsState.refetch();
    } catch (error) {
      handleError(error, {
        component: "HotelManager",
        action: "bulkSoftDelete",
      });
      toast.error("Bulk deactivate failed. Check console for details.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <HotelIcon className="h-5 w-5" />
              Hotels
            </CardTitle>
            <CardDescription>
              {hotelsState.totalCount.toLocaleString()} total · {selectedIds.length}{" "}
              selected
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setEditing(null)}>
            <Plus className="h-4 w-4 mr-1" />
            New hotel
          </Button>
        </div>

        {/* Filter bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(0);
              }}
              placeholder="Search name, area, chain…"
              className="pl-8"
            />
          </div>
          <Select
            value={hotelType}
            onValueChange={(v) => {
              setHotelType(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {filterOptions.hotelTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={affiliate}
            onValueChange={(v: AffiliateFilter) => {
              setAffiliate(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Affiliate link" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any affiliate state</SelectItem>
              <SelectItem value="with">With affiliate URL</SelectItem>
              <SelectItem value="without">Without affiliate URL</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v: SortKey) => setSortBy(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Most recently updated</SelectItem>
              <SelectItem value="alphabetical">Name (A–Z)</SelectItem>
              <SelectItem value="rating">Star rating (high → low)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(search || hotelType !== "all" || affiliate !== "all") && (
          <div className="mt-2">
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Reset filters
            </Button>
          </div>
        )}
      </CardHeader>

      {/* Bulk-action bar (only when ≥1 selected) */}
      {selectedIds.length > 0 && (
        <div className="px-6 pb-3">
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <span className="text-sm font-medium">
              {selectedIds.length} selected
            </span>
            <div className="flex flex-wrap gap-2 ml-auto">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => bulkSetFeatured(true)}
              >
                <Star className="h-3.5 w-3.5 mr-1" />
                Feature
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => bulkSetFeatured(false)}
              >
                Un-feature
              </Button>
              <AlertDialog
                open={bulkState.open && bulkState.kind === "regen"}
                onOpenChange={(open) =>
                  setBulkState({ open, kind: open ? "regen" : null })
                }
              >
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={busy}>
                    {busy && bulkState.kind === "regen" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    )}
                    Regen affiliates
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Regenerate affiliate URLs?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Calls the generate-hotel-affiliate-urls edge function for{" "}
                      {selectedIds.length} hotel
                      {selectedIds.length === 1 ? "" : "s"}. Hotels without a{" "}
                      <code>brand_parent</code> or a website are skipped. A
                      results dialog will list per-hotel outcomes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => bulkRegenAffiliates()}
                      disabled={busy}
                    >
                      Regenerate
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog
                open={bulkState.open && bulkState.kind === "delete"}
                onOpenChange={(open) =>
                  setBulkState({ open, kind: open ? "delete" : null })
                }
              >
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" disabled={busy}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Deactivate
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Deactivate hotels?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This sets <code>is_active = false</code> on{" "}
                      {selectedIds.length} hotel
                      {selectedIds.length === 1 ? "" : "s"}, hiding them from the
                      public site but preserving rows and analytics. Reactivate
                      anytime from the edit dialog.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => bulkSoftDelete()}
                      disabled={busy}
                    >
                      Deactivate
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                size="sm"
                variant="ghost"
                onClick={clearSelection}
                disabled={busy}
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}

      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={(c) => toggleAllOnPage(Boolean(c))}
                    aria-label="Select all on page"
                  />
                </TableHead>
                <TableHead className="w-16">Image</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden md:table-cell">Area</TableHead>
                <TableHead className="hidden lg:table-cell">Rating</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden xl:table-cell">Last regen</TableHead>
                <TableHead className="hidden xl:table-cell">Updated</TableHead>
                <TableHead className="w-12" aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {hotelsState.isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`skel-${i}`}>
                      <TableCell colSpan={10}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : hotelsState.hotels.length === 0
                  ? (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="text-center text-sm text-muted-foreground py-12"
                      >
                        <HotelIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        No hotels match the current filters.
                      </TableCell>
                    </TableRow>
                  )
                  : hotelsState.hotels.map((hotel) => {
                      const checked = selected.has(hotel.id);
                      return (
                        <TableRow
                          key={hotel.id}
                          className={cn(
                            "cursor-pointer",
                            checked && "bg-accent/40",
                          )}
                          onClick={() => setDetail(hotel)}
                        >
                          <TableCell
                            className="w-10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(c) =>
                                toggleOne(hotel.id, Boolean(c))
                              }
                              aria-label={`Select ${hotel.name}`}
                            />
                          </TableCell>
                          <TableCell>
                            <HotelImage src={hotel.image_url} alt={hotel.name} />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{hotel.name}</div>
                            {hotel.chain_name && (
                              <div className="text-xs text-muted-foreground">
                                {hotel.chain_name}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm">
                            {hotel.hotel_type ?? "—"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm">
                            {hotel.area ?? "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <StarRating rating={hotel.star_rating} />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {hotel.is_featured && (
                                <Badge variant="default" className="text-[10px]">
                                  Featured
                                </Badge>
                              )}
                              {!hotel.is_active && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] border-amber-500 text-amber-600"
                                >
                                  Inactive
                                </Badge>
                              )}
                              {hotel.affiliate_url ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] gap-1"
                                >
                                  <Link2 className="h-3 w-3" />
                                  Affiliate
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] gap-1 text-muted-foreground"
                                >
                                  <Link2Off className="h-3 w-3" />
                                  No link
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                            {hotel.affiliate_url_updated_at
                              ? new Date(
                                  hotel.affiliate_url_updated_at,
                                ).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                            {hotel.updated_at
                              ? new Date(hotel.updated_at).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell
                            className="w-12"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  aria-label={`Actions for ${hotel.name}`}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setEditing(hotel)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setDetail(hotel)}>
                                  Quick view
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  disabled={!hotel.is_active}
                                  onClick={() => setSoftDeleting(hotel)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Deactivate
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="text-muted-foreground">
            Page {page + 1} of {totalPages}
            {hotelsState.totalCount > 0 && (
              <span className="ml-2">· {hotelsState.totalCount.toLocaleString()} total</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || hotelsState.isLoading}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
              disabled={page + 1 >= totalPages || hotelsState.isLoading}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>

      <HotelDetailSheet
        hotel={detail}
        open={detail !== null}
        onOpenChange={(open) => !open && setDetail(null)}
      />

      <HotelEditDialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        hotel={editing ?? null}
        onSaved={() => {
          hotelsState.refetch();
        }}
      />

      <Dialog
        open={regenResult !== null}
        onOpenChange={(open) => !open && setRegenResult(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Affiliate regeneration results</DialogTitle>
            <DialogDescription>
              {regenResult
                ? `${regenResult.updated} updated · ${regenResult.skipped} skipped`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {regenResult?.unconfigured_brands &&
            regenResult.unconfigured_brands.length > 0 && (
              <div className="text-xs bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded p-2 mb-2">
                Unconfigured brands (env vars missing):{" "}
                <span className="font-medium">
                  {regenResult.unconfigured_brands.join(", ")}
                </span>
              </div>
            )}
          <div className="rounded-md border max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hotel</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(regenResult?.results ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm font-medium">
                      {row.name}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.brand_parent}
                    </TableCell>
                    <TableCell>
                      {row.status === "updated" ? (
                        <Badge variant="default" className="text-[10px]">
                          Updated
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {row.status}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenResult(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={softDeleting !== null}
        onOpenChange={(open) => !open && setSoftDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate hotel?</AlertDialogTitle>
            <AlertDialogDescription>
              {softDeleting
                ? `Set is_active = false on ${softDeleting.name}? Hidden from the public site but row + analytics preserved.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => softDeleting && softDeleteOne(softDeleting)}
              disabled={busy}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
