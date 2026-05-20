import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Search,
  Tag,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useDebounce } from "@/hooks/useDebounce";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MoreVertical } from "lucide-react";

interface Deal {
  id: string;
  title: string;
  description: string | null;
  business_name: string;
  entity_type: string;
  entity_id: string | null;
  deal_type: string;
  discount_value: string | null;
  code: string | null;
  terms: string | null;
  start_date: string;
  end_date: string | null;
  image_url: string | null;
  is_verified: boolean;
  is_featured: boolean;
  redemption_count: number;
  created_at: string;
}

type StatusFilter = "all" | "active" | "upcoming" | "expired";
const ENTITY_TYPES = ["restaurant", "attraction", "hotel", "event", "activity"];
const DEAL_TYPES = ["percentage", "dollar_off", "bogo", "free_item", "package"];
const PAGE_SIZE = 25;

function statusOf(deal: Deal): "active" | "upcoming" | "expired" {
  const now = new Date();
  const start = new Date(deal.start_date);
  if (start > now) return "upcoming";
  if (deal.end_date && new Date(deal.end_date) < now) return "expired";
  return "active";
}

function StatusBadge({ deal }: { deal: Deal }) {
  const s = statusOf(deal);
  if (s === "active")
    return (
      <Badge
        variant="outline"
        className="text-[10px] border-green-500 text-green-600"
      >
        Active
      </Badge>
    );
  if (s === "upcoming")
    return (
      <Badge
        variant="outline"
        className="text-[10px] border-amber-500 text-amber-600"
      >
        Upcoming
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      Expired
    </Badge>
  );
}

interface FormState {
  id?: string;
  title: string;
  description: string;
  business_name: string;
  entity_type: string;
  deal_type: string;
  discount_value: string;
  code: string;
  terms: string;
  start_date: string;
  end_date: string;
  image_url: string;
  is_verified: boolean;
  is_featured: boolean;
}

function emptyForm(): FormState {
  const today = new Date().toISOString().slice(0, 16);
  return {
    title: "",
    description: "",
    business_name: "",
    entity_type: "restaurant",
    deal_type: "percentage",
    discount_value: "",
    code: "",
    terms: "",
    start_date: today,
    end_date: "",
    image_url: "",
    is_verified: false,
    is_featured: false,
  };
}

function fromDeal(d: Deal): FormState {
  return {
    id: d.id,
    title: d.title,
    description: d.description ?? "",
    business_name: d.business_name,
    entity_type: d.entity_type,
    deal_type: d.deal_type,
    discount_value: d.discount_value ?? "",
    code: d.code ?? "",
    terms: d.terms ?? "",
    start_date: d.start_date
      ? new Date(d.start_date).toISOString().slice(0, 16)
      : "",
    end_date: d.end_date
      ? new Date(d.end_date).toISOString().slice(0, 16)
      : "",
    image_url: d.image_url ?? "",
    is_verified: d.is_verified,
    is_featured: d.is_featured,
  };
}

