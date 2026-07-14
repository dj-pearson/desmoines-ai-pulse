import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Mail,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { SecurityUtils } from "@/lib/securityUtils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Submission {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  inquiry_type: string;
  source_page: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  admin_notes: string | null;
  responded_at: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

type StatusFilter =
  | "all"
  | "new"
  | "read"
  | "in_progress"
  | "responded"
  | "closed"
  | "spam";
type PriorityFilter = "all" | "low" | "normal" | "high" | "urgent";
type InquiryFilter =
  | "all"
  | "general"
  | "support"
  | "feedback"
  | "business"
  | "advertising"
  | "partnership"
  | "other";

const STATUS_OPTIONS: StatusFilter[] = [
  "new",
  "read",
  "in_progress",
  "responded",
  "closed",
  "spam",
];

const PRIORITY_OPTIONS: PriorityFilter[] = ["low", "normal", "high", "urgent"];

const PAGE_SIZE = 50;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    new: {
      label: "New",
      className: "border-blue-500 text-blue-600",
    },
    read: { label: "Read", className: "text-muted-foreground" },
    in_progress: {
      label: "In progress",
      className: "border-amber-500 text-amber-600",
    },
    responded: {
      label: "Responded",
      className: "border-green-500 text-green-600",
    },
    closed: { label: "Closed", className: "text-muted-foreground" },
    spam: { label: "Spam", className: "border-red-500 text-red-600" },
  };
  const e = map[status] ?? { label: status, className: "" };
  return (
    <Badge variant="outline" className={cn("text-[10px]", e.className)}>
      {e.label}
    </Badge>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "urgent")
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 border-red-500 text-red-600"
      >
        <AlertCircle className="h-3 w-3" />
        Urgent
      </Badge>
    );
  if (priority === "high")
    return (
      <Badge
        variant="outline"
        className="text-[10px] border-amber-500 text-amber-600"
      >
        High
      </Badge>
    );
  if (priority === "low")
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        Low
      </Badge>
    );
  return null;
}

