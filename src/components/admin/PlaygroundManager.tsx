import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Construction,
  Lock,
  Search,
  Sparkles,
  TreeDeciduous,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { usePlaygrounds } from "@/hooks/usePlaygrounds";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { handleError } from "@/lib/errorHandler";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Playground = Database["public"]["Tables"]["playgrounds"]["Row"];
type PlaygroundUpdate = Database["public"]["Tables"]["playgrounds"]["Update"];

const PAGE_SIZE = 25;

const SURFACE_OPTIONS = [
  "rubber",
  "mulch",
  "grass",
  "sand",
  "pour-in-place",
  "concrete",
  "turf",
  "other",
] as const;

const AGE_RANGE_OPTIONS = [
  "0-2",
  "2-5",
  "5-12",
  "all ages",
  "teen",
] as const;

type EditableField =
  | "name"
  | "has_restrooms"
  | "has_shade"
  | "surface_type"
  | "age_range"
  | "accessibility_notes";

function TriCell({
  label,
  value,
}: {
  label: string;
  value: boolean | null;
}) {
  if (value === true)
    return (
      <Badge variant="default" className="text-[10px]">
        {label}
      </Badge>
    );
  if (value === false)
    return (
      <Badge
        variant="outline"
        className="text-[10px] text-muted-foreground"
      >
        no {label.toLowerCase()}
      </Badge>
    );
  return <span className="text-xs text-muted-foreground">—</span>;
}

interface InlineEditProps {
  playground: Playground;
  field: EditableField;
  onSaved: () => void;
}

