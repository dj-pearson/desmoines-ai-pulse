import { useState } from "react";
import { ArrowLeft, Loader2, Sparkles, StickyNote, GitMerge, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useConsoleTickets,
  useTicketThread,
  useCannedResponses,
  useSuggestReply,
  useConsoleAction,
  type ConsoleTicket,
} from "@/hooks/useSupportConsole";
import { useAuth } from "@/contexts/AuthContext";
import { handleError } from "@/lib/errorHandler";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUSES = ["new", "ai_handling", "awaiting_user", "escalated", "assigned", "resolved", "closed"];

function TicketList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [status, setStatus] = useState<string>("");
  const { data: tickets, isLoading, isError } = useConsoleTickets(status ? { status } : {});

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger aria-label="Filter by status"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 p-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : isError ? (
          <p className="p-4 text-sm text-muted-foreground">Couldn't load tickets.</p>
        ) : !tickets || tickets.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No tickets match.</p>
        ) : (
          tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={cn("w-full border-b p-3 text-left hover:bg-muted/50", selectedId === t.id && "bg-muted")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{t.subject ?? "(no subject)"}</span>
                {t.priority && <Badge variant="outline" className="shrink-0">{t.priority}</Badge>}
              </div>
              <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{t.body}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{t.status}</span>
                {t.csat_score != null && <span>· CSAT {t.csat_score}★</span>}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function TicketDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, isLoading, isError } = useTicketThread(id);
  const { data: canned } = useCannedResponses();
  const suggest = useSuggestReply();
  const action = useConsoleAction();
  const { user } = useAuth();
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [mergeInto, setMergeInto] = useState("");

  async function run(body: Record<string, unknown>, ok: string) {
    try {
      await action.mutateAsync({ ...body, actorId: user?.id });
      toast.success(ok);
    } catch (e) {
      handleError(e, { component: "SupportConsole", action: String(body.action) });
      toast.error("Action failed.");
    }
  }

  async function onSuggest() {
    try {
      const res = await suggest.mutateAsync(id);
      setReply(res.draft || "");
      if (!res.draft) toast.info("No suggestion available.");
    } catch (e) {
      handleError(e, { component: "SupportConsole", action: "suggest" });
      toast.error("Couldn't generate a suggestion.");
    }
  }

  if (isLoading) return <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (isError || !data) return <p className="p-4 text-sm text-muted-foreground">Couldn't load the ticket.</p>;

  const { ticket, messages, context } = data;
  const sub = (context.subscription ?? null) as { status?: string; plan?: { name?: string; tier?: string } } | null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onBack} aria-label="Back to list">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{ticket.subject ?? "(no subject)"}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{ticket.status}</Badge>
            {ticket.priority && <span>{ticket.priority}</span>}
            {ticket.sentiment && <span>· {ticket.sentiment}</span>}
            <span>· {ticket.channel}</span>
          </div>
        </div>
      </div>

      {/* User context */}
      <div className="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {context.authenticated ? (
          <span>
            Subscriber: {sub?.plan?.tier ?? sub?.plan?.name ?? "free"} ({sub?.status ?? "none"}) ·{" "}
            {String(context.favorites ?? 0)} favorites · {String(context.reviews ?? 0)} reviews
          </span>
        ) : (
          <span>Unauthenticated submitter</span>
        )}
      </div>

      {/* Thread */}
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.map((m) => {
          const internal = !!(m.metadata && (m.metadata as { internal?: boolean }).internal);
          return (
            <div key={m.id} className={cn("rounded-md border p-2 text-sm", m.sender === "user" ? "bg-background" : internal ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "bg-muted/50")}>
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">{internal ? "internal note" : m.sender}</span>
                <span>· {new Date(m.created_at).toLocaleString()}</span>
              </div>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="space-y-2 border-t p-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onSuggest} disabled={suggest.isPending}>
            {suggest.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            AI suggest
          </Button>
          {canned && canned.length > 0 && (
            <Select onValueChange={(v) => { const c = canned.find((x) => x.id === v); if (c) setReply((r) => (r ? r + "\n\n" : "") + c.body); }}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Insert canned…" /></SelectTrigger>
              <SelectContent>{canned.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
        <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} placeholder="Type a reply (editable AI/canned text)…" />
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={async () => { if (!reply.trim()) return; await run({ action: "send_reply", id, body: reply, status: "awaiting_user" }, "Reply sent."); setReply(""); }}
            disabled={action.isPending || !reply.trim()}
          >
            Send reply
          </Button>
          <Button
            variant="outline"
            onClick={async () => { if (!reply.trim()) return; await run({ action: "send_reply", id, body: reply, status: "resolved" }, "Sent & resolved."); setReply(""); }}
            disabled={action.isPending || !reply.trim()}
          >
            Send &amp; resolve
          </Button>
          <Button variant="outline" onClick={() => run({ action: "assign", id, assignedTo: user?.id }, "Assigned to you.")} disabled={action.isPending}>
            <UserCheck className="mr-2 h-4 w-4" /> Assign to me
          </Button>
        </div>

        {/* Internal note + merge */}
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <div className="flex-1">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note (not shown to user)" />
          </div>
          <Button variant="ghost" size="sm" onClick={async () => { if (!note.trim()) return; await run({ action: "add_note", id, body: note }, "Note added."); setNote(""); }} disabled={action.isPending || !note.trim()}>
            <StickyNote className="mr-2 h-4 w-4" /> Add note
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <Input value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} placeholder="Merge into ticket id (canonical)" />
          </div>
          <Button variant="ghost" size="sm" onClick={() => mergeInto.trim() && run({ action: "merge", id, into: mergeInto.trim() }, "Ticket merged.")} disabled={action.isPending || !mergeInto.trim()}>
            <GitMerge className="mr-2 h-4 w-4" /> Merge duplicate
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SupportConsole() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b">
        <CardTitle className="text-lg">Support console</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid h-[75vh] grid-cols-1 lg:grid-cols-[340px_1fr]">
          <div className={cn("border-r", selected && "hidden lg:block")}>
            <TicketList selectedId={selected} onSelect={setSelected} />
          </div>
          <div className={cn(!selected && "hidden lg:flex")}>
            {selected ? (
              <TicketDetail id={selected} onBack={() => setSelected(null)} />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-6 text-sm text-muted-foreground">
                Select a ticket to view the thread.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
