import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, MapPin, Upload, X } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { handleError } from "@/lib/errorHandler";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Attraction = Database["public"]["Tables"]["attractions"]["Row"];
type AttractionInsert = Database["public"]["Tables"]["attractions"]["Insert"];

interface AttractionEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass null for "create new" mode. */
  attraction: Attraction | null;
  onSaved: () => void;
}

// Optional flags use a tri-state string to distinguish "not set" from false.
const TRISTATE = z.enum(["", "true", "false"]).optional();

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(150),
  type: z.string().min(1, "Type is required").max(80),
  description: z.string().optional(),
  rating: z.union([z.literal(""), z.coerce.number().min(0).max(5)]).optional(),
  image_url: z.string().url().or(z.literal("")).optional(),
  is_featured: z.boolean(),
  is_active: z.boolean(),
  // Location
  location: z.string().optional(),
  address: z.string().optional(),
  latitude: z
    .union([z.literal(""), z.coerce.number().min(-90).max(90)])
    .optional(),
  longitude: z
    .union([z.literal(""), z.coerce.number().min(-180).max(180)])
    .optional(),
  website: z.string().url().or(z.literal("")).optional(),
  // Features / accessibility
  is_indoor: TRISTATE,
  is_kid_friendly: TRISTATE,
  is_free: TRISTATE,
  hours_summary: z.string().optional(),
  hours_json: z
    .string()
    .optional()
    .refine(
      (v) => {
        if (!v) return true;
        try {
          JSON.parse(v);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Must be valid JSON" },
    ),
  accessibility_notes: z.string().optional(),
  // SEO
  seo_title: z.string().max(60, "Keep ≤ 60 characters").optional(),
  seo_description: z.string().max(160, "Keep ≤ 160 characters").optional(),
  seo_keywords_csv: z.string().optional(),
  seo_h1: z.string().optional(),
  // GEO
  geo_summary: z.string().optional(),
  geo_key_facts_csv: z.string().optional(),
  geo_faq_json: z
    .string()
    .optional()
    .refine(
      (v) => {
        if (!v) return true;
        try {
          const parsed = JSON.parse(v);
          return Array.isArray(parsed);
        } catch {
          return false;
        }
      },
      { message: "Must be a JSON array of { question, answer } objects" },
    ),
});

type FormValues = z.infer<typeof formSchema>;

