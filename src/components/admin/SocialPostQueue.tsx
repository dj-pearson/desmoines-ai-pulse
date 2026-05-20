import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { handleError } from "@/lib/errorHandler";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Post = Database["public"]["Tables"]["social_media_posts"]["Row"];

const PAGE_SIZE = 50;

type StatusFilter = "all" | "draft" | "posted" | "failed" | "canceled";
type PlatformFilter = "all" | "twitter_threads" | "facebook_linkedin" | "combined";

function statusTone(status: string | null, errorMessage: string | null) {
  if (errorMessage) return "failed";
  if (!status) return "draft";
  return status;
}

function StatusBadge({ post }: { post: Post }) {
  const tone = statusTone(post.status, post.error_message);
  if (tone === "posted")
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 border-green-500 text-green-600"
      >
        <CheckCircle2 className="h-3 w-3" />
        Sent
      </Badge>
    );
  if (tone === "failed")
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 border-red-500 text-red-600"
      >
        <XCircle className="h-3 w-3" />
        Failed
      </Badge>
    );
  if (tone === "canceled")
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        Canceled
      </Badge>
    );
  if (tone === "draft")
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 border-amber-500 text-amber-600"
      >
        <CalendarClock className="h-3 w-3" />
        Scheduled
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[10px]">
      {tone}
    </Badge>
  );
}

function ContentTypeLink({ post }: { post: Post }) {
  if (!post.content_type || post.content_type === "general") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (!post.content_id) {
    return <span>{post.content_type}</span>;
  }
  const target =
    post.content_type === "event"
      ? `/events/${post.content_id}`
      : post.content_type === "restaurant"
        ? `/restaurants/${post.content_id}`
        : null;
  if (!target) return <span>{post.content_type}</span>;
  return (
    <Link
      to={target}
      className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
      target="_blank"
      rel="noreferrer"
    >
      {post.content_type}
      <ExternalLink className="h-3 w-3" />
    </Link>
  );
}

