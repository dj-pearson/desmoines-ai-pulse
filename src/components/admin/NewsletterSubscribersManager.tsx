import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Mail,
  Search,
  UserMinus,
  UserPlus,
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
import { Input } from "@/components/ui/input";
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
import { useDebounce } from "@/hooks/useDebounce";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface NewsletterSubscriber {
  id: string;
  email: string;
  first_name: string | null;
  source: string | null;
  status: "active" | "unsubscribed" | "bounced";
  subscribed_at: string;
  unsubscribed_at: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

type StatusFilter = "all" | "active" | "unsubscribed" | "bounced";
const PAGE_SIZE = 50;

function StatusBadge({ status }: { status: NewsletterSubscriber["status"] }) {
  if (status === "active")
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 border-green-500 text-green-600"
      >
        Active
      </Badge>
    );
  if (status === "bounced")
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 border-red-500 text-red-600"
      >
        <AlertCircle className="h-3 w-3" />
        Bounced
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      Unsubscribed
    </Badge>
  );
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(rows: NewsletterSubscriber[]) {
  const header = [
    "email",
    "first_name",
    "status",
    "source",
    "subscribed_at",
    "unsubscribed_at",
    "utm_source",
    "utm_medium",
    "utm_campaign",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        escapeCsv(r.email),
        escapeCsv(r.first_name),
        escapeCsv(r.status),
        escapeCsv(r.source),
        escapeCsv(r.subscribed_at),
        escapeCsv(r.unsubscribed_at),
        escapeCsv(r.utm_source),
        escapeCsv(r.utm_medium),
        escapeCsv(r.utm_campaign),
      ].join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function NewsletterSubscribersManager() {
  const [rows, setRows] = useState<NewsletterSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 300);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkUnsub, setBulkUnsub] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      let q = supabase
        .from("newsletter_subscribers")
        .select(
          "id, email, first_name, source, status, subscribed_at, unsubscribed_at, utm_source, utm_medium, utm_campaign",
          { count: "exact" },
        );
      if (search) q = q.ilike("email", `%${search}%`);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (sourceFilter !== "all") q = q.eq("source", sourceFilter);
      q = q
        .order("subscribed_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { data, error, count } = await q;
      if (error) throw error;
      setRows((data ?? []) as unknown as NewsletterSubscriber[]);
      setTotalCount(count ?? 0);
    } catch (err) {
      handleError(err, {
        component: "NewsletterSubscribersManager",
        action: "load",
      });
      toast.error("Failed to load subscribers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, sourceFilter, page]);

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

  async function setStatus(
    ids: string[],
    next: NewsletterSubscriber["status"],
  ) {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const patch: Record<string, unknown> = { status: next };
      if (next === "unsubscribed") {
        patch.unsubscribed_at = new Date().toISOString();
      } else if (next === "active") {
        patch.unsubscribed_at = null;
      }
      const { error } = await supabase
        .from("newsletter_subscribers")
        .update(patch)
        .in("id", ids);
      if (error) throw error;

      // Audit trail
      const { data: user } = await supabase.auth.getUser();
      await supabase
        .from("security_audit_logs")
        .insert(
          ids.map((id) => ({
            event_type: "admin_action",
            identifier: user.user?.email ?? "admin",
            severity: "low",
            action: `newsletter:${next}`,
            resource: `newsletter_subscribers:${id}`,
            user_id: user.user?.id ?? null,
            details: { count: ids.length },
          })),
        );

      toast.success(
        `${ids.length} subscriber${ids.length === 1 ? "" : "s"} → ${next}`,
      );
      setSelected(new Set());
      setBulkUnsub(false);
      await load();
    } catch (err) {
      handleError(err, {
        component: "NewsletterSubscribersManager",
        action: "setStatus",
      });
      toast.error("Status update failed");
    } finally {
      setBusy(false);
    }
  }

  async function exportFilteredCsv() {
    setBusy(true);
    try {
      let q = supabase
        .from("newsletter_subscribers")
        .select(
          "id, email, first_name, source, status, subscribed_at, unsubscribed_at, utm_source, utm_medium, utm_campaign",
        )
        .limit(10000); // hard cap
      if (search) q = q.ilike("email", `%${search}%`);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (sourceFilter !== "all") q = q.eq("source", sourceFilter);
      const { data, error } = await q;
      if (error) throw error;
      downloadCsv((data ?? []) as unknown as NewsletterSubscriber[]);
      toast.success(`Exported ${data?.length ?? 0} rows`);
    } catch (err) {
      handleError(err, {
        component: "NewsletterSubscribersManager",
        action: "exportFilteredCsv",
      });
      toast.error("Export failed");
    } finally {
      setBusy(false);
    }
  }

  function exportSelectedCsv() {
    const subset = rows.filter((r) => selected.has(r.id));
    downloadCsv(subset);
    toast.success(`Exported ${subset.length} selected rows`);
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5" />
              Newsletter subscribers
            </CardTitle>
            <CardDescription>
              {totalCount.toLocaleString()} matching · {selectedIds.length}{" "}
              selected
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={exportFilteredCsv}
            disabled={busy || loading}
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            Export filtered CSV
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(0);
              }}
              placeholder="Search email…"
              className="pl-8"
            />
          </div>
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
              <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
              <SelectItem value="bounced">Bounced</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={sourceFilter}
            onValueChange={(v) => {
              setSourceFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="website">Website</SelectItem>
              <SelectItem value="popup">Popup</SelectItem>
              <SelectItem value="footer">Footer</SelectItem>
              <SelectItem value="checkout">Checkout</SelectItem>
              <SelectItem value="hero">Hero</SelectItem>
            </SelectContent>
          </Select>
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
                onClick={exportSelectedCsv}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Export
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => setBulkUnsub(true)}
              >
                <UserMinus className="h-3.5 w-3.5 mr-1" />
                Unsubscribe
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
                <TableHead>Email</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell">Source</TableHead>
                <TableHead className="hidden lg:table-cell">UTM</TableHead>
                <TableHead className="hidden xl:table-cell">Subscribed</TableHead>
                <TableHead className="w-24" aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground py-12"
                  >
                    <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No subscribers match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const checked = selected.has(r.id);
                  return (
                    <TableRow
                      key={r.id}
                      className={cn(checked && "bg-accent/40")}
                    >
                      <TableCell className="w-10">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) => toggleOne(r.id, Boolean(c))}
                          aria-label={`Select ${r.email}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium truncate max-w-[280px]">
                          {r.email}
                        </div>
                        {r.first_name && (
                          <div className="text-xs text-muted-foreground">
                            {r.first_name}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs">
                        {r.source ?? "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {r.utm_source
                          ? `${r.utm_source}${r.utm_campaign ? ` / ${r.utm_campaign}` : ""}`
                          : "—"}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                        {r.subscribed_at
                          ? new Date(r.subscribed_at).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell className="w-24 text-right">
                        {r.status === "active" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setStatus([r.id], "unsubscribed")}
                            disabled={busy}
                            title="Unsubscribe"
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setStatus([r.id], "active")}
                            disabled={busy}
                            title="Re-subscribe"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                          </Button>
                        )}
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

      <AlertDialog open={bulkUnsub} onOpenChange={setBulkUnsub}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsubscribe selected?</AlertDialogTitle>
            <AlertDialogDescription>
              Sets status = "unsubscribed" on {selectedIds.length} row
              {selectedIds.length === 1 ? "" : "s"} and writes an audit log
              entry. Subscribers can opt back in via the website at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setStatus(selectedIds, "unsubscribed")}
              disabled={busy}
            >
              Unsubscribe
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