function InlineEdit({ playground, field, onSaved }: InlineEditProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(() => {
    const v = playground[field];
    if (v === null || v === undefined) return "";
    return String(v);
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      let updates: PlaygroundUpdate = { manually_curated: true };
      switch (field) {
        case "name":
          updates.name = value.trim();
          break;
        case "has_restrooms":
        case "has_shade":
          updates[field] =
            value === "true" ? true : value === "false" ? false : null;
          break;
        case "surface_type":
        case "age_range":
          updates[field] = value.trim() || null;
          break;
        case "accessibility_notes":
          updates.accessibility_notes = value.trim() || null;
          break;
      }

      const { error } = await supabase
        .from("playgrounds")
        .update(updates)
        .eq("id", playground.id);
      if (error) throw error;

      toast.success("Saved");
      setOpen(false);
      onSaved();
    } catch (err) {
      handleError(err, { component: "PlaygroundManager", action: "inlineEdit" });
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  function renderTrigger() {
    const v = playground[field];
    if (field === "has_restrooms")
      return <TriCell label="Restrooms" value={v as boolean | null} />;
    if (field === "has_shade")
      return <TriCell label="Shade" value={v as boolean | null} />;
    if (field === "name") {
      return <span className="font-medium underline-offset-2 hover:underline">{playground.name}</span>;
    }
    return (
      <span className="text-sm">
        {v == null || v === "" ? (
          <span className="text-muted-foreground italic">empty</span>
        ) : (
          String(v)
        )}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-left hover:opacity-80 transition-opacity"
        >
          {renderTrigger()}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {field.replace(/_/g, " ")}
          </Label>
          {field === "has_restrooms" || field === "has_shade" ? (
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unknown</SelectItem>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          ) : field === "surface_type" ? (
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— clear —</SelectItem>
                {SURFACE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : field === "age_range" ? (
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— clear —</SelectItem>
                {AGE_RANGE_OPTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : field === "accessibility_notes" ? (
            <Textarea
              rows={4}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Wheelchair-accessible, sensory-friendly, shaded benches…"
            />
          ) : (
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          )}
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Lock className="h-3 w-3" />
            Saving marks this row manually curated.
          </p>
          <div className="flex gap-2 justify-end pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface BulkEditState {
  field: EditableField | null;
  value: string;
}

export default function PlaygroundManager() {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 300);
  const [sourceFilter, setSourceFilter] = useState<"all" | "manual" | "google_places">(
    "all",
  );
  const [manuallyCuratedOnly, setManuallyCuratedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"updated" | "newest" | "alphabetical">(
    "updated",
  );
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEdit, setBulkEdit] = useState<BulkEditState>({
    field: null,
    value: "",
  });
  const [busy, setBusy] = useState(false);

  const state = usePlaygrounds({
    search: search || undefined,
    source: sourceFilter === "all" ? undefined : sourceFilter,
    manuallyCuratedOnly: manuallyCuratedOnly || undefined,
    sortBy,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(state.totalCount / PAGE_SIZE)),
    [state.totalCount],
  );
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const pageIds = state.playgrounds.map((p) => p.id);
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

  async function applyBulkEdit() {
    if (selectedIds.length === 0 || !bulkEdit.field) return;
    setBusy(true);
    try {
      let updates: PlaygroundUpdate = { manually_curated: true };
      const f = bulkEdit.field;
      switch (f) {
        case "has_restrooms":
        case "has_shade":
          updates[f] =
            bulkEdit.value === "true"
              ? true
              : bulkEdit.value === "false"
                ? false
                : null;
          break;
        case "surface_type":
        case "age_range":
          updates[f] = bulkEdit.value.trim() || null;
          break;
        case "accessibility_notes":
          updates.accessibility_notes = bulkEdit.value.trim() || null;
          break;
        case "name":
          // Bulk-setting name is almost certainly an accident — block it.
          toast.error("Bulk-editing name is not allowed");
          setBusy(false);
          return;
      }
      const { error } = await supabase
        .from("playgrounds")
        .update(updates)
        .in("id", selectedIds);
      if (error) throw error;
      toast.success(
        `${selectedIds.length} playground${selectedIds.length === 1 ? "" : "s"} updated`,
      );
      setBulkEdit({ field: null, value: "" });
      setSelected(new Set());
      await state.refetch();
    } catch (err) {
      handleError(err, {
        component: "PlaygroundManager",
        action: "applyBulkEdit",
      });
      toast.error("Bulk edit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TreeDeciduous className="h-5 w-5" />
              Playgrounds
            </CardTitle>
            <CardDescription>
              {state.totalCount.toLocaleString()} total · {selectedIds.length}{" "}
              selected · click a cell to edit
            </CardDescription>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(0);
              }}
              placeholder="Search name, location, age…"
              className="pl-8"
            />
          </div>
          <Select
            value={sourceFilter}
            onValueChange={(v: "all" | "manual" | "google_places") => {
              setSourceFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any source</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="google_places">Google Places</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={sortBy}
            onValueChange={(v: "updated" | "newest" | "alphabetical") =>
              setSortBy(v)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Most recently updated</SelectItem>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="alphabetical">Name (A–Z)</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={manuallyCuratedOnly}
              onCheckedChange={(c) => {
                setManuallyCuratedOnly(Boolean(c));
                setPage(0);
              }}
            />
            <Lock className="h-3.5 w-3.5" />
            Curated only
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
              {(
                [
                  { f: "has_restrooms" as const, label: "Restrooms…" },
                  { f: "has_shade" as const, label: "Shade…" },
                  { f: "surface_type" as const, label: "Surface…" },
                  { f: "age_range" as const, label: "Age range…" },
                  { f: "accessibility_notes" as const, label: "Notes…" },
                ]
              ).map(({ f, label }) => (
                <Button
                  key={f}
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setBulkEdit({ field: f, value: "" })}
                >
                  {label}
                </Button>
              ))}
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
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Location</TableHead>
                <TableHead className="hidden lg:table-cell">Age range</TableHead>
                <TableHead className="hidden lg:table-cell">Surface</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead className="hidden xl:table-cell">Notes</TableHead>
                <TableHead className="hidden md:table-cell">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : state.playgrounds.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-sm text-muted-foreground py-12"
                  >
                    <TreeDeciduous className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No playgrounds match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                state.playgrounds.map((p) => {
                  const checked = selected.has(p.id);
                  return (
                    <TableRow
                      key={p.id}
                      className={cn(checked && "bg-accent/40")}
                    >
                      <TableCell className="w-10">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) =>
                            toggleOne(p.id, Boolean(c))
                          }
                          aria-label={`Select ${p.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {p.manually_curated && (
                            <Lock
                              className="h-3 w-3 text-primary"
                              aria-label="Manually curated"
                            />
                          )}
                          <InlineEdit
                            playground={p}
                            field="name"
                            onSaved={() => state.refetch()}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {p.location ?? "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <InlineEdit
                          playground={p}
                          field="age_range"
                          onSaved={() => state.refetch()}
                        />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <InlineEdit
                          playground={p}
                          field="surface_type"
                          onSaved={() => state.refetch()}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <InlineEdit
                            playground={p}
                            field="has_restrooms"
                            onSaved={() => state.refetch()}
                          />
                          <InlineEdit
                            playground={p}
                            field="has_shade"
                            onSaved={() => state.refetch()}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell max-w-[200px] truncate">
                        <InlineEdit
                          playground={p}
                          field="accessibility_notes"
                          onSaved={() => state.refetch()}
                        />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge
                          variant={
                            p.source === "google_places" ? "secondary" : "outline"
                          }
                          className="text-[10px] gap-1"
                        >
                          {p.source === "google_places" ? (
                            <>
                              <Construction className="h-3 w-3" />
                              Google
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3 w-3" />
                              Manual
                            </>
                          )}
                        </Badge>
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
            {state.totalCount > 0 && (
              <span className="ml-2">
                · {state.totalCount.toLocaleString()} total
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((pp) => Math.max(0, pp - 1))}
              disabled={page === 0 || state.isLoading}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((pp) => pp + 1)}
              disabled={page + 1 >= totalPages || state.isLoading}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Bulk-edit modal */}
      <Dialog
        open={bulkEdit.field !== null}
        onOpenChange={(open) => !open && setBulkEdit({ field: null, value: "" })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Bulk edit{" "}
              {bulkEdit.field
                ? bulkEdit.field.replace(/_/g, " ")
                : ""}
            </DialogTitle>
            <DialogDescription>
              Applies the chosen value to {selectedIds.length} selected
              playground{selectedIds.length === 1 ? "" : "s"} and marks each
              one as manually curated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {bulkEdit.field === "has_restrooms" ||
            bulkEdit.field === "has_shade" ? (
              <Select
                value={bulkEdit.value}
                onValueChange={(v) =>
                  setBulkEdit((prev) => ({ ...prev, value: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unknown</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            ) : bulkEdit.field === "surface_type" ? (
              <Select
                value={bulkEdit.value}
                onValueChange={(v) =>
                  setBulkEdit((prev) => ({ ...prev, value: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— clear —</SelectItem>
                  {SURFACE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : bulkEdit.field === "age_range" ? (
              <Select
                value={bulkEdit.value}
                onValueChange={(v) =>
                  setBulkEdit((prev) => ({ ...prev, value: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— clear —</SelectItem>
                  {AGE_RANGE_OPTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : bulkEdit.field === "accessibility_notes" ? (
              <Textarea
                rows={4}
                value={bulkEdit.value}
                onChange={(e) =>
                  setBulkEdit((prev) => ({ ...prev, value: e.target.value }))
                }
              />
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkEdit({ field: null, value: "" })}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={applyBulkEdit} disabled={busy}>
              Apply to {selectedIds.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