function csvToArray(csv: string | undefined): string[] | null {
  if (!csv) return null;
  const items = csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

function arrayToCsv(arr: string[] | null | undefined): string {
  return arr ? arr.join(", ") : "";
}

function triFromBool(v: boolean | null | undefined): "" | "true" | "false" {
  if (v === true) return "true";
  if (v === false) return "false";
  return "";
}

function boolFromTri(v: string | undefined): boolean | null {
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function emptyDefaults(): FormValues {
  return {
    name: "",
    type: "",
    description: "",
    rating: "",
    image_url: "",
    is_featured: false,
    is_active: true,
    location: "",
    address: "",
    latitude: "",
    longitude: "",
    website: "",
    is_indoor: "",
    is_kid_friendly: "",
    is_free: "",
    hours_summary: "",
    hours_json: "",
    accessibility_notes: "",
    seo_title: "",
    seo_description: "",
    seo_keywords_csv: "",
    seo_h1: "",
    geo_summary: "",
    geo_key_facts_csv: "",
    geo_faq_json: "",
  };
}

function toValues(a: Attraction): FormValues {
  return {
    name: a.name ?? "",
    type: a.type ?? "",
    description: a.description ?? "",
    rating: a.rating ?? "",
    image_url: a.image_url ?? "",
    is_featured: a.is_featured ?? false,
    is_active: a.is_active,
    location: a.location ?? "",
    address: a.address ?? "",
    latitude: a.latitude ?? "",
    longitude: a.longitude ?? "",
    website: a.website ?? "",
    is_indoor: triFromBool(a.is_indoor),
    is_kid_friendly: triFromBool(a.is_kid_friendly),
    is_free: triFromBool(a.is_free),
    hours_summary: a.hours_summary ?? "",
    hours_json: a.hours ? JSON.stringify(a.hours, null, 2) : "",
    accessibility_notes: a.accessibility_notes ?? "",
    seo_title: a.seo_title ?? "",
    seo_description: a.seo_description ?? "",
    seo_keywords_csv: arrayToCsv(a.seo_keywords),
    seo_h1: a.seo_h1 ?? "",
    geo_summary: a.geo_summary ?? "",
    geo_key_facts_csv: arrayToCsv(a.geo_key_facts),
    geo_faq_json: a.geo_faq ? JSON.stringify(a.geo_faq, null, 2) : "",
  };
}

async function uploadImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const key = `attractions/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("media")
    .upload(key, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("media").getPublicUrl(key);
  return data.publicUrl;
}

async function geocodeAddress(
  location: string,
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const { data, error } = await supabase.functions.invoke<
      { latitude: number; longitude: number } | { error: string }
    >("geocode-location", { body: { location } });
    if (error) return null;
    if (data && "latitude" in data && "longitude" in data) {
      return { latitude: data.latitude, longitude: data.longitude };
    }
    return null;
  } catch {
    return null;
  }
}

export default function AttractionEditDialog({
  open,
  onOpenChange,
  attraction,
  onSaved,
}: AttractionEditDialogProps) {
  const isEdit = attraction !== null;
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("basics");

  const defaultValues = useMemo<FormValues>(
    () => (attraction ? toValues(attraction) : emptyDefaults()),
    [attraction],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
    mode: "onBlur",
  });

  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
      setActiveTab("basics");
    }
  }, [open, defaultValues, form]);

  const imageUrl = form.watch("image_url");

  async function handleFileUpload(file: File) {
    setUploading(true);
    try {
      const url = await uploadImage(file);
      form.setValue("image_url", url, { shouldDirty: true });
      toast.success("Image uploaded");
    } catch (err) {
      handleError(err, {
        component: "AttractionEditDialog",
        action: "uploadImage",
      });
      toast.error("Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      let lat = values.latitude === "" ? null : (values.latitude as number);
      let lng = values.longitude === "" ? null : (values.longitude as number);

      // Geocode-on-save when both coords blank but we have address or location.
      const addressLine =
        values.address || values.location || "";
      if (lat == null && lng == null && addressLine) {
        const geo = await geocodeAddress(addressLine);
        if (geo) {
          lat = geo.latitude;
          lng = geo.longitude;
          toast.info(`Geocoded to ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      }

      const payload: AttractionInsert = {
        name: values.name,
        type: values.type,
        description: values.description || null,
        rating:
          values.rating === "" || values.rating == null
            ? null
            : (values.rating as number),
        image_url: values.image_url || null,
        is_featured: values.is_featured,
        is_active: values.is_active,
        location: values.location || null,
        address: values.address || null,
        latitude: lat,
        longitude: lng,
        website: values.website || null,
        is_indoor: boolFromTri(values.is_indoor),
        is_kid_friendly: boolFromTri(values.is_kid_friendly),
        is_free: boolFromTri(values.is_free),
        hours_summary: values.hours_summary || null,
        hours: values.hours_json
          ? (JSON.parse(values.hours_json) as AttractionInsert["hours"])
          : null,
        accessibility_notes: values.accessibility_notes || null,
        seo_title: values.seo_title || null,
        seo_description: values.seo_description || null,
        seo_keywords: csvToArray(values.seo_keywords_csv),
        seo_h1: values.seo_h1 || null,
        geo_summary: values.geo_summary || null,
        geo_key_facts: csvToArray(values.geo_key_facts_csv),
        geo_faq: values.geo_faq_json
          ? (JSON.parse(values.geo_faq_json) as AttractionInsert["geo_faq"])
          : null,
      };

      if (isEdit && attraction) {
        const { error } = await supabase
          .from("attractions")
          .update(payload)
          .eq("id", attraction.id);
        if (error) throw error;
        toast.success("Attraction updated");
      } else {
        const { error } = await supabase.from("attractions").insert(payload);
        if (error) throw error;
        toast.success("Attraction created");
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      handleError(err, {
        component: "AttractionEditDialog",
        action: "save",
      });
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Edit ${attraction?.name}` : "New attraction"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update attraction details and SEO/GEO blocks."
              : "Create a new attraction. Lat/lng auto-fill from address on save if blank."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-5 w-full">
              <TabsTrigger value="basics">Basics</TabsTrigger>
              <TabsTrigger value="location">Location</TabsTrigger>
              <TabsTrigger value="features">Features</TabsTrigger>
              <TabsTrigger value="seo">SEO</TabsTrigger>
              <TabsTrigger value="geo">GEO</TabsTrigger>
            </TabsList>

            <TabsContent value="basics" className="space-y-3 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="a-name">Name *</Label>
                  <Input id="a-name" {...form.register("name")} />
                  {errors.name && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.name.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="a-type">Type *</Label>
                  <Input
                    id="a-type"
                    placeholder="museum, park, gallery…"
                    {...form.register("type")}
                  />
                  {errors.type && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.type.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="a-rating">Rating (0–5)</Label>
                  <Input
                    id="a-rating"
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    {...form.register("rating")}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="a-desc">Description</Label>
                <Textarea
                  id="a-desc"
                  rows={5}
                  {...form.register("description")}
                />
              </div>
              <div>
                <Label>Cover image</Label>
                <div className="flex items-start gap-3 mt-1">
                  {imageUrl ? (
                    <div className="relative">
                      <img
                        src={imageUrl}
                        alt=""
                        className="h-24 w-32 rounded object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => form.setValue("image_url", "")}
                        className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs grid place-items-center"
                        aria-label="Clear image"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-24 w-32 rounded border-dashed border-2 grid place-items-center text-muted-foreground text-xs">
                      No image
                    </div>
                  )}
                  <div className="space-y-2">
                    <input
                      id="a-img-file"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                        e.target.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={uploading}
                      onClick={() =>
                        document.getElementById("a-img-file")?.click()
                      }
                    >
                      {uploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                      ) : (
                        <Upload className="h-3.5 w-3.5 mr-1" />
                      )}
                      Upload
                    </Button>
                    <Input
                      placeholder="…or paste an image URL"
                      {...form.register("image_url")}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={form.watch("is_featured")}
                    onCheckedChange={(c) =>
                      form.setValue("is_featured", c, { shouldDirty: true })
                    }
                  />
                  Featured
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={form.watch("is_active")}
                    onCheckedChange={(c) =>
                      form.setValue("is_active", c, { shouldDirty: true })
                    }
                  />
                  Active
                </label>
              </div>
            </TabsContent>

            <TabsContent value="location" className="space-y-3 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="a-loc">Location (display label)</Label>
                  <Input
                    id="a-loc"
                    placeholder="East Village, Pappajohn Sculpture Park…"
                    {...form.register("location")}
                  />
                </div>
                <div>
                  <Label htmlFor="a-addr">Street address</Label>
                  <Input id="a-addr" {...form.register("address")} />
                </div>
                <div>
                  <Label htmlFor="a-lat">Latitude</Label>
                  <Input
                    id="a-lat"
                    type="number"
                    step="0.0001"
                    {...form.register("latitude")}
                  />
                </div>
                <div>
                  <Label htmlFor="a-lng">Longitude</Label>
                  <Input
                    id="a-lng"
                    type="number"
                    step="0.0001"
                    {...form.register("longitude")}
                  />
                </div>
                <p className="md:col-span-2 text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Leave blank to auto-geocode from the address or location on
                  save.
                </p>
                <div className="md:col-span-2">
                  <Label htmlFor="a-web">Website</Label>
                  <Input id="a-web" {...form.register("website")} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="features" className="space-y-3 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <TriField
                  label="Indoor"
                  field="is_indoor"
                  value={form.watch("is_indoor") ?? ""}
                  onChange={(v) =>
                    form.setValue("is_indoor", v as FormValues["is_indoor"], {
                      shouldDirty: true,
                    })
                  }
                />
                <TriField
                  label="Kid-friendly"
                  field="is_kid_friendly"
                  value={form.watch("is_kid_friendly") ?? ""}
                  onChange={(v) =>
                    form.setValue(
                      "is_kid_friendly",
                      v as FormValues["is_kid_friendly"],
                      { shouldDirty: true },
                    )
                  }
                />
                <TriField
                  label="Free admission"
                  field="is_free"
                  value={form.watch("is_free") ?? ""}
                  onChange={(v) =>
                    form.setValue("is_free", v as FormValues["is_free"], {
                      shouldDirty: true,
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="a-hrs">Hours summary</Label>
                <Input
                  id="a-hrs"
                  placeholder="Mon–Sat 10–5, Sun closed"
                  {...form.register("hours_summary")}
                />
              </div>
              <div>
                <Label htmlFor="a-hrs-json">Hours (JSON, advanced)</Label>
                <Textarea
                  id="a-hrs-json"
                  rows={5}
                  className="font-mono text-xs"
                  placeholder='{ "mon": { "open": "10:00", "close": "17:00" } }'
                  {...form.register("hours_json")}
                />
                {errors.hours_json && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.hours_json.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="a-access">Accessibility notes</Label>
                <Textarea
                  id="a-access"
                  rows={3}
                  placeholder="Wheelchair entry on north side, sensory-friendly hours Sat 9–11am…"
                  {...form.register("accessibility_notes")}
                />
              </div>
            </TabsContent>

            <TabsContent value="seo" className="space-y-3 mt-4">
              <div>
                <Label htmlFor="a-seot">SEO title</Label>
                <Input id="a-seot" maxLength={70} {...form.register("seo_title")} />
                <p
                  className={cn(
                    "text-xs mt-1",
                    (form.watch("seo_title")?.length ?? 0) > 60
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {form.watch("seo_title")?.length ?? 0} / 60 characters
                </p>
              </div>
              <div>
                <Label htmlFor="a-seod">SEO description</Label>
                <Textarea
                  id="a-seod"
                  rows={2}
                  maxLength={180}
                  {...form.register("seo_description")}
                />
                <p
                  className={cn(
                    "text-xs mt-1",
                    (form.watch("seo_description")?.length ?? 0) > 160
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {form.watch("seo_description")?.length ?? 0} / 160 characters
                </p>
              </div>
              <div>
                <Label htmlFor="a-seok">SEO keywords (comma-separated)</Label>
                <Input id="a-seok" {...form.register("seo_keywords_csv")} />
              </div>
              <div>
                <Label htmlFor="a-seoh1">H1 override</Label>
                <Input
                  id="a-seoh1"
                  placeholder="Defaults to attraction name"
                  {...form.register("seo_h1")}
                />
              </div>
            </TabsContent>

            <TabsContent value="geo" className="space-y-3 mt-4">
              <div>
                <Label htmlFor="a-geos">GEO summary</Label>
                <Textarea
                  id="a-geos"
                  rows={3}
                  placeholder="Short, AI-discoverable summary."
                  {...form.register("geo_summary")}
                />
              </div>
              <div>
                <Label htmlFor="a-geokf">Key facts (comma-separated)</Label>
                <Textarea
                  id="a-geokf"
                  rows={3}
                  placeholder="Free parking, Open daily, Family-friendly"
                  {...form.register("geo_key_facts_csv")}
                />
              </div>
              <div>
                <Label htmlFor="a-geofaq">FAQ (JSON)</Label>
                <Textarea
                  id="a-geofaq"
                  rows={6}
                  className="font-mono text-xs"
                  placeholder='[ { "question": "Is parking free?", "answer": "Yes." } ]'
                  {...form.register("geo_faq_json")}
                />
                {errors.geo_faq_json && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.geo_faq_json.message}
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              {isEdit ? "Save changes" : "Create attraction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TriField({
  label,
  field,
  value,
  onChange,
}: {
  label: string;
  field: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const options: { v: string; label: string }[] = [
    { v: "", label: "—" },
    { v: "true", label: "Yes" },
    { v: "false", label: "No" },
  ];
  return (
    <div>
      <Label>{label}</Label>
      <div className="inline-flex rounded-md border overflow-hidden mt-1">
        {options.map((opt) => (
          <button
            key={`${field}-${opt.v}`}
            type="button"
            onClick={() => onChange(opt.v)}
            className={cn(
              "px-3 py-1.5 text-xs transition-colors",
              value === opt.v
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-accent",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
