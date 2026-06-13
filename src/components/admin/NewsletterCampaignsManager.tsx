import { useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Eye,
  Loader2,
  Mail,
  Pause,
  Play,
  Plus,
  Send,
  Sparkles,
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
import { SecurityUtils } from "@/lib/securityUtils";
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
  opens: number;
  clicks: number;
  bounces: number;
  complaints: number;
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

  // WEB-AUTO-008: automated weekly digest controls (pause flag + preview).
  const [digestPaused, setDigestPaused] = useState<boolean | null>(null);
  const [digestBusy, setDigestBusy] = useState(false);
  const [digestPreviewOpen, setDigestPreviewOpen] = useState(false);
  const [digestPreviewLoading, setDigestPreviewLoading] = useState(false);
  const [digestPreview, setDigestPreview] = useState<{
    subject: string;
    body_html: string;
    recipient_count: number;
    gates_passed: boolean;
    gate_reasons: string[];
    counts: { events: number; restaurants: number; article: number };
  } | null>(null);

  async function loadDigestSetting() {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("settings")
        .eq("setting_type", "weekly_digest")
        .maybeSingle();
      if (error) throw error;
      setDigestPaused(
        Boolean((data?.settings as { paused?: boolean } | null)?.paused),
      );
    } catch (err) {
      handleError(err, {
        component: "NewsletterCampaignsManager",
        action: "loadDigestSetting",
      });
    }
  }

  async function toggleDigestPause() {
    const next = !digestPaused;
    setDigestBusy(true);
    try {
      const { error } = await supabase
        .from("system_settings")
        .update({ settings: { paused: next }, updated_at: new Date().toISOString() })
        .eq("setting_type", "weekly_digest");
      if (error) throw error;
      setDigestPaused(next);
      toast.success(next ? "Weekly digest paused" : "Weekly digest resumed");
    } catch (err) {
      handleError(err, {
        component: "NewsletterCampaignsManager",
        action: "toggleDigestPause",
      });
      toast.error("Failed to update digest setting");
    } finally {
      setDigestBusy(false);
    }
  }

  async function previewDigest() {
    setDigestPreviewOpen(true);
    setDigestPreviewLoading(true);
    setDigestPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        subject: string;
        body_html: string;
        recipient_count: number;
        gates_passed: boolean;
        gate_reasons: string[];
        counts: { events: number; restaurants: number; article: number };
      }>("assemble-weekly-digest", { body: { action: "preview" } });
      if (error) throw error;
      if (data?.ok) {
        setDigestPreview({
          subject: data.subject,
          body_html: data.body_html,
          recipient_count: data.recipient_count,
          gates_passed: data.gates_passed,
          gate_reasons: data.gate_reasons ?? [],
          counts: data.counts,
        });
      } else {
        toast.error("Failed to build digest preview");
      }
    } catch (err) {
      handleError(err, {
        component: "NewsletterCampaignsManager",
        action: "previewDigest",
      });
      toast.error("Failed to build digest preview");
    } finally {
      setDigestPreviewLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("newsletter_campaigns")
        .select(
          "id, subject, preheader, status, scheduled_for, sent_at, recipient_count, delivered, failed, opens, clicks, bounces, complaints, error_message, created_at",
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
    loadDigestSetting();
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
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-purple-500" />
                Automated weekly digest
              </CardTitle>
              <CardDescription>
                Assembles top events, trending restaurants &amp; the newest
                article every Tuesday and sends itself — no touch required.
                {digestPaused === true && (
                  <span className="ml-1 font-medium text-amber-600">
                    Currently paused.
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={previewDigest}
                disabled={digestPreviewLoading}
              >
                {digestPreviewLoading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4 mr-1" />
                )}
                Preview next
              </Button>
              <Button
                size="sm"
                variant={digestPaused ? "default" : "outline"}
                onClick={toggleDigestPause}
                disabled={digestBusy || digestPaused === null}
              >
                {digestBusy ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : digestPaused ? (
                  <Play className="h-4 w-4 mr-1" />
                ) : (
                  <Pause className="h-4 w-4 mr-1" />
                )}
                {digestPaused ? "Resume" : "Pause"}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

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
                <TableHead className="hidden lg:table-cell text-right">
                  Opens
                </TableHead>
                <TableHead className="hidden lg:table-cell text-right">
                  Clicks
                </TableHead>
                <TableHead className="hidden xl:table-cell text-right">
                  Bounce %
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
                    colSpan={9}
                    className="text-center text-sm text-muted-foreground py-12"
                  >
                    <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No newsletter campaigns yet. Compose one above.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const bouncePct = r.recipient_count > 0
                    ? (r.bounces / r.recipient_count) * 100
                    : 0;
                  return (
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
                    <TableCell className="hidden lg:table-cell text-right text-sm tabular-nums">
                      {r.opens.toLocaleString()}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right text-sm tabular-nums">
                      {r.clicks.toLocaleString()}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-right text-sm tabular-nums">
                      {r.recipient_count > 0 ? (
                        <span
                          className={
                            bouncePct > 5 ? "text-amber-600 font-medium" : ""
                          }
                        >
                          {bouncePct.toFixed(1)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-right text-sm tabular-nums">
                      {r.failed > 0 ? (
                        <span className="text-red-600">{r.failed}</span>
                      ) : (
                        r.failed
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })
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
                  // Sanitize even admin-authored HTML before rendering — defense
                  // in depth against stored XSS / pasted content (PROD-SEC-008).
                  dangerouslySetInnerHTML={{
                    __html: SecurityUtils.sanitizeRichHTML(body || "<em>(empty body)</em>"),
                  }}
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

      <Dialog
        open={digestPreviewOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDigestPreviewOpen(false);
            setDigestPreview(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Next weekly digest preview</DialogTitle>
            <DialogDescription>
              Assembled live from current content. This is exactly what will be
              queued on the next run — nothing is sent from here.
            </DialogDescription>
          </DialogHeader>

          {digestPreviewLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Assembling…
            </div>
          ) : digestPreview ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {digestPreview.gates_passed ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-green-500 text-green-600"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Pre-send gates passed
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="gap-1 border-red-500 text-red-600"
                  >
                    <XCircle className="h-3 w-3" />
                    Gates failed — would not send
                  </Badge>
                )}
                <span className="text-muted-foreground">
                  {digestPreview.recipient_count.toLocaleString()} recipients ·{" "}
                  {digestPreview.counts.events} events ·{" "}
                  {digestPreview.counts.restaurants} restaurants ·{" "}
                  {digestPreview.counts.article} article
                </span>
              </div>
              {!digestPreview.gates_passed &&
                digestPreview.gate_reasons.length > 0 && (
                  <ul className="text-xs text-red-600 list-disc pl-5">
                    {digestPreview.gate_reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              <div>
                <div className="text-xs text-muted-foreground mb-1">Subject</div>
                <div className="font-semibold mb-3">{digestPreview.subject}</div>
              </div>
              {/* Digest HTML is system-generated (escapeHtml'd in the edge fn),
                  but sanitize before rendering as defense in depth. */}
              <div
                className="rounded-md border p-2 bg-background"
                dangerouslySetInnerHTML={{
                  __html: SecurityUtils.sanitizeRichHTML(digestPreview.body_html),
                }}
              />
            </div>
          ) : (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No preview available.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
