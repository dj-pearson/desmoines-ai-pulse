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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { handleError } from "@/lib/errorHandler";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Hotel = Database["public"]["Tables"]["hotels"]["Row"];
type HotelInsert = Database["public"]["Tables"]["hotels"]["Insert"];

interface HotelEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass null/undefined for "create new" mode. */
  hotel: Hotel | null;
  onSaved: () => void;
}

const PRICE_RANGES = ["$", "$$", "$$$", "$$$$"] as const;

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  chain_name: z.string().optional(),
  hotel_type: z.string().optional(),
  description: z.string().optional(),
  short_description: z.string().max(280).optional(),
  star_rating: z
    .union([z.literal(""), z.coerce.number().min(1).max(5)])
    .optional(),
  price_range: z.enum(PRICE_RANGES).or(z.literal("")).optional(),
  avg_nightly_rate: z
    .union([z.literal(""), z.coerce.number().min(0)])
    .optional(),
  image_url: z.string().url().or(z.literal("")).optional(),
  is_featured: z.boolean(),
  is_active: z.boolean(),
  // Location
  address: z.string().min(1, "Address is required"),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  area: z.string().optional(),
  latitude: z.union([z.literal(""), z.coerce.number().min(-90).max(90)]).optional(),
  longitude: z
    .union([z.literal(""), z.coerce.number().min(-180).max(180)])
    .optional(),
  phone: z.string().optional(),
  email: z.string().email().or(z.literal("")).optional(),
  website: z.string().url().or(z.literal("")).optional(),
  affiliate_url: z.string().url().or(z.literal("")).optional(),
  affiliate_provider: z.string().optional(),
  // Amenities
  amenities_csv: z.string().optional(),
  total_rooms: z.union([z.literal(""), z.coerce.number().min(0)]).optional(),
  check_in_time: z.string().optional(),
  check_out_time: z.string().optional(),
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

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function csvToArray(csv: string | undefined): string[] | null {
  if (!csv) return null;
  const items = csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

function arrayToCsv(arr: string[] | null | undefined): string {
  if (!arr) return "";
  return arr.join(", ");
}

function emptyDefaults(): FormValues {
  return {
    name: "",
    slug: "",
    chain_name: "",
    hotel_type: "",
    description: "",
    short_description: "",
    star_rating: "",
    price_range: "",
    avg_nightly_rate: "",
    image_url: "",
    is_featured: false,
    is_active: true,
    address: "",
    city: "Des Moines",
    state: "IA",
    zip: "",
    area: "",
    latitude: "",
    longitude: "",
    phone: "",
    email: "",
    website: "",
    affiliate_url: "",
    affiliate_provider: "",
    amenities_csv: "",
    total_rooms: "",
    check_in_time: "",
    check_out_time: "",
    seo_title: "",
    seo_description: "",
    seo_keywords_csv: "",
    seo_h1: "",
    geo_summary: "",
    geo_key_facts_csv: "",
    geo_faq_json: "",
  };
}

function hotelToValues(hotel: Hotel): FormValues {
  return {
    name: hotel.name ?? "",
    slug: hotel.slug ?? "",
    chain_name: hotel.chain_name ?? "",
    hotel_type: hotel.hotel_type ?? "",
    description: hotel.description ?? "",
    short_description: hotel.short_description ?? "",
    star_rating: hotel.star_rating ?? "",
    price_range: (hotel.price_range ?? "") as FormValues["price_range"],
    avg_nightly_rate: hotel.avg_nightly_rate ?? "",
    image_url: hotel.image_url ?? "",
    is_featured: hotel.is_featured ?? false,
    is_active: hotel.is_active ?? true,
    address: hotel.address ?? "",
    city: hotel.city ?? "Des Moines",
    state: hotel.state ?? "IA",
    zip: hotel.zip ?? "",
    area: hotel.area ?? "",
    latitude: hotel.latitude ?? "",
    longitude: hotel.longitude ?? "",
    phone: hotel.phone ?? "",
    email: hotel.email ?? "",
    website: hotel.website ?? "",
    affiliate_url: hotel.affiliate_url ?? "",
    affiliate_provider: hotel.affiliate_provider ?? "",
    amenities_csv: arrayToCsv(hotel.amenities),
    total_rooms: hotel.total_rooms ?? "",
    check_in_time: hotel.check_in_time ?? "",
    check_out_time: hotel.check_out_time ?? "",
    seo_title: hotel.seo_title ?? "",
    seo_description: hotel.seo_description ?? "",
    seo_keywords_csv: arrayToCsv(hotel.seo_keywords),
    seo_h1: hotel.seo_h1 ?? "",
    geo_summary: hotel.geo_summary ?? "",
    geo_key_facts_csv: arrayToCsv(hotel.geo_key_facts),
    geo_faq_json: hotel.geo_faq ? JSON.stringify(hotel.geo_faq, null, 2) : "",
  };
}

async function uploadImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const key = `hotels/${crypto.randomUUID()}.${ext}`;
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

export default function HotelEditDialog({
  open,
  onOpenChange,
  hotel,
  onSaved,
}: HotelEditDialogProps) {
  const isEdit = hotel !== null;
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("basics");

  const defaultValues = useMemo<FormValues>(
    () => (hotel ? hotelToValues(hotel) : emptyDefaults()),
    [hotel],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
    mode: "onBlur",
  });

  // Reset whenever the dialog opens with a different hotel.
  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
      setActiveTab("basics");
    }
  }, [open, defaultValues, form]);

  const name = form.watch("name");
  const imageUrl = form.watch("image_url");

  // Auto-slug on create only; once edited or in edit mode, stop suggesting.
  const [slugTouched, setSlugTouched] = useState(false);
  useEffect(() => {
    if (!isEdit && !slugTouched && name) {
      form.setValue("slug", slugify(name), { shouldValidate: false });
    }
  }, [name, slugTouched, isEdit, form]);

  async function handleFileUpload(file: File) {
    setUploading(true);
    try {
      const url = await uploadImage(file);
      form.setValue("image_url", url, { shouldDirty: true });
      toast.success("Image uploaded");
    } catch (err) {
      handleError(err, { component: "HotelEditDialog", action: "uploadImage" });
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

      // Geocode-on-save: only when both lat/lng are blank but address is set.
      if (lat == null && lng == null && values.address) {
        const fullAddress = [
          values.address,
          values.city,
          values.state,
          values.zip,
        ]
          .filter(Boolean)
          .join(", ");
        const geo = await geocodeAddress(fullAddress);
        if (geo) {
          lat = geo.latitude;
          lng = geo.longitude;
          toast.info(`Geocoded to ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      }

      const payload: HotelInsert = {
        name: values.name,
        slug: values.slug,
        address: values.address,
        chain_name: values.chain_name || null,
        hotel_type: values.hotel_type || null,
        description: values.description || null,
        short_description: values.short_description || null,
        star_rating:
          values.star_rating === "" || values.star_rating == null
            ? null
            : (values.star_rating as number),
        price_range: values.price_range || null,
        avg_nightly_rate:
          values.avg_nightly_rate === "" || values.avg_nightly_rate == null
            ? null
            : (values.avg_nightly_rate as number),
        image_url: values.image_url || null,
        is_featured: values.is_featured,
        is_active: values.is_active,
        city: values.city || "Des Moines",
        state: values.state || "IA",
        zip: values.zip || null,
        area: values.area || null,
        latitude: lat,
        longitude: lng,
        phone: values.phone || null,
        email: values.email || null,
        website: values.website || null,
        affiliate_url: values.affiliate_url || null,
        affiliate_provider: values.affiliate_provider || null,
        amenities: csvToArray(values.amenities_csv),
        total_rooms:
          values.total_rooms === "" || values.total_rooms == null
            ? null
            : (values.total_rooms as number),
        check_in_time: values.check_in_time || null,
        check_out_time: values.check_out_time || null,
        seo_title: values.seo_title || null,
        seo_description: values.seo_description || null,
        seo_keywords: csvToArray(values.seo_keywords_csv),
        seo_h1: values.seo_h1 || null,
        geo_summary: values.geo_summary || null,
        geo_key_facts: csvToArray(values.geo_key_facts_csv),
        geo_faq: values.geo_faq_json
          ? (JSON.parse(values.geo_faq_json) as Database["public"]["Tables"]["hotels"]["Row"]["geo_faq"])
          : null,
      };

      if (isEdit && hotel) {
        const { error } = await supabase
          .from("hotels")
          .update(payload)
          .eq("id", hotel.id);
        if (error) throw error;
        toast.success("Hotel updated");
      } else {
        const { error } = await supabase.from("hotels").insert(payload);
        if (error) throw error;
        toast.success("Hotel created");
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      handleError(err, { component: "HotelEditDialog", action: "save" });
      const message = err instanceof Error ? err.message : "Save failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${hotel?.name}` : "New hotel"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update hotel details, SEO and GEO blocks."
              : "Create a new hotel. Slug is generated from the name; lat/lng auto-fill from the address on save if left blank."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-5 w-full">
              <TabsTrigger value="basics">Basics</TabsTrigger>
              <TabsTrigger value="location">Location</TabsTrigger>
              <TabsTrigger value="amenities">Amenities</TabsTrigger>
              <TabsTrigger value="seo">SEO</TabsTrigger>
              <TabsTrigger value="geo">GEO</TabsTrigger>
            </TabsList>

            {/* BASICS */}
            <TabsContent value="basics" className="space-y-3 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="h-name">Name *</Label>
                  <Input id="h-name" {...form.register("name")} />
                  {errors.name && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.name.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="h-slug">Slug *</Label>
                  <Input
                    id="h-slug"
                    {...form.register("slug", {
                      onChange: () => setSlugTouched(true),
                    })}
                  />
                  {errors.slug && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.slug.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="h-chain">Chain</Label>
                  <Input id="h-chain" {...form.register("chain_name")} />
                </div>
                <div>
                  <Label htmlFor="h-type">Type</Label>
                  <Input
                    id="h-type"
                    placeholder="boutique, downtown, resort…"
                    {...form.register("hotel_type")}
                  />
                </div>
                <div>
                  <Label htmlFor="h-stars">Star rating (1–5)</Label>
                  <Input
                    id="h-stars"
                    type="number"
                    step="0.1"
                    min="1"
                    max="5"
                    {...form.register("star_rating")}
                  />
                </div>
                <div>
                  <Label>Price range</Label>
                  <Select
                    value={form.watch("price_range") || ""}
                    onValueChange={(v) =>
                      form.setValue(
                        "price_range",
                        (v || "") as FormValues["price_range"],
                        { shouldDirty: true },
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRICE_RANGES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="h-rate">Avg nightly rate (USD)</Label>
                  <Input
                    id="h-rate"
                    type="number"
                    step="1"
                    min="0"
                    {...form.register("avg_nightly_rate")}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="h-short">Short description</Label>
                <Input
                  id="h-short"
                  maxLength={280}
                  {...form.register("short_description")}
                />
              </div>
              <div>
                <Label htmlFor="h-desc">Description</Label>
                <Textarea
                  id="h-desc"
                  rows={5}
                  {...form.register("description")}
                />
              </div>

              {/* Image */}
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
                      id="h-img-file"
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
                        document.getElementById("h-img-file")?.click()
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
                  Active (visible on public site)
                </label>
              </div>
            </TabsContent>

            {/* LOCATION */}
            <TabsContent value="location" className="space-y-3 mt-4">
              <div>
                <Label htmlFor="h-addr">Address *</Label>
                <Input id="h-addr" {...form.register("address")} />
                {errors.address && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.address.message}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label htmlFor="h-city">City</Label>
                  <Input id="h-city" {...form.register("city")} />
                </div>
                <div>
                  <Label htmlFor="h-state">State</Label>
                  <Input id="h-state" {...form.register("state")} />
                </div>
                <div>
                  <Label htmlFor="h-zip">Zip</Label>
                  <Input id="h-zip" {...form.register("zip")} />
                </div>
                <div>
                  <Label htmlFor="h-area">Area / neighborhood</Label>
                  <Input id="h-area" {...form.register("area")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="h-lat">Latitude</Label>
                  <Input
                    id="h-lat"
                    type="number"
                    step="0.0001"
                    {...form.register("latitude")}
                  />
                </div>
                <div>
                  <Label htmlFor="h-lng">Longitude</Label>
                  <Input
                    id="h-lng"
                    type="number"
                    step="0.0001"
                    {...form.register("longitude")}
                  />
                </div>
                <p className="col-span-2 text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Leave blank to auto-geocode from address on save.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="h-phone">Phone</Label>
                  <Input id="h-phone" {...form.register("phone")} />
                </div>
                <div>
                  <Label htmlFor="h-email">Email</Label>
                  <Input id="h-email" type="email" {...form.register("email")} />
                </div>
                <div>
                  <Label htmlFor="h-website">Website</Label>
                  <Input id="h-website" {...form.register("website")} />
                </div>
                <div>
                  <Label htmlFor="h-aff-url">Affiliate URL</Label>
                  <Input id="h-aff-url" {...form.register("affiliate_url")} />
                </div>
                <div>
                  <Label htmlFor="h-aff-prov">Affiliate provider</Label>
                  <Input
                    id="h-aff-prov"
                    placeholder="booking.com, expedia…"
                    {...form.register("affiliate_provider")}
                  />
                </div>
              </div>
            </TabsContent>

            {/* AMENITIES */}
            <TabsContent value="amenities" className="space-y-3 mt-4">
              <div>
                <Label htmlFor="h-amen">Amenities (comma-separated)</Label>
                <Textarea
                  id="h-amen"
                  rows={3}
                  placeholder="pool, gym, free wifi, breakfast, pet-friendly"
                  {...form.register("amenities_csv")}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="h-rooms">Total rooms</Label>
                  <Input
                    id="h-rooms"
                    type="number"
                    {...form.register("total_rooms")}
                  />
                </div>
                <div>
                  <Label htmlFor="h-cin">Check-in time</Label>
                  <Input
                    id="h-cin"
                    placeholder="3:00 PM"
                    {...form.register("check_in_time")}
                  />
                </div>
                <div>
                  <Label htmlFor="h-cout">Check-out time</Label>
                  <Input
                    id="h-cout"
                    placeholder="11:00 AM"
                    {...form.register("check_out_time")}
                  />
                </div>
              </div>
            </TabsContent>

            {/* SEO */}
            <TabsContent value="seo" className="space-y-3 mt-4">
              <div>
                <Label htmlFor="h-seot">SEO title</Label>
                <Input id="h-seot" maxLength={70} {...form.register("seo_title")} />
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
                <Label htmlFor="h-seod">SEO description</Label>
                <Textarea
                  id="h-seod"
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
                <Label htmlFor="h-seok">SEO keywords (comma-separated)</Label>
                <Input id="h-seok" {...form.register("seo_keywords_csv")} />
              </div>
              <div>
                <Label htmlFor="h-seoh1">H1 override</Label>
                <Input
                  id="h-seoh1"
                  placeholder="Defaults to hotel name"
                  {...form.register("seo_h1")}
                />
              </div>
            </TabsContent>

            {/* GEO */}
            <TabsContent value="geo" className="space-y-3 mt-4">
              <div>
                <Label htmlFor="h-geos">GEO summary</Label>
                <Textarea
                  id="h-geos"
                  rows={3}
                  placeholder="A short, AI-discoverable summary."
                  {...form.register("geo_summary")}
                />
              </div>
              <div>
                <Label htmlFor="h-geokf">Key facts (comma-separated)</Label>
                <Textarea
                  id="h-geokf"
                  rows={3}
                  placeholder="Free parking, Walking distance to skywalk, Pet-friendly"
                  {...form.register("geo_key_facts_csv")}
                />
              </div>
              <div>
                <Label htmlFor="h-geofaq">FAQ (JSON)</Label>
                <Textarea
                  id="h-geofaq"
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
              {isEdit ? "Save changes" : "Create hotel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
