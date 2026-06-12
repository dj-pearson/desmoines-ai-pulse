import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Inbox,
  Search,
  XCircle,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { useDebounce } from "@/hooks/useDebounce";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Submission {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  location: string | null;
  address: string | null;
  price: string | null;
  category: string | null;
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  image_url: string | null;
  tags: string[] | null;
  status: "pending" | "approved" | "rejected" | "needs_revision";
  admin_notes: string | null;
  admin_reviewed_by: string | null;
  admin_reviewed_at: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
  // WEB-AUTO-002 AI triage
  quality_score: number | null;
  triage_reasons: string[] | null;
  auto_decided: boolean | null;
}

type StatusFilter =
  | "all"
  | "pending"
  | "approved"
  | "rejected"
  | "needs_revision";
const PAGE_SIZE = 25;

const REJECT_TEMPLATES = [
  "Duplicate of an existing event already on the site.",
  "Insufficient detail — please re-submit with venue, time, and description.",
  "Outside our coverage area.",
  "Not appropriate for general audiences.",
  "Date has already passed.",
];

const INFO_TEMPLATES = [
  "Can you share the full street address?",
  "Can you confirm the start and end times?",
  "Do you have an image we can use?",
  "Can you provide a website or registration link?",
];

function StatusBadge({ status }: { status: Submission["status"] }) {
  const map: Record<
    Submission["status"],
    { label: string; className: string; Icon: typeof CheckCircle2 }
  > = {
    pending: {
      label: "Pending",
      className: "border-blue-500 text-blue-600",
      Icon: Inbox,
    },
    approved: {
      label: "Approved",
      className: "border-green-500 text-green-600",
      Icon: CheckCircle2,
    },
    rejected: {
      label: "Rejected",
      className: "text-muted-foreground",
      Icon: XCircle,
    },
    needs_revision: {
      label: "Needs info",
      className: "border-amber-500 text-amber-600",
      Icon: HelpCircle,
    },
  };
  const e = map[status];
  const Icon = e.Icon;
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] gap-1", e.className)}
    >
      <Icon className="h-3 w-3" />
      {e.label}
    </Badge>
  );
}

