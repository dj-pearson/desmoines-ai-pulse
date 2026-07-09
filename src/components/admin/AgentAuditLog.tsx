import { useState } from "react";
import { AlertTriangle, FileClock, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAgentAuditLog, useAuditAgentKeys, type AgentAuditEntry, type AuditFilters } from "@/hooks/useAgentAudit";

function EntryDetail({ entry }: { entry: AgentAuditEntry }) {
  return (
    <SheetContent className="w-full overflow-y-auto sm:max-w-xl" aria-label={`Audit entry: ${entry.action_type}`}>
      <SheetHeader>
        <SheetTitle className="pr-6">{entry.action_type}</SheetTitle>
        <SheetDescription>
          {entry.agent_key} · {new Date(entry.created_at).toLocaleString()}
        </SheetDescription>
      </SheetHeader>
      <div className="mt-4 space-y-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">actor: {entry.actor}</Badge>
          {entry.target_ref && <Badge variant="outline">target: {entry.target_ref}</Badge>}
          {entry.run_id && <Badge variant="outline">run: {entry.run_id.slice(0, 8)}</Badge>}
        </div>
        <div>
          <h3 className="mb-1 font-medium">Before</h3>
          <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs">
            {entry.before ? JSON.stringify(entry.before, null, 2) : "—"}
          </pre>
        </div>
        <div>
          <h3 className="mb-1 font-medium">After</h3>
          <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs">
            {entry.after ? JSON.stringify(entry.after, null, 2) : "—"}
          </pre>
        </div>
      </div>
    </SheetContent>
  );
}

export default function AgentAuditLog() {
  const [filters, setFilters] = useState<AuditFilters>({ agentKey: "all", action: "", since: "" });
  const [selected, setSelected] = useState<AgentAuditEntry | null>(null);
  const { data: entries, isLoading, isError, refetch, isFetching } = useAgentAuditLog(filters);
  const { data: agentKeys } = useAuditAgentKeys();

  function setFilter<K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" /> Agent audit trail
            </CardTitle>
            <CardDescription>Immutable, append-only record of every state-changing agent action.</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => refetch()} aria-label="Refresh audit log">
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <Label htmlFor="audit-agent" className="text-xs">Agent</Label>
            <Select value={String(filters.agentKey)} onValueChange={(v) => setFilter("agentKey", v)}>
              <SelectTrigger id="audit-agent" className="min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {(agentKeys ?? []).map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="audit-action" className="text-xs">Action contains</Label>
            <Input
              id="audit-action"
              className="min-h-[44px]"
              value={filters.action}
              onChange={(e) => setFilter("action", e.target.value)}
              placeholder="e.g. create_task, tool:, execute_"
            />
          </div>
          <div>
            <Label htmlFor="audit-since" className="text-xs">Since</Label>
            <Input
              id="audit-since"
              type="date"
              className="min-h-[44px]"
              value={filters.since}
              onChange={(e) => setFilter("since", e.target.value)}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading audit log">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <p className="text-muted-foreground">Couldn't load the audit log.</p>
            <Button variant="outline" className="min-h-[44px]" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : (entries ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <FileClock className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">No audit entries</p>
            <p className="text-sm text-muted-foreground">Nothing matches these filters yet.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {(entries ?? []).map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setSelected(e)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 py-3 text-left hover:bg-muted/50"
                  aria-label={`Open audit entry ${e.action_type}`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{e.action_type}</span>
                      <Badge variant="outline">{e.agent_key}</Badge>
                      {e.shadow && <Badge variant="secondary" title="Shadow-mode proposal (not executed)">shadow</Badge>}
                      {e.target_ref && <span className="truncate text-xs text-muted-foreground">{e.target_ref}</span>}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        {selected && <EntryDetail entry={selected} />}
      </Sheet>
    </Card>
  );
}