export default function FeedbackInbox() {
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 300);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [inquiryFilter, setInquiryFilter] = useState<InquiryFilter>("all");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [detail, setDetail] = useState<Submission | null>(null);
  const [detailNotes, setDetailNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // FEEDBACK-REPLY-001: reply thread state.
  interface ReplyRow {
    id: string;
    direction: "admin_to_user" | "user_to_admin";
    body_html: string;
    sent_by: string | null;
    sent_at: string;
  }
  const [replies, setReplies] = useState<ReplyRow[]>([]);
  const [replyBody, setReplyBody] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  async function load() {
    setLoading(true);
    try {
      let q = supabase
        .from("contact_submissions")
        .select(
          "id, name, email, phone, subject, message, inquiry_type, source_page, status, priority, assigned_to, admin_notes, responded_at, user_id, created_at, updated_at",
          { count: "exact" },
        );
      if (search) {
        q = q.or(
          `name.ilike.%${search}%,email.ilike.%${search}%,subject.ilike.%${search}%,message.ilike.%${search}%`,
        );
      }
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (priorityFilter !== "all") q = q.eq("priority", priorityFilter);
      if (inquiryFilter !== "all") q = q.eq("inquiry_type", inquiryFilter);

      q = q
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { data, error, count } = await q;
      if (error) throw error;
      setRows((data ?? []) as unknown as Submission[]);
      setTotalCount(count ?? 0);
    } catch (err) {
      handleError(err, { component: "FeedbackInbox", action: "load" });
      toast.error("Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, priorityFilter, inquiryFilter, page]);

  // Realtime — refresh on insert/update so new submissions surface immediately.
  useEffect(() => {
    const channel = supabase
      .channel("feedback_inbox_admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contact_submissions" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, priorityFilter, inquiryFilter, page]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [totalCount],
  );

  function openDetail(s: Submission) {
    setDetail(s);
    setDetailNotes(s.admin_notes ?? "");
    setReplyBody("");
    setReplies([]);
    loadReplies(s.id);
    // Auto-mark as read when opened (if currently "new").
    if (s.status === "new") {
      supabase
        .from("contact_submissions")
        .update({ status: "read" })
        .eq("id", s.id)
        .then(() => load());
    }
  }

  async function loadReplies(submissionId: string) {
    try {
      const { data, error } = await supabase
        .from("feedback_replies")
        .select("id, direction, body_html, sent_by, sent_at")
        .eq("submission_id", submissionId)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      setReplies((data ?? []) as unknown as ReplyRow[]);
    } catch (err) {
      handleError(err, {
        component: "FeedbackInbox",
        action: "loadReplies",
      });
    }
  }

  async function sendReply() {
    if (!detail || !replyBody.trim()) return;
    setSendingReply(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        message_id?: string | null;
        error?: string;
      }>("notifications/send-feedback-reply", {
        body: { submission_id: detail.id, body_html: replyBody },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Send failed");
      toast.success(`Reply sent to ${detail.email}`);
      setReplyBody("");
      await loadReplies(detail.id);
      await load();
      // Refresh detail's local copy so the responded badge appears.
      setDetail({
        ...detail,
        status: "responded",
        responded_at: detail.responded_at ?? new Date().toISOString(),
      });
    } catch (err) {
      handleError(err, {
        component: "FeedbackInbox",
        action: "sendReply",
      });
      toast.error("Reply failed. Check console.");
    } finally {
      setSendingReply(false);
    }
  }

  async function updateDetail(updates: Partial<Submission>) {
    if (!detail) return;
    setBusy(true);
    try {
      const patch: Record<string, unknown> = { ...updates };
      if (updates.status === "responded" && !detail.responded_at) {
        patch.responded_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("contact_submissions")
        .update(patch as never)
        .eq("id", detail.id);
      if (error) throw error;
      toast.success("Updated");
      const next = { ...detail, ...updates } as Submission;
      setDetail(next);
      await load();
    } catch (err) {
      handleError(err, {
        component: "FeedbackInbox",
        action: "updateDetail",
      });
      toast.error("Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes() {
    if (!detail) return;
    await updateDetail({ admin_notes: detailNotes });
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Inbox className="h-5 w-5" />
              Feedback & support inbox
            </CardTitle>
            <CardDescription>
              {totalCount.toLocaleString()} submissions · realtime updates
            </CardDescription>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(0);
              }}
              placeholder="Search name, email, message…"
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
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={priorityFilter}
            onValueChange={(v: PriorityFilter) => {
              setPriorityFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any priority</SelectItem>
              {PRIORITY_OPTIONS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={inquiryFilter}
            onValueChange={(v: InquiryFilter) => {
              setInquiryFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="general">general</SelectItem>
              <SelectItem value="support">support</SelectItem>
              <SelectItem value="feedback">feedback</SelectItem>
              <SelectItem value="business">business</SelectItem>
              <SelectItem value="advertising">advertising</SelectItem>
              <SelectItem value="partnership">partnership</SelectItem>
              <SelectItem value="other">other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>Subject / message</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Priority</TableHead>
                <TableHead className="hidden lg:table-cell">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-sm text-muted-foreground py-12"
                  >
                    <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No submissions match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((s) => (
                  <TableRow
                    key={s.id}
                    className={cn(
                      "cursor-pointer",
                      s.status === "new" && "font-medium",
                    )}
                    onClick={() => openDetail(s)}
                  >
                    <TableCell>
                      <div className="truncate max-w-[180px]">{s.name}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {s.email}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="truncate">
                        {s.subject ?? "(no subject)"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {s.message?.slice(0, 80)}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs">
                      <Badge variant="secondary" className="text-[10px]">
                        {s.inquiry_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <PriorityBadge priority={s.priority} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
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

      <Sheet
        open={detail !== null}
        onOpenChange={(open) => !open && setDetail(null)}
      >
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {detail && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  {detail.subject ?? "(no subject)"}
                </SheetTitle>
                <SheetDescription>
                  From {detail.name} ({detail.email}){" "}
                  {detail.phone && `· ${detail.phone}`}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 mt-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-[160px]">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Status
                    </Label>
                    <Select
                      value={detail.status}
                      onValueChange={(v) => updateDetail({ status: v })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[160px]">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Priority
                    </Label>
                    <Select
                      value={detail.priority}
                      onValueChange={(v) => updateDetail({ priority: v })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[160px]">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Type
                    </Label>
                    <div className="mt-2 text-sm">{detail.inquiry_type}</div>
                  </div>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Message
                  </Label>
                  <div className="mt-1 rounded-md border p-3 text-sm whitespace-pre-line">
                    {detail.message}
                  </div>
                </div>

                {detail.source_page && (
                  <div className="text-xs text-muted-foreground">
                    Submitted from{" "}
                    <code className="font-mono">{detail.source_page}</code>
                  </div>
                )}

                {/* FEEDBACK-REPLY-001: thread + composer */}
                <div className="border-t pt-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Conversation ({replies.length})
                  </Label>
                  <div className="mt-2 space-y-2">
                    {replies.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic">
                        No replies yet.
                      </div>
                    ) : (
                      replies.map((r) => (
                        <div
                          key={r.id}
                          className={cn(
                            "rounded-md border p-3",
                            r.direction === "admin_to_user"
                              ? "bg-primary/5 border-primary/20"
                              : "bg-muted",
                          )}
                        >
                          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                            <span>
                              {r.direction === "admin_to_user"
                                ? "Admin → User"
                                : "User → Admin"}
                            </span>
                            <span>
                              {new Date(r.sent_at).toLocaleString()}
                            </span>
                          </div>
                          <div
                            className="text-sm prose prose-sm dark:prose-invert max-w-none"
                            // body_html holds BOTH admin replies and user→admin
                            // messages, so sanitize before render (PROD-SEC-008).
                            dangerouslySetInnerHTML={{
                              __html: SecurityUtils.sanitizeRichHTML(r.body_html),
                            }}
                          />
                        </div>
                      ))
                    )}
                  </div>
                  <div className="mt-3 space-y-2">
                    <Label
                      htmlFor="fb-reply"
                      className="text-xs uppercase tracking-wide text-muted-foreground"
                    >
                      Reply via email
                    </Label>
                    <Textarea
                      id="fb-reply"
                      rows={5}
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="Write a reply. Plain text or HTML — sent through Resend, recorded on the thread, and flips status to responded."
                    />
                    <Button
                      size="sm"
                      onClick={sendReply}
                      disabled={sendingReply || !replyBody.trim()}
                    >
                      {sendingReply ? "Sending…" : `Send to ${detail.email}`}
                    </Button>
                  </div>
                </div>

                <div>
                  <Label
                    htmlFor="fb-notes"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    Admin notes
                  </Label>
                  <Textarea
                    id="fb-notes"
                    rows={4}
                    value={detailNotes}
                    onChange={(e) => setDetailNotes(e.target.value)}
                    placeholder="Internal context — never shown to the user."
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={saveNotes}
                    disabled={busy}
                  >
                    Save notes
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
                  <div>Submitted {new Date(detail.created_at).toLocaleString()}</div>
                  {detail.responded_at && (
                    <div>
                      Responded {new Date(detail.responded_at).toLocaleString()}
                    </div>
                  )}
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
    </Card>
  );
}
