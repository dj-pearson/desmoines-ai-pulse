import { useState } from "react";
import { ExternalLink, Loader2, Pencil, Plus } from "lucide-react";
import { AdminTextField as TextField } from "@/components/admin/AdminTextField";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { isDuplicateSlugError } from "@/hooks/useAdminSeasonalGuides";
import { useAdminTrails, useSaveTrail } from "@/hooks/useAdminTrails";
import { handleError } from "@/lib/errorHandler";
import { toast } from "@/lib/toast";
import {
  NOT_SET,
  TRAIL_ACTIVITIES,
  TRAIL_DIFFICULTIES,
  TRAIL_LABELS,
  TRAIL_SURFACES,
  buildTrailRow,
  emptyTrailForm,
  formFromTrail,
  slugifyTrailName,
  toggleActivity,
  type TrailFormErrors,
  type TrailFormState,
} from "@/lib/trailForm";

const trailPath = (slug: string) => `/outdoors/${slug}`;

const label = (value: string | null): string =>
  value && value in TRAIL_LABELS ? TRAIL_LABELS[value as keyof typeof TRAIL_LABELS] : "-";

/**
 * Admin list and editor for public.trails, the rows behind /outdoors
 * (WEB-BE-055). Create and edit only: the table has no DELETE policy.
 */
export function TrailManager() {
  const { data: trails, isLoading, error } = useAdminTrails();
  const save = useSaveTrail();
  const [form, setForm] = useState<TrailFormState | null>(null);
  const [errors, setErrors] = useState<TrailFormErrors>({});
  const [slugTouched, setSlugTouched] = useState(false);

  const open = (next: TrailFormState) => {
    setForm(next);
    setErrors({});
    setSlugTouched(!!next.id);
  };

  const update = <K extends keyof TrailFormState>(key: K, value: TrailFormState[K]) => {
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, [key]: value };
      if (key === "name" && !slugTouched) next.slug = slugifyTrailName(String(value));
      return next;
    });
  };

  const submit = async () => {
    if (!form) return;
    const built = buildTrailRow(form);
    if (!built.row) {
      setErrors(built.errors);
      return;
    }
    try {
      await save.mutateAsync({ id: form.id, row: built.row });
      toast.success(form.id ? "Trail saved" : "Trail created");
      setForm(null);
    } catch (err) {
      if (isDuplicateSlugError(err)) {
        setErrors({ slug: "Another trail already uses this slug." });
        return;
      }
      handleError(err, { component: "TrailManager", action: "save" });
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="trails-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="trails-heading" className="text-2xl font-semibold">
            Trails
          </h1>
          <p className="text-sm text-muted-foreground">The trails at /outdoors.</p>
        </div>
        <Button onClick={() => open(emptyTrailForm())}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          New trail
        </Button>
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading trails...
        </p>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          Trails could not be loaded. Reload to try again.
        </p>
      ) : !trails || trails.length === 0 ? (
        <p className="text-sm text-muted-foreground">No trails yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead>Length</TableHead>
                <TableHead>Featured</TableHead>
                <TableHead>Map pin</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trails.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{trailPath(t.slug)}</div>
                  </TableCell>
                  <TableCell>{label(t.difficulty)}</TableCell>
                  <TableCell>{t.length_miles !== null ? `${t.length_miles} mi` : "-"}</TableCell>
                  <TableCell>{t.is_featured ? "Yes" : "No"}</TableCell>
                  <TableCell>{t.latitude !== null && t.longitude !== null ? "Yes" : "Missing"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button asChild size="icon" variant="ghost">
                        <a
                          href={trailPath(t.slug)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`View ${t.name}`}
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        </a>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${t.name}`}
                        onClick={() => open(formFromTrail(t))}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && !save.isPending && setForm(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit trail" : "New trail"}</DialogTitle>
            <DialogDescription>
              Leave a field empty rather than guess. The page shows only what is filled in.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid gap-4">
              <TextField id="t-name" label="Name" value={form.name} onChange={(v) => update("name", v)} error={errors.name} />
              <TextField
                id="t-slug"
                label="Slug"
                value={form.slug}
                onChange={(v) => {
                  setSlugTouched(true);
                  update("slug", v);
                }}
                error={errors.slug}
                disabled={!!form.id}
                hint={form.id ? "Fixed: it is the page's URL." : undefined}
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="t-difficulty">Difficulty</Label>
                  <Select
                    value={form.difficulty}
                    onValueChange={(v) => update("difficulty", v as TrailFormState["difficulty"])}
                  >
                    <SelectTrigger id="t-difficulty">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NOT_SET}>Not set</SelectItem>
                      {TRAIL_DIFFICULTIES.map((d) => (
                        <SelectItem key={d} value={d}>
                          {TRAIL_LABELS[d]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="t-surface">Surface</Label>
                  <Select
                    value={form.surface_type}
                    onValueChange={(v) => update("surface_type", v as TrailFormState["surface_type"])}
                  >
                    <SelectTrigger id="t-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NOT_SET}>Not set</SelectItem>
                      {TRAIL_SURFACES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {TRAIL_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <TextField
                  id="t-length"
                  label="Length (miles)"
                  inputMode="decimal"
                  value={form.length_miles}
                  onChange={(v) => update("length_miles", v)}
                  error={errors.length_miles}
                />
              </div>
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">Activities</legend>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {TRAIL_ACTIVITIES.map((a) => (
                    <div key={a} className="flex items-center gap-2">
                      <Checkbox
                        id={`t-act-${a}`}
                        checked={form.activities.includes(a)}
                        onCheckedChange={(c) => update("activities", toggleActivity(form.activities, a, c === true))}
                      />
                      <Label htmlFor={`t-act-${a}`}>{TRAIL_LABELS[a]}</Label>
                    </div>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-1.5">
                <Label htmlFor="t-desc">Description</Label>
                <Textarea id="t-desc" rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="t-highlights">Highlights</Label>
                <Textarea
                  id="t-highlights"
                  rows={2}
                  value={form.highlights}
                  onChange={(e) => update("highlights", e.target.value)}
                />
              </div>
              <TextField
                id="t-address"
                label="Trailhead address"
                value={form.trailhead_address}
                onChange={(v) => update("trailhead_address", v)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id="t-lat"
                  label="Latitude"
                  inputMode="decimal"
                  value={form.latitude}
                  onChange={(v) => update("latitude", v)}
                  error={errors.latitude}
                />
                <TextField
                  id="t-lng"
                  label="Longitude"
                  inputMode="decimal"
                  value={form.longitude}
                  onChange={(v) => update("longitude", v)}
                  error={errors.longitude}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id="t-website"
                  label="Website"
                  type="url"
                  value={form.website}
                  onChange={(v) => update("website", v)}
                  error={errors.website}
                />
                <TextField
                  id="t-image"
                  label="Image URL"
                  type="url"
                  value={form.image_url}
                  onChange={(v) => update("image_url", v)}
                  error={errors.image_url}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="t-featured"
                  checked={form.is_featured}
                  onCheckedChange={(c) => update("is_featured", c === true)}
                />
                <Label htmlFor="t-featured">Featured on /outdoors</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
