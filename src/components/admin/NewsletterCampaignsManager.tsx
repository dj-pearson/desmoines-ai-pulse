import { useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  Mail,
  Plus,
  Send,
  XCircle,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import { toast } from "sonner";

interface CampaignRow {
  id: string;
  subject: string;
  preheader: string | null;
  status: string;
  scheduled_for: string | null;
  sent_at: string | null;
  recipient_count: number;
  delivered: number;
  failed: number;
  error_message: string | null;
  created_at: string;
}

const SOURCE_OPTIONS = ["website", "popup", "footer", "checkout", "hero"];

function StatusBadge({ status }: { status: string }) {
  if (status === "sent")
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 border-green-500 text-green-600"
      >
        <CheckCircle2 className="h-3 w-3" />
        Sent
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 border-red-500 text-red-600"
      >
        <XCircle className="h-3 w-3" />
        Failed
      </Badge>
    );
  if (status === "scheduled")
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 border-amber-500 text-amber-600"
      >
        <CalendarClock className="h-3 w-3" />
        Scheduled
      </Badge>
    );
  if (status === "sending")
    return (
      <Badge variant="outline" className="text-[10px] gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Sending
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[10px]">
      {status}
    </Badge>
  );
}

export default function NewsletterCampaignsManager() {
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [body, setBody] = useState("");
  const [sourcesAll, setSourcesAll] = useState(true);
  const [sourcesSelected, setSourcesSelected] = useState<Set<string>>(
    new Set(SOURCE_OPTIONS),
  );
  const [scheduledAt, setScheduledAt] = useState("");
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("newsletter_campaigns")
        .select(
          "id, subject, preheader, status, scheduled_for, sent_at, recipient_count, delivered, failed, error_message, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setRows((data ?? []) as unknown as CampaignRow[]);
    } catch (err) {
      handleError(err, {
        component: "NewsletterCampaignsManager",
        action: "load",
      });
      toast.error("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setSubject("");
    setPreheader("");
    setBody("");
    setSourcesAll(true);
    setSourcesSelected(new Set(SOURCE_OPTIONS));
    setScheduledAt("");
    setRecipientCount(null);
  }

  function buildSegment() {
    if (sourcesAll) return {};
    return { sources: Array.from(sourcesSelected) };
  }

  async function refreshRecipientCount() {
    setPreviewLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        count: number;
      }>("send-newsletter-campaign", {
        body: { action: "preview_count", segment: buildSegment() },
      });
      if (error) throw error;
      setRecipientCount(data?.count ?? 0);
    } catch (err) {
      handleError(err, {
        component: "NewsletterCampaignsManager",
        action: "refreshRecipientCount",
      });
      toast.error("Failed to estimate recipients");
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    if (composing) {
      refreshRecipientCount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composing, sourcesAll, sourcesSelected]);

  async function sendTest() {
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and body are required");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        sent_to?: string;
        error?: string;
      }>("send-newsletter-campaign", {
        body: {
          action: "send_test",
          subject,
          preheader: preheader || undefined,
          body_html: body,
        },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success(`Test sent to ${data.sent_to}`);
      } else {
        toast.error(data?.error ?? "Test send failed");
      }
    } catch (err) {
      handleError(err, {
        component: "NewsletterCampaignsManager",
        action: "sendTest",
      });
      toast.error("Test send failed");
    } finally {
      setBusy(false);
    }
  }

  async function send(action: "send_now" | "schedule") {
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and body are required");
      return;
    }
    if (action === "schedule" && !scheduledAt) {
      toast.error("Pick a scheduled time");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        delivered?: number;
        failed?: number;
        recipient_count?: number;
      }>("send-newsletter-campaign", {
        body: {
          action,
          subject,
          preheader: preheader || undefined,
          body_html: body,
          segment: buildSegment(),
          scheduled_for:
            action === "schedule"
              ? new Date(scheduledAt).toISOString()
              : undefined,
        },
      });
      if (error) throw error;
      if (action === "send_now" && data?.ok) {
        toast.success(
          `Delivered ${data.delivered ?? 0} of ${data.recipient_count ?? 0}; ${data.failed ?? 0} failed`,
        );
      } else if (action === "schedule") {
        toast.success("Campaign scheduled");
      }
      setComposing(false);
      resetForm();
      await load();
    } catch (err) {
      handleError(err, {
        component: "NewsletterCampaignsManager",
        action: `send:${action}`,
      });
      toast.error("Send failed. Check console.");
    } finally {
      setBusy(false);
    }
  }

  function toggleSource(s: string, on: boolean) {
    setSourcesSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(s);
      else next.delete(s);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5" />
              Newsletter campaigns
            </CardTitle>
            <CardDescription>
              {rows.length} recent campaign{rows.length === 1 ? "" : "s"}
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setComposing(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New campaign
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell">Sent / scheduled</TableHead>
                <TableHead className="hidden lg:table-cell text-right">
                  Recipients
                </TableHead>
                <TableHead className="hidden lg:table-cell text-right">
                  Delivered
                </TableHead>
                <TableHead className="hidden xl:table-cell text-right">
                  Failed
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
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
                    <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No newsletter campaigns yet. Compose one above.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium truncate max-w-[280px]">
                        {r.subject}
                      </div>
                      {r.preheader && (
                        <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                          {r.preheader}
                        </div>
                      )}
                      {r.error_message && (
                        <div
                          className="text-[10px] text-red-600 mt-1 truncate max-w-[280px]"
                          title={r.error_message}
                        >
                          {r.error_message}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {r.sent_at
                        ? new Date(r.sent_at).toLocaleString()
                        : r.scheduled_for
                          ? new Date(r.scheduled_for).toLocaleString()
                          : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right text-sm tabular-nums">
                      {r.recipient_count.toLocaleString()}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right text-sm tabular-nums">
                      {r.delivered.toLocaleString()}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-right text-sm tabular-nums">
                      {r.failed > 0 ? (
                        <span className="text-red-600">{r.failed}</span>
                      ) : (
                        r.failed
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog
        open={composing}
        onOpenChange={(open) => {
          if (!open) {
            setComposing(false);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New newsletter campaign</DialogTitle>
            <DialogDescription>
              Compose, preview, and dispatch via Resend. Test sends go only
              to your own email.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="compose">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="compose">Compose</TabsTrigger>
              <TabsTrigger value="audience">Audience</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>

            <TabsContent value="compose" className="space-y-3 mt-4">
              <div>
                <Label htmlFor="nc-subject">Subject</Label>
                <Input
                  id="nc-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="What's on this week in Des Moines"
                />
              </div>
              <div>
                <Label htmlFor="nc-preheader">Preheader</Label>
                <Input
                  id="nc-preheader"
                  value={preheader}
                  onChange={(e) => setPreheader(e.target.value)}
                  placeholder="Shown in the inbox under the subject line"
                />
              </div>
              <div>
                <Label htmlFor="nc-body">Body (HTML)</Label>
                <Textarea
                  id="nc-body"
                  rows={14}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="font-mono text-xs"
                  placeholder="<h1>This week</h1>\n<p>Hello from Des Moines…</p>"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Paste HTML or paste plain text and wrap it in &lt;p&gt;
                  tags. CAN-SPAM footer is appended automatically by the
                  email layout helper.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="audience" className="space-y-3 mt-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={sourcesAll}
                  onCheckedChange={(c) => setSourcesAll(Boolean(c))}
                />
                All active subscribers (no source filter)
              </label>
              {!sourcesAll && (
                <div className="border rounded-md p-3 space-y-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Sources
                  </div>
                  {SOURCE_OPTIONS.map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={sourcesSelected.has(s)}
                        onCheckedChange={(c) => toggleSource(s, Boolean(c))}
                      />
                      {s}
                    </label>
                  ))}
                </div>
              )}
              <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
                Estimated recipients:{" "}
                <span className="font-semibold tabular-nums">
                  {previewLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin inline" />
                  ) : (
                    (recipientCount ?? 0).toLocaleString()
                  )}
                </span>
              </div>
              <div>
                <Label htmlFor="nc-sched">Schedule (optional)</Label>
                <Input
                  id="nc-sched"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave blank to send now.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="mt-4">
              <div className="rounded-md border p-4 bg-background">
                <div className="text-xs text-muted-foreground mb-1">
                  Subject
                </div>
                <div className="font-semibold mb-2">{subject || "(empty)"}</div>
                {preheader && (
                  <div className="text-xs text-muted-foreground mb-3 italic">
                    {preheader}
                  </div>
                )}
                <div
                  className="prose prose-sm dark:prose-invert max-w-none border-t pt-3"
                  // body is admin-authored HTML; admins are trusted
                  dangerouslySetInnerHTML={{ __html: body || "<em>(empty body)</em>" }}
                />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setComposing(false);
                resetForm();
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={sendTest}
              disabled={busy || !subject || !body}
            >
              <Send className="h-3.5 w-3.5 mr-1" />
              Send test
            </Button>
            {scheduledAt ? (
              <Button onClick={() => send("schedule")} disabled={busy}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                <CalendarClock className="h-3.5 w-3.5 mr-1" />
                Schedule
              </Button>
            ) : (
              <Button onClick={() => send("send_now")} disabled={busy}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                Send now ({(recipientCount ?? 0).toLocaleString()})
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