export default function SocialPostQueue() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [cancelTarget, setCancelTarget] = useState<Post | null>(null);
  const [reschedTarget, setReschedTarget] = useState<Post | null>(null);
  const [reschedAt, setReschedAt] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      let q = supabase
        .from("social_media_posts")
        .select(
          "id, content_type, content_id, content_url, platform_type, post_content, post_title, posted_at, scheduled_for, status, subject_type, webhook_urls, ai_prompt_used, metadata, error_message, last_attempt_at, created_at, updated_at, created_by",
          { count: "exact" },
        );

      if (statusFilter === "failed") {
        q = q.not("error_message", "is", null);
      } else if (statusFilter !== "all") {
        q = q.eq("status", statusFilter);
      }
      if (platformFilter !== "all") {
        q = q.eq("platform_type", platformFilter);
      }

      // Newest first.
      q = q
        .order("scheduled_for", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { data, error, count } = await q;
      if (error) throw error;
      setPosts(data ?? []);
      setTotalCount(count ?? 0);
    } catch (err) {
      handleError(err, {
        component: "SocialPostQueue",
        action: "load",
      });
      toast.error("Failed to load post queue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, platformFilter, page]);

  // Realtime: refresh when any row in social_media_posts changes.
  useEffect(() => {
    const channel = supabase
      .channel("social_post_queue_admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "social_media_posts" },
        () => {
          load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, platformFilter, page]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [totalCount],
  );

  async function cancelPost(post: Post) {
    setBusyId(post.id);
    try {
      const { error } = await supabase
        .from("social_media_posts")
        .update({ status: "canceled" })
        .eq("id", post.id);
      if (error) throw error;
      toast.success("Post canceled");
      setCancelTarget(null);
      await load();
    } catch (err) {
      handleError(err, {
        component: "SocialPostQueue",
        action: "cancelPost",
      });
      toast.error("Cancel failed");
    } finally {
      setBusyId(null);
    }
  }

  async function reschedulePost() {
    if (!reschedTarget || !reschedAt) return;
    setBusyId(reschedTarget.id);
    try {
      const iso = new Date(reschedAt).toISOString();
      const { error } = await supabase
        .from("social_media_posts")
        .update({ scheduled_for: iso, status: "draft" })
        .eq("id", reschedTarget.id);
      if (error) throw error;
      toast.success("Rescheduled");
      setReschedTarget(null);
      setReschedAt("");
      await load();
    } catch (err) {
      handleError(err, {
        component: "SocialPostQueue",
        action: "reschedulePost",
      });
      toast.error("Reschedule failed");
    } finally {
      setBusyId(null);
    }
  }

  async function retryFailed(post: Post) {
    setBusyId(post.id);
    try {
      // Clear the error and bounce the row back to draft. The cron-driven
      // social-media-manager picks up drafts on its next run.
      const { error } = await supabase
        .from("social_media_posts")
        .update({
          status: "draft",
          error_message: null,
          scheduled_for: post.scheduled_for ?? new Date().toISOString(),
        })
        .eq("id", post.id);
      if (error) throw error;
      toast.success("Re-queued for next send");
      await load();
    } catch (err) {
      handleError(err, {
        component: "SocialPostQueue",
        action: "retryFailed",
      });
      toast.error("Retry failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" />
              Social post queue
            </CardTitle>
            <CardDescription>
              {totalCount.toLocaleString()} posts · realtime updates from
              social_media_posts
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5 mr-1",
                loading && "animate-spin",
              )}
            />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
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
              <SelectItem value="draft">Scheduled (draft)</SelectItem>
              <SelectItem value="posted">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="canceled">Canceled</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={platformFilter}
            onValueChange={(v: PlatformFilter) => {
              setPlatformFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All platforms</SelectItem>
              <SelectItem value="twitter_threads">Twitter / Threads</SelectItem>
              <SelectItem value="facebook_linkedin">
                Facebook / LinkedIn
              </SelectItem>
              <SelectItem value="combined">Combined</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scheduled / sent</TableHead>
                <TableHead className="hidden md:table-cell">Platform</TableHead>
                <TableHead>Content</TableHead>
                <TableHead className="hidden lg:table-cell">Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32" aria-label="Actions" />
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
              ) : posts.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-sm text-muted-foreground py-12"
                  >
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No posts match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                posts.map((p) => {
                  const tone = statusTone(p.status, p.error_message);
                  const when =
                    p.posted_at ?? p.scheduled_for ?? p.created_at;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" />
                          {when
                            ? new Date(when).toLocaleString()
                            : "—"}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs">
                        <Badge variant="secondary" className="text-[10px]">
                          {p.platform_type.replace("_", " / ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="text-sm truncate">
                          {p.post_title ?? "(no title)"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {p.post_content?.slice(0, 80)}
                        </div>
                        {p.error_message && (
                          <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate" title={p.error_message}>
                              {p.error_message}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <ContentTypeLink post={p} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge post={p} />
                      </TableCell>
                      <TableCell className="w-32">
                        <div className="flex flex-wrap gap-1 justify-end">
                          {tone === "failed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === p.id}
                              onClick={() => retryFailed(p)}
                            >
                              {busyId === p.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                          {tone === "draft" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyId === p.id}
                                onClick={() => {
                                  setReschedTarget(p);
                                  setReschedAt(
                                    p.scheduled_for
                                      ? new Date(p.scheduled_for)
                                          .toISOString()
                                          .slice(0, 16)
                                      : "",
                                  );
                                }}
                              >
                                <CalendarClock className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive"
                                disabled={busyId === p.id}
                                onClick={() => setCancelTarget(p)}
                              >
                                <XCircle className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {p.content_url && tone === "posted" && (
                            <a
                              href={p.content_url}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              <Button size="sm" variant="outline">
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </a>
                          )}
                        </div>
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
            Page {page + 1} of {totalPages} · {totalCount.toLocaleString()}{" "}
            total
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
              disabled={page + 1 >= totalPages || loading}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>

      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel scheduled post?</AlertDialogTitle>
            <AlertDialogDescription>
              Sets status to "canceled". The row is preserved for audit but
              will not be sent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep scheduled</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelTarget && cancelPost(cancelTarget)}
              disabled={busyId !== null}
            >
              Cancel post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={reschedTarget !== null}
        onOpenChange={(open) => !open && setReschedTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reschedule post</DialogTitle>
            <DialogDescription>
              Choose a new send time. The status is reset to draft.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="resched-at">New time</Label>
            <Input
              id="resched-at"
              type="datetime-local"
              value={reschedAt}
              onChange={(e) => setReschedAt(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReschedTarget(null)}
              disabled={busyId !== null}
            >
              Cancel
            </Button>
            <Button
              onClick={reschedulePost}
              disabled={!reschedAt || busyId !== null}
            >
              Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