export default function DealManager() {
  const [rows, setRows] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 300);
  const [entity, setEntity] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dealTypeFilter, setDealTypeFilter] = useState<string>("all");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<FormState | null>(null);
  const [deleting, setDeleting] = useState<Deal | null>(null);
  const [pruneOpen, setPruneOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      let q = supabase
        .from("deals")
        .select(
          "id, title, description, business_name, entity_type, entity_id, deal_type, discount_value, code, terms, start_date, end_date, image_url, is_verified, is_featured, redemption_count, created_at",
          { count: "exact" },
        );
      if (search) {
        q = q.or(
          `title.ilike.%${search}%,business_name.ilike.%${search}%,description.ilike.%${search}%`,
        );
      }
      if (entity !== "all") q = q.eq("entity_type", entity);
      if (dealTypeFilter !== "all") q = q.eq("deal_type", dealTypeFilter);
      if (featuredOnly) q = q.eq("is_featured", true);
      const nowIso = new Date().toISOString();
      if (statusFilter === "active") {
        q = q.lte("start_date", nowIso).or(
          `end_date.is.null,end_date.gt.${nowIso}`,
        );
      } else if (statusFilter === "upcoming") {
        q = q.gt("start_date", nowIso);
      } else if (statusFilter === "expired") {
        q = q.lt("end_date", nowIso).not("end_date", "is", null);
      }
      q = q
        .order("is_featured", { ascending: false })
        .order("start_date", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      setRows((data ?? []) as unknown as Deal[]);
      setTotalCount(count ?? 0);
    } catch (err) {
      handleError(err, { component: "DealManager", action: "load" });
      toast.error("Failed to load deals");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, entity, statusFilter, dealTypeFilter, featuredOnly, page]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [totalCount],
  );

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const pageIds = rows.map((r) => r.id);
  const allOnPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));

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

  async function bulkSet(updates: Partial<Deal>) {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("deals")
        .update(updates as never)
        .in("id", selectedIds);
      if (error) throw error;
      toast.success(`${selectedIds.length} deal${selectedIds.length === 1 ? "" : "s"} updated`);
      setSelected(new Set());
      await load();
    } catch (err) {
      handleError(err, { component: "DealManager", action: "bulkSet" });
      toast.error("Bulk update failed");
    } finally {
      setBusy(false);
    }
  }

  async function pruneExpired() {
    setBusy(true);
    try {
      const cutoff = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { error, count } = await supabase
        .from("deals")
        .delete({ count: "exact" })
        .lt("end_date", cutoff)
        .not("end_date", "is", null);
      if (error) throw error;
      toast.success(`Deleted ${count ?? 0} deals expired >30 days`);
      setPruneOpen(false);
      await load();
    } catch (err) {
      handleError(err, { component: "DealManager", action: "pruneExpired" });
      toast.error("Prune failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteOne(deal: Deal) {
    setBusy(true);
    try {
      const { error } = await supabase.from("deals").delete().eq("id", deal.id);
      if (error) throw error;
      toast.success(`Deleted ${deal.title}`);
      setDeleting(null);
      await load();
    } catch (err) {
      handleError(err, { component: "DealManager", action: "deleteOne" });
      toast.error("Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveForm(form: FormState) {
    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        business_name: form.business_name.trim(),
        entity_type: form.entity_type,
        deal_type: form.deal_type,
        discount_value: form.discount_value.trim() || null,
        code: form.code.trim() || null,
        terms: form.terms.trim() || null,
        start_date: form.start_date
          ? new Date(form.start_date).toISOString()
          : new Date().toISOString(),
        end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
        image_url: form.image_url.trim() || null,
        is_verified: form.is_verified,
        is_featured: form.is_featured,
      };
      if (form.id) {
        const { error } = await supabase
          .from("deals")
          .update(payload as never)
          .eq("id", form.id);
        if (error) throw error;
        toast.success("Deal updated");
      } else {
        const { error } = await supabase.from("deals").insert(payload as never);
        if (error) throw error;
        toast.success("Deal created");
      }
      setEditing(null);
      await load();
    } catch (err) {
      handleError(err, { component: "DealManager", action: "saveForm" });
      toast.error("Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Tag className="h-5 w-5" />
              Deals & promotions
            </CardTitle>
            <CardDescription>
              {totalCount.toLocaleString()} total · {selectedIds.length}{" "}
              selected
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPruneOpen(true)}
              disabled={busy}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Prune expired &gt;30d
            </Button>
            <Button size="sm" onClick={() => setEditing(emptyForm())}>
              <Plus className="h-4 w-4 mr-1" />
              New deal
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mt-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(0);
              }}
              placeholder="Search title, business…"
              className="pl-8"
            />
          </div>
          <Select
            value={entity}
            onValueChange={(v) => {
              setEntity(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Entity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entities</SelectItem>
              {ENTITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v: StatusFilter) => {
              setStatusFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={dealTypeFilter}
            onValueChange={(v) => {
              setDealTypeFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Deal type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All deal types</SelectItem>
              {DEAL_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={featuredOnly}
              onCheckedChange={(c) => {
                setFeaturedOnly(Boolean(c));
                setPage(0);
              }}
            />
            Featured only
          </label>
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
                onClick={() => bulkSet({ is_featured: true })}
              >
                Feature
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => bulkSet({ is_featured: false })}
              >
                Un-feature
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => bulkSet({ is_verified: true })}
              >
                Verify
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setSelected(new Set())}
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
                <TableHead>Title</TableHead>
                <TableHead className="hidden md:table-cell">Business</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell">Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Ends</TableHead>
                <TableHead className="w-12" aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-sm text-muted-foreground py-12"
                  >
                    <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No deals match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((d) => {
                  const checked = selected.has(d.id);
                  return (
                    <TableRow
                      key={d.id}
                      className={cn(checked && "bg-accent/40")}
                    >
                      <TableCell className="w-10">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) => toggleOne(d.id, Boolean(c))}
                          aria-label={`Select ${d.title}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium truncate max-w-[260px]">
                          {d.title}
                        </div>
                        <div className="flex gap-1 mt-1">
                          {d.is_featured && (
                            <Badge variant="default" className="text-[10px]">
                              Featured
                            </Badge>
                          )}
                          {d.is_verified && (
                            <Badge variant="secondary" className="text-[10px]">
                              Verified
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {d.business_name}
                        <div className="text-xs text-muted-foreground">
                          {d.entity_type}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs">
                        <Badge variant="secondary" className="text-[10px]">
                          {d.deal_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        {d.discount_value ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge deal={d} />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {d.end_date
                          ? new Date(d.end_date).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell className="w-12">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              aria-label={`Actions for ${d.title}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setEditing(fromDeal(d))}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleting(d)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
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
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
              disabled={page + 1 >= totalPages || loading}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Edit / create dialog */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? `Edit deal · ${editing.title}` : "New deal"}
            </DialogTitle>
            <DialogDescription>
              Public deals show on the Deals page while between start and end
              dates. Code is optional; if provided, users see it next to the
              redemption details.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <Label htmlFor="d-title">Title *</Label>
                  <Input
                    id="d-title"
                    value={editing.title}
                    onChange={(e) =>
                      setEditing({ ...editing, title: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="d-biz">Business name *</Label>
                  <Input
                    id="d-biz"
                    value={editing.business_name}
                    onChange={(e) =>
                      setEditing({ ...editing, business_name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Entity type</Label>
                  <Select
                    value={editing.entity_type}
                    onValueChange={(v) =>
                      setEditing({ ...editing, entity_type: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTITY_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Deal type</Label>
                  <Select
                    value={editing.deal_type}
                    onValueChange={(v) =>
                      setEditing({ ...editing, deal_type: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEAL_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="d-val">Discount value</Label>
                  <Input
                    id="d-val"
                    placeholder="20%, $5, BOGO pint…"
                    value={editing.discount_value}
                    onChange={(e) =>
                      setEditing({ ...editing, discount_value: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="d-code">Promo code (optional)</Label>
                  <Input
                    id="d-code"
                    value={editing.code}
                    onChange={(e) =>
                      setEditing({ ...editing, code: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="d-start">Starts *</Label>
                  <Input
                    id="d-start"
                    type="datetime-local"
                    value={editing.start_date}
                    onChange={(e) =>
                      setEditing({ ...editing, start_date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="d-end">Ends</Label>
                  <Input
                    id="d-end"
                    type="datetime-local"
                    value={editing.end_date}
                    onChange={(e) =>
                      setEditing({ ...editing, end_date: e.target.value })
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="d-img">Image URL</Label>
                  <Input
                    id="d-img"
                    value={editing.image_url}
                    onChange={(e) =>
                      setEditing({ ...editing, image_url: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="d-desc">Description</Label>
                <Textarea
                  id="d-desc"
                  rows={3}
                  value={editing.description}
                  onChange={(e) =>
                    setEditing({ ...editing, description: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="d-terms">Terms & conditions</Label>
                <Textarea
                  id="d-terms"
                  rows={2}
                  placeholder="Valid Tuesday-Thursday. One per customer."
                  value={editing.terms}
                  onChange={(e) =>
                    setEditing({ ...editing, terms: e.target.value })
                  }
                />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={editing.is_verified}
                    onCheckedChange={(c) =>
                      setEditing({ ...editing, is_verified: Boolean(c) })
                    }
                  />
                  Verified
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={editing.is_featured}
                    onCheckedChange={(c) =>
                      setEditing({ ...editing, is_featured: Boolean(c) })
                    }
                  />
                  Featured
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              onClick={() => editing && saveForm(editing)}
              disabled={busy || !editing?.title || !editing?.business_name}
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              {editing?.id ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete deal?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `Permanently delete "${deleting.title}"? This cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteOne(deleting)}
              disabled={busy}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pruneOpen} onOpenChange={setPruneOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Prune deals expired &gt;30 days?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete every deal whose end_date is more than 30
              days in the past. Useful for periodic cleanup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={pruneExpired} disabled={busy}>
              Prune
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
