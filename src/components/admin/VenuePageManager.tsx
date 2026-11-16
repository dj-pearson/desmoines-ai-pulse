import { useState } from "react";
import { ExternalLink, Loader2, Pencil, Plus } from "lucide-react";
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
import { useAdminVenuePages, useSaveVenuePage } from "@/hooks/useAdminVenuePages";
import { handleError } from "@/lib/errorHandler";
import { toast } from "@/lib/toast";
import {
  NO_VENUE_TYPE,
  VENUE_PAGE_TYPES,
  VENUE_PAGE_TYPE_LABELS,
  buildVenuePageRow,
  emptyVenuePageForm,
  formFromVenuePage,
  slugifyVenueName,
  type VenuePageFormErrors,
  type VenuePageFormState,
} from "@/lib/venuePageForm";

const venuePath = (slug: string) => `/music/venues/${slug}`;

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  inputMode?: "decimal" | "numeric";
  disabled?: boolean;
}

function TextField({ id, label, value, onChange, error, hint, type, inputMode, disabled }: TextFieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ");
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={describedBy || undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Admin list and editor for public.venues, the rows behind /music/venues
 * (WEB-BE-055). Not the "Venues" tab under All content, which edits
 * known_venues for event matching.
 */
export function VenuePageManager() {
  const { data: venues, isLoading, error } = useAdminVenuePages();
  const save = useSaveVenuePage();
  const [form, setForm] = useState<VenuePageFormState | null>(null);
  const [errors, setErrors] = useState<VenuePageFormErrors>({});
  const [slugTouched, setSlugTouched] = useState(false);

  const open = (next: VenuePageFormState) => {
    setForm(next);
    setErrors({});
    setSlugTouched(!!next.id);
  };

  const update = <K extends keyof VenuePageFormState>(key: K, value: VenuePageFormState[K]) => {
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, [key]: value };
      if (key === "name" && !slugTouched) next.slug = slugifyVenueName(String(value));
      return next;
    });
  };

  const submit = async () => {
    if (!form) return;
    const built = buildVenuePageRow(form);
    if (!built.row) {
      setErrors(built.errors);
      return;
    }
    try {
      await save.mutateAsync({ id: form.id, row: built.row });
      toast.success(form.id ? "Venue saved" : "Venue created");
      setForm(null);
    } catch (err) {
      if (isDuplicateSlugError(err)) {
        setErrors({ slug: "Another venue already uses this slug." });
        return;
      }
      handleError(err, { component: "VenuePageManager", action: "save" });
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="venue-pages-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="venue-pages-heading" className="text-2xl font-semibold">
            Venue pages
          </h1>
          <p className="text-sm text-muted-foreground">
            The venues at /music/venues. Event matching uses the separate Venues tab under All content.
          </p>
        </div>
        <Button onClick={() => open(emptyVenuePageForm())}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          New venue
        </Button>
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading venues...
        </p>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          Venues could not be loaded. Reload to try again.
        </p>
      ) : !venues || venues.length === 0 ? (
        <p className="text-sm text-muted-foreground">No venues yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Map pin</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {venues.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <div className="font-medium">{v.name}</div>
                    <div className="text-xs text-muted-foreground">{venuePath(v.slug)}</div>
                  </TableCell>
                  <TableCell>
                    {v.venue_type && v.venue_type in VENUE_PAGE_TYPE_LABELS
                      ? VENUE_PAGE_TYPE_LABELS[v.venue_type as keyof typeof VENUE_PAGE_TYPE_LABELS]
                      : "-"}
                  </TableCell>
                  <TableCell>{v.address ?? "-"}</TableCell>
                  <TableCell>{v.latitude !== null && v.longitude !== null ? "Yes" : "Missing"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button asChild size="icon" variant="ghost">
                        <a
                          href={venuePath(v.slug)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`View ${v.name}`}
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        </a>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${v.name}`}
                        onClick={() => open(formFromVenuePage(v))}
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
            <DialogTitle>{form?.id ? "Edit venue" : "New venue"}</DialogTitle>
            <DialogDescription>
              Leave a field empty rather than guess. The page shows only what is filled in.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid gap-4">
              <TextField
                id="v-name"
                label="Name"
                value={form.name}
                onChange={(v) => update("name", v)}
                error={errors.name}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id="v-slug"
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
                <div className="grid gap-1.5">
                  <Label htmlFor="v-type">Type</Label>
                  <Select
                    value={form.venue_type}
                    onValueChange={(v) => update("venue_type", v as VenuePageFormState["venue_type"])}
                  >
                    <SelectTrigger id="v-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_VENUE_TYPE}>No type</SelectItem>
                      {VENUE_PAGE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {VENUE_PAGE_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="v-desc">Description</Label>
                <Textarea
                  id="v-desc"
                  rows={3}
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                />
              </div>
              <TextField
                id="v-address"
                label="Address"
                value={form.address}
                onChange={(v) => update("address", v)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id="v-lat"
                  label="Latitude"
                  inputMode="decimal"
                  value={form.latitude}
                  onChange={(v) => update("latitude", v)}
                  error={errors.latitude}
                />
                <TextField
                  id="v-lng"
                  label="Longitude"
                  inputMode="decimal"
                  value={form.longitude}
                  onChange={(v) => update("longitude", v)}
                  error={errors.longitude}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id="v-website"
                  label="Website"
                  type="url"
                  value={form.website}
                  onChange={(v) => update("website", v)}
                  error={errors.website}
                />
                <TextField
                  id="v-image"
                  label="Image URL"
                  type="url"
                  value={form.image_url}
                  onChange={(v) => update("image_url", v)}
                  error={errors.image_url}
                />
              </div>
              <TextField
                id="v-capacity"
                label="Capacity"
                inputMode="numeric"
                value={form.capacity}
                onChange={(v) => update("capacity", v)}
                error={errors.capacity}
                hint="Only a verified figure. Event pages use it to suggest hotels."
              />
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
