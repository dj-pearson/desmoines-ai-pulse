import { useMemo, useState } from "react";
import {
  Baby,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LandPlot,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Sun,
  TicketCheck,
  Trash2,
} from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useAttractions } from "@/hooks/useAttractions";
import AttractionEditDialog from "@/components/admin/AttractionEditDialog";
import type { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { handleError } from "@/lib/errorHandler";
import { toast } from "sonner";

type Attraction = Database["public"]["Tables"]["attractions"]["Row"];

const PAGE_SIZE = 25;

type SortKey = "updated" | "alphabetical" | "rating" | "newest";

function AttractionImage({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="h-10 w-14 rounded bg-muted flex items-center justify-center flex-shrink-0">
        <LandPlot className="h-4 w-4 text-muted-foreground" />
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

function AttractionDetailSheet({
  attraction,
  open,
  onOpenChange,
}: {
  attraction: Attraction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!attraction) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <LandPlot className="h-5 w-5" />
            {attraction.name}
          </SheetTitle>
          <SheetDescription>Read-only preview.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 mt-4 text-sm">
          {attraction.image_url && (
            <img
              src={attraction.image_url}
              alt={attraction.name}
              className="w-full aspect-video object-cover rounded-md"
            />
          )}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            <dt className="text-muted-foreground">Type</dt>
            <dd>{attraction.type ?? "—"}</dd>
            <dt className="text-muted-foreground">Location</dt>
            <dd>{attraction.location ?? "—"}</dd>
            <dt className="text-muted-foreground">Address</dt>
            <dd>{attraction.address ?? "—"}</dd>
            <dt className="text-muted-foreground">Hours</dt>
            <dd>{attraction.hours_summary ?? "—"}</dd>
            <dt className="text-muted-foreground">Indoor</dt>
            <dd>
              {attraction.is_indoor == null
                ? "—"
                : attraction.is_indoor
                  ? "Yes"
                  : "No"}
            </dd>
            <dt className="text-muted-foreground">Kid-friendly</dt>
            <dd>{attraction.is_kid_friendly ? "Yes" : "—"}</dd>
            <dt className="text-muted-foreground">Free</dt>
            <dd>{attraction.is_free ? "Yes" : "—"}</dd>
            <dt className="text-muted-foreground">Featured</dt>
            <dd>{attraction.is_featured ? "Yes" : "No"}</dd>
            <dt className="text-muted-foreground">Active</dt>
            <dd>{attraction.is_active ? "Yes" : "No"}</dd>
            <dt className="text-muted-foreground">Rating</dt>
            <dd>{attraction.rating ?? "—"}</dd>
          </dl>
          {attraction.description && (
            <div>
              <div className="text-muted-foreground text-xs mb-1">Description</div>
              <p className="leading-snug whitespace-pre-line">
                {attraction.description}
              </p>
            </div>
          )}
          {attraction.accessibility_notes && (
            <div>
              <div className="text-muted-foreground text-xs mb-1">
                Accessibility
              </div>
              <p className="leading-snug whitespace-pre-line">
                {attraction.accessibility_notes}
              </p>
            </div>
          )}
          {attraction.website && (
            <a
              href={attraction.website}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary text-sm hover:underline break-all inline-flex items-center gap-1"
            >
              {attraction.website}
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
            </a>
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

export default function AttractionManager() {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 300);
  const [type, setType] = useState<string>("all");
  const [indoorFilter, setIndoorFilter] = useState<"all" | "indoor" | "outdoor">(
    "all",
  );
  const [kidFriendlyOnly, setKidFriendlyOnly] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Attraction | null>(null);
  const [editing, setEditing] = useState<Attraction | null | undefined>(
    undefined,
  );
  const [softDeleting, setSoftDeleting] = useState<Attraction | null>(null);
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const state = useAttractions({
    search: search || undefined,
    type: type === "all" ? undefined : type,
    indoorOnly:
      indoorFilter === "indoor"
        ? true
        : indoorFilter === "outdoor"
          ? false
          : undefined,
    kidFriendlyOnly: kidFriendlyOnly || undefined,
    freeOnly: freeOnly || undefined,
    featuredOnly: featuredOnly || undefined,
    activeOnly: false,
    sortBy,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(state.totalCount / PAGE_SIZE)),
    [state.totalCount],
  );
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const pageIds = state.attractions.map((a) => a.id);
  const allOnPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  // Build the set of unique types from the current result page for the filter.
  const knownTypes = useMemo(() => {
    const set = new Set<string>();
    for (const a of state.attractions) if (a.type) set.add(a.type);
    return Array.from(set).sort();
  }, [state.attractions]);

  function toggleAllOnPage(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) for (const id of pageIds) next.add(id);
      else for (const id of pageIds) next.delete(id);
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
    setType("all");
    setIndoorFilter("all");
    setKidFriendlyOnly(false);
    setFreeOnly(false);
    setFeaturedOnly(false);
    setSortBy("updated");
    setPage(0);
  }

  async function bulkUpdate(updates: Partial<Attraction>) {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase
        .from("attractions")
        .update(updates)
        .in("id", selectedIds);
      if (error) throw error;
      toast.success(
        `${selectedIds.length} attraction${selectedIds.length === 1 ? "" : "s"} updated`,
      );
      clearSelection();
      await state.refetch();
    } catch (error) {
      handleError(error, {
        component: "AttractionManager",
        action: "bulkUpdate",
      });
      toast.error("Bulk update failed. Check console for details.");
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
        .from("attractions")
        .update({ is_active: false })
        .in("id", selectedIds);
      if (error) throw error;
      toast.success(
        `${selectedIds.length} attraction${selectedIds.length === 1 ? "" : "s"} deactivated`,
      );
      clearSelection();
      setBulkConfirmDelete(false);
      await state.refetch();
    } catch (error) {
      handleError(error, {
        component: "AttractionManager",
        action: "bulkSoftDelete",
      });
      toast.error("Bulk deactivate failed. Check console for details.");
    } finally {
      setBusy(false);
    }
  }

  async function softDeleteOne(attraction: Attraction) {
    setBusy(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase
        .from("attractions")
        .update({ is_active: false })
        .eq("id", attraction.id);
      if (error) throw error;
      toast.success(`Deactivated ${attraction.name}`);
      setSoftDeleting(null);
      await state.refetch();
    } catch (error) {
      handleError(error, {
        component: "AttractionManager",
        action: "softDeleteOne",
      });
      toast.error("Deactivate failed.");
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
              <LandPlot className="h-5 w-5" />
              Attractions
            </CardTitle>
            <CardDescription>
              {state.totalCount.toLocaleString()} total · {selectedIds.length}{" "}
              selected
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setEditing(null)}>
            <Plus className="h-4 w-4 mr-1" />
            New attraction
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(0);
              }}
              placeholder="Search name, type, location…"
              className="pl-8"
            />
          </div>
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {knownTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={indoorFilter}
            onValueChange={(v: "all" | "indoor" | "outdoor") => {
              setIndoorFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Indoor/outdoor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any setting</SelectItem>
              <SelectItem value="indoor">Indoor only</SelectItem>
              <SelectItem value="outdoor">Outdoor only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v: SortKey) => setSortBy(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Most recently updated</SelectItem>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="alphabetical">Name (A–Z)</SelectItem>
              <SelectItem value="rating">Rating (high → low)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={kidFriendlyOnly}
              onCheckedChange={(c) => {
                setKidFriendlyOnly(Boolean(c));
                setPage(0);
              }}
            />
            <Baby className="h-3.5 w-3.5" />
            Kid-friendly
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={freeOnly}
              onCheckedChange={(c) => {
                setFreeOnly(Boolean(c));
                setPage(0);
              }}
            />
            <TicketCheck className="h-3.5 w-3.5" />
            Free admission
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={featuredOnly}
              onCheckedChange={(c) => {
                setFeaturedOnly(Boolean(c));
                setPage(0);
              }}
            />
            <Sun className="h-3.5 w-3.5" />
            Featured only
          </label>
          {(search ||
            type !== "all" ||
            indoorFilter !== "all" ||
            kidFriendlyOnly ||
            freeOnly ||
            featuredOnly) && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Reset filters
            </Button>
          )}
        </div>
      </CardHeader>

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
                onClick={() => bulkUpdate({ is_featured: true })}
              >
                Feature
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => bulkUpdate({ is_featured: false })}
              >
                Un-feature
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => bulkUpdate({ is_kid_friendly: true })}
              >
                <Baby className="h-3.5 w-3.5 mr-1" />
                Mark kid-friendly
              </Button>
              <AlertDialog
                open={bulkConfirmDelete}
                onOpenChange={setBulkConfirmDelete}
              >
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" disabled={busy}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Deactivate
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Deactivate attractions?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Set <code>is_active = false</code> on {selectedIds.length}{" "}
                      attraction{selectedIds.length === 1 ? "" : "s"}. Hidden
                      from the public list but preserved.
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
                <TableHead className="hidden md:table-cell">Location</TableHead>
                <TableHead className="hidden lg:table-cell">Hours</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead className="hidden xl:table-cell">Updated</TableHead>
                <TableHead className="w-12" aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    <TableCell colSpan={9}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : state.attractions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center text-sm text-muted-foreground py-12"
                  >
                    <LandPlot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No attractions match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                state.attractions.map((attraction) => {
                  const checked = selected.has(attraction.id);
                  return (
                    <TableRow
                      key={attraction.id}
                      className={cn(
                        "cursor-pointer",
                        checked && "bg-accent/40",
                      )}
                      onClick={() => setDetail(attraction)}
                    >
                      <TableCell
                        className="w-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) =>
                            toggleOne(attraction.id, Boolean(c))
                          }
                          aria-label={`Select ${attraction.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <AttractionImage
                          src={attraction.image_url}
                          alt={attraction.name}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{attraction.name}</div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {attraction.type ?? "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {attraction.location ?? "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs">
                        {attraction.hours_summary ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {attraction.is_featured && (
                            <Badge variant="default" className="text-[10px]">
                              Featured
                            </Badge>
                          )}
                          {attraction.is_indoor === true && (
                            <Badge variant="secondary" className="text-[10px]">
                              Indoor
                            </Badge>
                          )}
                          {attraction.is_indoor === false && (
                            <Badge variant="secondary" className="text-[10px]">
                              Outdoor
                            </Badge>
                          )}
                          {attraction.is_kid_friendly && (
                            <Badge variant="secondary" className="text-[10px]">
                              Kid-friendly
                            </Badge>
                          )}
                          {attraction.is_free && (
                            <Badge variant="secondary" className="text-[10px]">
                              Free
                            </Badge>
                          )}
                          {!attraction.is_active && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-amber-500 text-amber-600"
                            >
                              Inactive
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                        {attraction.updated_at
                          ? new Date(attraction.updated_at).toLocaleDateString()
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
                              aria-label={`Actions for ${attraction.name}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setEditing(attraction)}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDetail(attraction)}
                            >
                              Quick view
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={!attraction.is_active}
                              onClick={() => setSoftDeleting(attraction)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Deactivate
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="text-muted-foreground">
            Page {page + 1} of {totalPages}
            {state.totalCount > 0 && (
              <span className="ml-2">
                · {state.totalCount.toLocaleString()} total
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || state.isLoading}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
              disabled={page + 1 >= totalPages || state.isLoading}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>

      <AttractionDetailSheet
        attraction={detail}
        open={detail !== null}
        onOpenChange={(open) => !open && setDetail(null)}
      />

      <AttractionEditDialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        attraction={editing ?? null}
        onSaved={() => {
          state.refetch();
        }}
      />

      <AlertDialog
        open={softDeleting !== null}
        onOpenChange={(open) => !open && setSoftDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate attraction?</AlertDialogTitle>
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
