import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ExternalLink,
  HandCoins,
  LayoutGrid,
  Loader2,
  Mail,
  Phone,
  Search,
  Table as TableIcon,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useDebounce } from "@/hooks/useDebounce";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { handleError } from "@/lib/errorHandler";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Application = Database["public"]["Tables"]["partnership_applications"]["Row"];

const STAGES = [
  { value: "pending", label: "Lead" },
  { value: "in_review", label: "Qualified" },
  { value: "approved", label: "Signed" },
  { value: "rejected", label: "Lost" },
] as const;

const TIER_OPTIONS = [
  "starter",
  "professional",
  "premium",
  "enterprise",
] as const;

function StageBadge({ status }: { status: string | null }) {
  const stage = STAGES.find((s) => s.value === status);
  const label = stage?.label ?? status ?? "pending";
  const tone: Record<string, string> = {
    pending: "border-blue-500 text-blue-600",
    in_review: "border-amber-500 text-amber-600",
    approved: "border-green-500 text-green-600",
    rejected: "text-muted-foreground",
  };
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px]", tone[status ?? "pending"] ?? "")}
    >
      {label}
    </Badge>
  );
}

function AppCardBody({ app }: { app: Application }) {
  return (
    <div className="space-y-1">
      <div className="font-medium truncate">{app.business_name}</div>
      <div className="text-xs text-muted-foreground truncate">
        {app.business_type}
        {app.desired_tier && (
          <>
            {" · "}
            <span className="capitalize">{app.desired_tier}</span>
          </>
        )}
      </div>
      <div className="text-xs text-muted-foreground truncate">
        {app.contact_email}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {new Date(app.created_at).toLocaleDateString()}
      </div>
    </div>
  );
}

function DraggableAppCard({
  app,
  onOpen,
}: {
  app: Application;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: app.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        // Don't intercept dnd-kit's space/enter pickup; only fire onOpen
        // when the card isn't currently being grabbed.
        if (!isDragging && (e.key === "Enter")) {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "text-left w-full rounded-md border bg-card hover:bg-accent/40 transition-colors p-3 cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
    >
      <AppCardBody app={app} />
    </div>
  );
}

function DroppableColumn({
  stageKey,
  children,
}: {
  stageKey: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${stageKey}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "space-y-2 min-h-24 rounded-md p-1 transition-colors",
        isOver && "bg-accent/40 ring-2 ring-primary/40",
      )}
    >
      {children}
    </div>
  );
}

