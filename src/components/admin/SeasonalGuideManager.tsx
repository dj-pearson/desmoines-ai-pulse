import { useState } from "react";
import { ExternalLink, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  isDuplicateSlugError,
  useAdminSeasonalGuides,
  useDeleteSeasonalGuide,
  useSaveSeasonalGuide,
} from "@/hooks/useAdminSeasonalGuides";
import { getSeasonLabel } from "@/hooks/useSeasonalGuides";
import { handleError } from "@/lib/errorHandler";
import { seasonalGuidePath } from "@/lib/seasonalGuideSchema";
import {
  GUIDE_SEASONS,
  buildGuideRow,
  emptyGuideForm,
  formFromGuide,
  slugifyGuideTitle,
  type AdminSeasonalGuide,
  type GuideFormErrors,
  type GuideFormState,
  type GuideSeason,
} from "@/lib/seasonalGuideForm";
import { toast } from "@/lib/toast";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}

/** Admin list and editor for seasonal_guides, the rows behind /guides (WEB-BE-055). */
export function SeasonalGuideManager() {
  const { data: guides, isLoading, error } = useAdminSeasonalGuides();
  const save = useSaveSeasonalGuide();
  const remove = useDeleteSeasonalGuide();
  const [form, setForm] = useState<GuideFormState | null>(null);
  const [errors, setErrors] = useState<GuideFormErrors>({});
  // A new guide's slug follows its title until the admin types a slug.
  const [slugTouched, setSlugTouched] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminSeasonalGuide | null>(null);

  const open = (next: GuideFormState) => {
    setForm(next);
    setErrors({});
    setSlugTouched(!!next.id);
  };

  const update = <K extends keyof GuideFormState>(key: K, value: GuideFormState[K]) => {
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, [key]: value };
      if (key === "title" && !slugTouched) next.slug = slugifyGuideTitle(String(value));
      return next;
    });
  };

  const submit = async () => {
    if (!form) return;
    const built = buildGuideRow(form);
    if (!built.row) {
      setErrors(built.errors);
      return;
    }
    try {
      await save.mutateAsync({ id: form.id, row: built.row });
      toast.success(form.id ? "Guide saved" : "Guide created");
      setForm(null);
    } catch (err) {
      if (isDuplicateSlugError(err)) {
        setErrors({ slug: "Another guide already uses this slug." });
        return;
      }
      handleError(err, { component: "SeasonalGuideManager", action: "save" });
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.id);
      toast.success("Guide deleted");
    } catch (err) {
      handleError(err, { component: "SeasonalGuideManager", action: "delete" });
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="guides-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="guides-heading" className="text-2xl font-semibold">
            Seasonal guides
          </h1>
          <p className="text-sm text-muted-foreground">
            The guides at /guides. Drafts stay hidden until published.
          </p>
        </div>
        <Button onClick={() => open(emptyGuideForm())}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          New guide
        </Button>
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading guides...
        </p>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          Guides could not be loaded. Reload to try again.
        </p>
      ) : !guides || guides.length === 0 ? (
        <p className="text-sm text-muted-foreground">No guides yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Season</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Publish date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guides.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>
                    <div className="font-medium">{g.title}</div>
                    <div className="text-xs text-muted-foreground">{seasonalGuidePath(g.slug)}</div>
                  </TableCell>
                  <TableCell>{g.season ? getSeasonLabel(g.season) : "-"}</TableCell>
                  <TableCell>
                    <Badge variant={g.is_published ? "default" : "outline"}>
                      {g.is_published ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell>{g.publish_date ? g.publish_date.slice(0, 10) : "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {g.is_published && (
                        <Button asChild size="icon" variant="ghost">
                          <a
                            href={seasonalGuidePath(g.slug)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`View ${g.title}`}
                          >
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          </a>
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${g.title}`}
                        onClick={() => open(formFromGuide(g))}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${g.title}`}
                        onClick={() => setPendingDelete(g)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
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
            <DialogTitle>{form?.id ? "Edit guide" : "New guide"}</DialogTitle>
            <DialogDescription>
              Sections take one "## Heading" line followed by "- item" lines.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="g-title">Title</Label>
                <Input
                  id="g-title"
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                  aria-invalid={!!errors.title}
                  aria-describedby={errors.title ? "g-title-err" : undefined}
                />
                <FieldError id="g-title-err" message={errors.title} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="g-slug">Slug</Label>
                  <Input
                    id="g-slug"
                    value={form.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      update("slug", e.target.value);
                    }}
                    aria-invalid={!!errors.slug}
                    aria-describedby={errors.slug ? "g-slug-err" : undefined}
                  />
                  <FieldError id="g-slug-err" message={errors.slug} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="g-season">Season</Label>
                  <Select value={form.season} onValueChange={(v) => update("season", v as GuideSeason)}>
                    <SelectTrigger id="g-season">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GUIDE_SEASONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {getSeasonLabel(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="g-desc">Description</Label>
                <Textarea
                  id="g-desc"
                  rows={2}
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="g-sections">Sections</Label>
                <Textarea
                  id="g-sections"
                  rows={12}
                  value={form.sectionsText}
                  onChange={(e) => update("sectionsText", e.target.value)}
                  placeholder={"## Best patios\n- Republic on Grand\n- Centro"}
                  aria-invalid={!!errors.sectionsText}
                  aria-describedby={errors.sectionsText ? "g-sections-err" : undefined}
                />
                <FieldError id="g-sections-err" message={errors.sectionsText} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="g-cover">Cover image URL</Label>
                  <Input
                    id="g-cover"
                    type="url"
                    value={form.cover_image}
                    onChange={(e) => update("cover_image", e.target.value)}
                    aria-invalid={!!errors.cover_image}
                    aria-describedby={errors.cover_image ? "g-cover-err" : undefined}
                  />
                  <FieldError id="g-cover-err" message={errors.cover_image} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="g-date">Publish date</Label>
                  <Input
                    id="g-date"
                    type="date"
                    value={form.publish_date}
                    onChange={(e) => update("publish_date", e.target.value)}
                    aria-invalid={!!errors.publish_date}
                    aria-describedby={errors.publish_date ? "g-date-err" : undefined}
                  />
                  <FieldError id="g-date-err" message={errors.publish_date} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="g-seo-title">SEO title</Label>
                <Input
                  id="g-seo-title"
                  value={form.seo_title}
                  onChange={(e) => update("seo_title", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="g-seo-desc">SEO description</Label>
                <Textarea
                  id="g-seo-desc"
                  rows={2}
                  value={form.seo_description}
                  onChange={(e) => update("seo_description", e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="g-published"
                  checked={form.is_published}
                  onCheckedChange={(v) => update("is_published", v)}
                />
                <Label htmlFor="g-published">Published</Label>
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

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this guide?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.title} will be removed and its page will stop existing. To take it down
              without losing it, unpublish it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