export default function EventSubmissionsManager() {
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 300);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Submission | null>(null);
  const [bulkAction, setBulkAction] = useState<
    null | "approve" | "reject" | "request_info"
  >(null);
  const [bulkMessage, setBulkMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      let q = supabase
        .from("user_submitted_events")
        .select("*", { count: "exact" });
      if (search) {
        q = q.or(
          `title.ilike.%${search}%,venue.ilike.%${search}%,description.ilike.%${search}%,location.ilike.%${search}%`,
        );
      }
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      // Pending queue: surface the AI-scored ambiguous middle highest-first.
      if (statusFilter === "pending") {
        q = q.order("quality_score", { ascending: false, nullsFirst: false });
      }
      q = q
        .order("submitted_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      setRows((data ?? []) as unknown as Submission[]);
      setTotalCount(count ?? 0);
    } catch (err) {
      handleError(err, {
        component: "EventSubmissionsManager",
        action: "load",
      });
      toast.error("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, page]);

  // Realtime — new submissions appear immediately.
  useEffect(() => {
    const channel = supabase
      .channel("event_submissions_admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_submitted_events" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, page]);

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
    next: Submission["status"],
    notes?: string,
  ) {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const patch: Record<string, unknown> = {
        status: next,
        admin_reviewed_by: user.user?.id ?? null,
        admin_reviewed_at: new Date().toISOString(),
      };
      if (notes !== undefined) patch.admin_notes = notes;

      const { error } = await supabase
        .from("user_submitted_events")
        .update(patch as never)
        .in("id", ids);
      if (error) throw error;

      await supabase
        .from("security_audit_logs")
        .insert(
          ids.map((id) => ({
            event_type: "admin_action",
            identifier: user.user?.email ?? "admin",
            severity: "low",
            action: `event_submission:${next}`,
            resource: `user_submitted_events:${id}`,
            user_id: user.user?.id ?? null,
            details: { notes: notes ?? null },
          })),
        );

      toast.success(
        `${ids.length} submission${ids.length === 1 ? "" : "s"} → ${next}`,
      );
      setSelected(new Set());
      setBulkAction(null);
      setBulkMessage("");
      await load();
    } catch (err) {
      handleError(err, {
        component: "EventSubmissionsManager",
        action: "setStatus",
      });
      toast.error("Update failed");
    } finally {
      setBusy(false);
    }
  }

  function openDetail(s: Submission) {
    setDetail(s);
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5" />
            Event submission queue
          </CardTitle>
          <CardDescription>
            {totalCount.toLocaleString()} matching · {selectedIds.length}{" "}
            selected · realtime updates
          </CardDescription>
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
              placeholder="Search title, venue, description…"
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
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="needs_revision">Needs info</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
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
                onClick={() => setBulkAction("approve")}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setBulkAction("request_info")}
              >
                <HelpCircle className="h-3.5 w-3.5 mr-1" />
                Request info
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => setBulkAction("reject")}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Reject
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
                <TableHead>Event</TableHead>
                <TableHead className="hidden md:table-cell">When</TableHead>
                <TableHead className="hidden lg:table-cell">Venue</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden xl:table-cell">Submitted</TableHead>
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
                    <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No submissions match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((s) => {
                  const checked = selected.has(s.id);
                  return (
                    <TableRow
                      key={s.id}
                      className={cn(
                        "cursor-pointer",
                        checked && "bg-accent/40",
                      )}
                      onClick={() => openDetail(s)}
                    >
                      <TableCell
                        className="w-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) => toggleOne(s.id, Boolean(c))}
                          aria-label={`Select ${s.title}`}
                        />
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="font-medium truncate flex items-center gap-2">
                          {s.title}
                          {typeof s.quality_score === "number" && (
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                s.quality_score >= 85
                                  ? "bg-green-100 text-green-700"
                                  : s.quality_score >= 50
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-red-100 text-red-700"
                              }`}
                              title={(s.triage_reasons ?? []).join(" · ") || "AI quality score"}
                            >
                              AI {s.quality_score}
                            </span>
                          )}
                          {s.auto_decided && (
                            <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground" title="Decided automatically by AI triage">
                              auto
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {s.description?.slice(0, 80)}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {s.date
                          ? new Date(s.date).toLocaleDateString()
                          : "—"}
                        {s.start_time && (
                          <div>{s.start_time}</div>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs">
                        {s.venue ?? "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs">
                        {s.category ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={s.status} />
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                        {new Date(s.submitted_at).toLocaleString()}
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

      {/* Detail Sheet */}
      <Sheet
        open={detail !== null}
        onOpenChange={(open) => !open && setDetail(null)}
      >
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {detail && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {detail.title}
                </SheetTitle>
                <SheetDescription>
                  Submitted {new Date(detail.submitted_at).toLocaleString()}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <StatusBadge status={detail.status} />
                </div>

                {detail.image_url && (
                  <img
                    src={detail.image_url}
                    alt={detail.title}
                    className="w-full aspect-video object-cover rounded-md"
                  />
                )}

                <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <dt className="text-muted-foreground">Date</dt>
                  <dd>
                    {detail.date
                      ? new Date(detail.date).toLocaleDateString()
                      : "—"}
                  </dd>
                  <dt className="text-muted-foreground">Time</dt>
                  <dd>
                    {detail.start_time ?? "—"}
                    {detail.end_time && ` – ${detail.end_time}`}
                  </dd>
                  <dt className="text-muted-foreground">Venue</dt>
                  <dd>{detail.venue ?? "—"}</dd>
                  <dt className="text-muted-foreground">Address</dt>
                  <dd>{detail.address ?? detail.location ?? "—"}</dd>
                  <dt className="text-muted-foreground">Category</dt>
                  <dd>{detail.category ?? "—"}</dd>
                  <dt className="text-muted-foreground">Price</dt>
                  <dd>{detail.price ?? "—"}</dd>
                </dl>

                {detail.description && (
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Description
                    </Label>
                    <div className="mt-1 rounded-md border p-3 whitespace-pre-line">
                      {detail.description}
                    </div>
                  </div>
                )}

                <div className="text-xs space-y-1">
                  {detail.contact_email && (
                    <div>
                      Contact:{" "}
                      <a
                        href={`mailto:${detail.contact_email}`}
                        className="text-primary hover:underline"
                      >
                        {detail.contact_email}
                      </a>
                    </div>
                  )}
                  {detail.website_url && (
                    <div>
                      Website:{" "}
                      <a
                        href={detail.website_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {detail.website_url}
                      </a>
                    </div>
                  )}
                </div>

                {detail.admin_notes && (
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Admin notes
                    </Label>
                    <div className="mt-1 rounded-md border p-3 whitespace-pre-line">
                      {detail.admin_notes}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button
                    size="sm"
                    onClick={() => setStatus([detail.id], "approved")}
                    disabled={busy || detail.status === "approved"}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setBulkAction("request_info");
                      setSelected(new Set([detail.id]));
                    }}
                    disabled={busy}
                  >
                    <HelpCircle className="h-3.5 w-3.5 mr-1" />
                    Request info
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setBulkAction("reject");
                      setSelected(new Set([detail.id]));
                    }}
                    disabled={busy || detail.status === "rejected"}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Reject
                  </Button>
                </div>
              </div>

              <SheetFooter className="mt-6">
                <SheetClose asChild>
                  <Button variant="outline">Close</Button>
                </SheetClose>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Bulk approve confirm */}
      <AlertDialog
        open={bulkAction === "approve"}
        onOpenChange={(open) => !open && setBulkAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve {selectedIds.length} submission{selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sets status to approved and stamps the reviewer. Approved
              submissions show in the user's dashboard; promote them to
              live events from the existing /admin/content workflow.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setStatus(selectedIds, "approved")}
              disabled={busy}
            >
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk reject + request-info dialog (uses a Dialog so we can template-pick) */}
      <Dialog
        open={bulkAction === "reject" || bulkAction === "request_info"}
        onOpenChange={(open) => {
          if (!open) {
            setBulkAction(null);
            setBulkMessage("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {bulkAction === "reject"
                ? `Reject ${selectedIds.length} submission${selectedIds.length === 1 ? "" : "s"}`
                : `Request more info on ${selectedIds.length} submission${selectedIds.length === 1 ? "" : "s"}`}
            </DialogTitle>
            <DialogDescription>
              Notes are saved on each submission. Submitters see them in
              their dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Quick templates
            </Label>
            <div className="flex flex-wrap gap-1">
              {(bulkAction === "reject" ? REJECT_TEMPLATES : INFO_TEMPLATES).map(
                (t) => (
                  <button
                    key={t}
                    type="button"
                    className="text-xs px-2 py-1 rounded border hover:bg-accent text-left"
                    onClick={() => setBulkMessage(t)}
                  >
                    {t.length > 40 ? `${t.slice(0, 40)}…` : t}
                  </button>
                ),
              )}
            </div>
            <Label htmlFor="bulk-notes">Notes</Label>
            <Textarea
              id="bulk-notes"
              rows={4}
              value={bulkMessage}
              onChange={(e) => setBulkMessage(e.target.value)}
              placeholder="Write a note to the submitter…"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBulkAction(null);
                setBulkMessage("");
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant={bulkAction === "reject" ? "destructive" : "default"}
              onClick={() =>
                setStatus(
                  selectedIds,
                  bulkAction === "reject" ? "rejected" : "needs_revision",
                  bulkMessage,
                )
              }
              disabled={busy || !bulkMessage.trim()}
            >
              {bulkAction === "reject" ? "Reject" : "Request info"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