export default function PartnershipsManager() {
  const [rows, setRows] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 300);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [view, setView] = useState<"list" | "kanban">("kanban");
  const [detail, setDetail] = useState<Application | null>(null);
  const [detailNotes, setDetailNotes] = useState("");
  const [busy, setBusy] = useState(false);
  // B2B-KANBAN-001: drag-to-update state.
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    if (!event.over) return;
    const targetId = String(event.over.id);
    if (!targetId.startsWith("column-")) return;
    const newStage = targetId.replace("column-", "");
    const card = rows.find((r) => r.id === event.active.id);
    if (!card || card.status === newStage) return;

    // Optimistic update: move the card immediately.
    const prevStage = card.status;
    setRows((rs) =>
      rs.map((r) =>
        r.id === card.id ? { ...r, status: newStage } : r,
      ),
    );

    try {
      const patch: Record<string, unknown> = { status: newStage };
      if (
        ["approved", "rejected"].includes(newStage) &&
        !card.reviewed_at
      ) {
        const { data: user } = await supabase.auth.getUser();
        patch.reviewed_at = new Date().toISOString();
        patch.reviewed_by = user.user?.id ?? null;
      }
      const { error } = await supabase
        .from("partnership_applications")
        .update(patch as never)
        .eq("id", card.id);
      if (error) throw error;
      toast.success(`Moved to ${STAGES.find((s) => s.value === newStage)?.label ?? newStage}`);
    } catch (err) {
      handleError(err, {
        component: "PartnershipsManager",
        action: "handleDragEnd",
      });
      toast.error("Move failed — reverted");
      // Revert.
      setRows((rs) =>
        rs.map((r) =>
          r.id === card.id ? { ...r, status: prevStage } : r,
        ),
      );
    }
  }

  async function load() {
    setLoading(true);
    try {
      let q = supabase
        .from("partnership_applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (search) {
        q = q.or(
          `business_name.ilike.%${search}%,contact_email.ilike.%${search}%,business_type.ilike.%${search}%`,
        );
      }
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (tierFilter !== "all") q = q.eq("desired_tier", tierFilter);
      const { data, error } = await q;
      if (error) throw error;
      setRows(data ?? []);
    } catch (err) {
      handleError(err, {
        component: "PartnershipsManager",
        action: "load",
      });
      toast.error("Failed to load partnerships");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, tierFilter]);

  const byStage = useMemo(() => {
    const m = new Map<string, Application[]>();
    for (const s of STAGES) m.set(s.value, []);
    for (const r of rows) {
      const key = r.status ?? "pending";
      const list = m.get(key) ?? [];
      list.push(r);
      m.set(key, list);
    }
    return m;
  }, [rows]);

  function openDetail(app: Application) {
    setDetail(app);
    setDetailNotes(app.admin_notes ?? "");
  }

  async function updateDetail(updates: Partial<Application>) {
    if (!detail) return;
    setBusy(true);
    try {
      const patch: Record<string, unknown> = { ...updates };
      if (
        updates.status &&
        ["approved", "rejected"].includes(updates.status) &&
        !detail.reviewed_at
      ) {
        const { data: user } = await supabase.auth.getUser();
        patch.reviewed_at = new Date().toISOString();
        patch.reviewed_by = user.user?.id ?? null;
      }
      const { error } = await supabase
        .from("partnership_applications")
        .update(patch as never)
        .eq("id", detail.id);
      if (error) throw error;
      toast.success("Updated");
      setDetail({ ...detail, ...updates } as Application);
      await load();
    } catch (err) {
      handleError(err, {
        component: "PartnershipsManager",
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
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <HandCoins className="h-5 w-5" />
              Business partnerships
            </CardTitle>
            <CardDescription>
              {rows.length} application{rows.length === 1 ? "" : "s"} matching
            </CardDescription>
          </div>
          <Tabs
            value={view}
            onValueChange={(v) => setView(v as "list" | "kanban")}
          >
            <TabsList>
              <TabsTrigger value="kanban">
                <LayoutGrid className="h-3.5 w-3.5 mr-1" />
                Kanban
              </TabsTrigger>
              <TabsTrigger value="list">
                <TableIcon className="h-3.5 w-3.5 mr-1" />
                List
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search business, email, type…"
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {STAGES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Desired tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any tier</SelectItem>
              {TIER_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {view === "kanban" ? (
          loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {STAGES.map((s) => (
                <div key={s.value} className="space-y-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              onDragStart={(e: DragStartEvent) => setActiveDragId(String(e.active.id))}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveDragId(null)}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {STAGES.map((s) => {
                  const items = byStage.get(s.value) ?? [];
                  return (
                    <div key={s.value} className="space-y-2">
                      <div className="flex items-center justify-between text-sm font-medium">
                        <span>{s.label}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {items.length}
                        </span>
                      </div>
                      <DroppableColumn stageKey={s.value}>
                        {items.length === 0 ? (
                          <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                            drop here
                          </div>
                        ) : (
                          items.map((app) => (
                            <DraggableAppCard
                              key={app.id}
                              app={app}
                              onOpen={() => openDetail(app)}
                            />
                          ))
                        )}
                      </DroppableColumn>
                    </div>
                  );
                })}
              </div>
              <DragOverlay>
                {activeDragId
                  ? (() => {
                      const dragging = rows.find((r) => r.id === activeDragId);
                      if (!dragging) return null;
                      return (
                        <div className="rounded-md border bg-card shadow-lg p-3 opacity-90 rotate-1">
                          <AppCardBody app={dragging} />
                        </div>
                      );
                    })()
                  : null}
              </DragOverlay>
            </DndContext>
          )
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead className="hidden md:table-cell">Tier</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="hidden lg:table-cell">Contact</TableHead>
                  <TableHead className="hidden lg:table-cell">Created</TableHead>
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
                      <HandCoins className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No partnership applications match the filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((app) => (
                    <TableRow
                      key={app.id}
                      className="cursor-pointer"
                      onClick={() => openDetail(app)}
                    >
                      <TableCell>
                        <div className="font-medium truncate max-w-[220px]">
                          {app.business_name}
                        </div>
                        {app.website && (
                          <a
                            href={app.website}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          >
                            {app.website}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {app.business_type}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs capitalize">
                        {app.desired_tier ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StageBadge status={app.status} />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs">
                        {app.contact_email}
                        {app.contact_phone && (
                          <div className="text-muted-foreground">
                            {app.contact_phone}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {new Date(app.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
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
                  <HandCoins className="h-5 w-5" />
                  {detail.business_name}
                </SheetTitle>
                <SheetDescription>
                  {detail.business_type}
                  {detail.desired_tier && ` · ${detail.desired_tier} tier`}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Stage
                    </Label>
                    <Select
                      value={detail.status ?? "pending"}
                      onValueChange={(v) => updateDetail({ status: v })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Desired tier
                    </Label>
                    <Select
                      value={detail.desired_tier ?? ""}
                      onValueChange={(v) => updateDetail({ desired_tier: v })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIER_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-md border p-3 text-sm space-y-2">
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <a
                      href={`mailto:${detail.contact_email}`}
                      className="text-primary hover:underline"
                    >
                      {detail.contact_email}
                    </a>
                  </div>
                  {detail.contact_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <a
                        href={`tel:${detail.contact_phone}`}
                        className="text-primary hover:underline"
                      >
                        {detail.contact_phone}
                      </a>
                    </div>
                  )}
                  {detail.website && (
                    <div className="flex items-center gap-2">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      <a
                        href={detail.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline truncate"
                      >
                        {detail.website}
                      </a>
                    </div>
                  )}
                </div>

                {detail.description && (
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Pitch
                    </Label>
                    <div className="mt-1 rounded-md border p-3 text-sm whitespace-pre-line">
                      {detail.description}
                    </div>
                  </div>
                )}

                <div>
                  <Label
                    htmlFor="b2b-notes"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    Admin notes
                  </Label>
                  <Textarea
                    id="b2b-notes"
                    rows={4}
                    value={detailNotes}
                    onChange={(e) => setDetailNotes(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={saveNotes}
                    disabled={busy}
                  >
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    Save notes
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
                  <div>
                    Submitted{" "}
                    {new Date(detail.created_at).toLocaleString()}
                  </div>
                  {detail.reviewed_at && (
                    <div>
                      Reviewed{" "}
                      {new Date(detail.reviewed_at).toLocaleString()}
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
