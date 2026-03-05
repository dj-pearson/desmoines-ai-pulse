import { useState, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Card, CardContent } from "./ui/card";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { CalendarIcon, X, Plus, Info, Upload, ImageIcon, Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useSubmitEvent, useUpdateEvent, type UserSubmittedEvent } from "@/hooks/useUserSubmittedEvents";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { toast } from "sonner";
import { createLogger } from '@/lib/logger';
import { FormErrorSummary, useFormErrors } from "./ui/form-error-summary";

const log = createLogger('EventSubmissionForm');

const EVENT_CATEGORIES = [
  "Art & Culture",
  "Business & Networking",
  "Entertainment",
  "Family & Kids",
  "Food & Dining",
  "Health & Wellness",
  "Music & Concerts",
  "Nightlife",
  "Outdoor & Recreation",
  "Sports & Fitness",
  "Shopping",
  "Education & Learning",
  "Community Service",
  "Other"
];

const POPULAR_TAGS = [
  "Free",
  "Family Friendly",
  "Live Music",
  "Food & Drink",
  "Outdoor",
  "Downtown",
  "Art",
  "Fitness",
  "Networking",
  "Festival",
  "Workshop",
  "Concert"
];

interface EventSubmissionFormProps {
  onSuccess?: () => void;
  editEvent?: UserSubmittedEvent;
}

export default function EventSubmissionForm({ onSuccess, editEvent }: EventSubmissionFormProps) {
  const isEditing = !!editEvent;
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    editEvent?.date ? new Date(editEvent.date) : undefined
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(editEvent?.tags || []);
  const [customTag, setCustomTag] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(editEvent?.image_url || null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string>(editEvent?.image_url || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, formState: { errors, isSubmitted }, setValue, watch, reset, setFocus } = useForm({
    defaultValues: editEvent ? {
      title: editEvent.title,
      description: editEvent.description || '',
      category: editEvent.category || '',
      start_time: editEvent.start_time || '',
      end_time: editEvent.end_time || '',
      venue: editEvent.venue || '',
      location: editEvent.location || '',
      address: editEvent.address || '',
      price: editEvent.price || '',
      website_url: editEvent.website_url || '',
      contact_email: editEvent.contact_email || '',
      contact_phone: editEvent.contact_phone || '',
      image_url: editEvent.image_url || '',
    } : undefined,
  });
  const submitEvent = useSubmitEvent();
  const updateEvent = useUpdateEvent();
  const { upload, isUploading, progress, error: uploadError } = useMediaUpload();

  const formErrors = useFormErrors(errors as Record<string, { message?: string } | undefined>);

  const focusField = useCallback((field: string) => {
    try {
      setFocus(field as any);
    } catch {
      const el = document.getElementById(field);
      el?.focus();
    }
  }, [setFocus]);

  const addTag = (tag: string) => {
    if (tag && !selectedTags.includes(tag)) {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const removeTag = (tag: string) => {
    setSelectedTags(selectedTags.filter(t => t !== tag));
  };

  const addCustomTag = () => {
    if (customTag.trim()) {
      addTag(customTag.trim());
      setCustomTag("");
    }
  };

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show local preview immediately
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);

    try {
      const result = await upload(file, {
        bucket: 'event-photos',
        contentType: 'event',
        maxWidth: 1200,
        maxHeight: 800,
        quality: 0.85,
        altText: `Event image`,
      });
      setUploadedImageUrl(result.url);
      setValue("image_url", result.url);
      toast.success("Image uploaded successfully!");
    } catch (err) {
      setImagePreview(editEvent?.image_url || null);
      setUploadedImageUrl(editEvent?.image_url || '');
      toast.error(err instanceof Error ? err.message : "Failed to upload image");
    }
  }, [upload, setValue, editEvent]);

  const handleRemoveImage = () => {
    setImagePreview(null);
    setUploadedImageUrl('');
    setValue("image_url", '');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const onSubmit = async (data: any) => {
    try {
      const eventData = {
        ...data,
        date: selectedDate?.toISOString(),
        tags: selectedTags,
        image_url: uploadedImageUrl || data.image_url || null,
      };

      if (isEditing && editEvent) {
        await updateEvent.mutateAsync({
          id: editEvent.id,
          ...eventData,
          status: 'pending',
          admin_notes: undefined,
        });
        toast.success("Event updated and resubmitted for review!");
      } else {
        await submitEvent.mutateAsync(eventData);
        toast.success("Event submitted successfully!");
      }

      // Reset form
      reset();
      setSelectedDate(undefined);
      setSelectedTags([]);
      setCustomTag("");
      setImagePreview(null);
      setUploadedImageUrl('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      onSuccess?.();
    } catch (error) {
      log.error('submit', 'Error submitting event', { data: error });
      toast.error("Failed to submit event. Please try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          {isEditing
            ? "Update your event details below. Once saved, it will be resubmitted for review."
            : "All events are reviewed within 48 hours. We'll email you when your event is approved or if we need more information."}
        </AlertDescription>
      </Alert>

      {isSubmitted && formErrors.length > 0 && (
        <FormErrorSummary errors={formErrors} onFieldClick={focusField} />
      )}

      {/* Basic Information */}
      <Card>
        <CardContent className="pt-6">
          <fieldset className="border-0 p-0 m-0">
            <legend className="text-lg font-semibold mb-4">Basic Information</legend>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="title">Event Title *</Label>
                <Input
                  id="title"
                  {...register("title", { required: "Event title is required" })}
                  placeholder="e.g., Summer Jazz in the Park"
                  aria-invalid={!!errors.title}
                  aria-describedby={errors.title ? "title-error" : undefined}
                />
                {errors.title && (
                  <p id="title-error" className="text-sm text-red-500 mt-1" role="alert">{errors.title.message as string}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  {...register("description", { required: "Please describe your event" })}
                  placeholder="Tell people what your event is about, what to expect, who should attend..."
                  rows={5}
                  aria-invalid={!!errors.description}
                  aria-describedby={errors.description ? "description-error" : undefined}
                />
                {errors.description && (
                  <p id="description-error" className="text-sm text-red-500 mt-1" role="alert">{errors.description.message as string}</p>
                )}
              </div>

              <div>
                <Label htmlFor="category">Category *</Label>
                <Select defaultValue={editEvent?.category || undefined} onValueChange={(value) => setValue("category", value)}>
                  <SelectTrigger aria-invalid={!!errors.category} aria-describedby={errors.category ? "category-error" : undefined}>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.category && (
                  <p id="category-error" className="text-sm text-red-500 mt-1" role="alert">Please select a category</p>
                )}
              </div>

              <div>
                <Label>Event Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label htmlFor="start_time">Start Time</Label>
                <Input
                  id="start_time"
                  type="time"
                  {...register("start_time")}
                />
              </div>

              <div>
                <Label htmlFor="end_time">End Time</Label>
                <Input
                  id="end_time"
                  type="time"
                  {...register("end_time")}
                />
              </div>
            </div>
          </fieldset>
        </CardContent>
      </Card>

      {/* Location Information */}
      <Card>
        <CardContent className="pt-6">
          <fieldset className="border-0 p-0 m-0">
            <legend className="text-lg font-semibold mb-4">Location Information</legend>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="venue">Venue Name *</Label>
                <Input
                  id="venue"
                  {...register("venue", { required: "Venue name is required" })}
                  placeholder="e.g., Downtown Des Moines Park"
                  aria-invalid={!!errors.venue}
                  aria-describedby={errors.venue ? "venue-error" : undefined}
                />
                {errors.venue && (
                  <p id="venue-error" className="text-sm text-red-500 mt-1" role="alert">{errors.venue.message as string}</p>
                )}
              </div>

              <div>
                <Label htmlFor="location">City/Area</Label>
                <Input
                  id="location"
                  {...register("location")}
                  placeholder="e.g., Des Moines, West Des Moines"
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="address">Full Address</Label>
                <Input
                  id="address"
                  {...register("address")}
                  placeholder="123 Main St, Des Moines, IA 50309"
                  autoComplete="street-address"
                />
              </div>
            </div>
          </fieldset>
        </CardContent>
      </Card>

      {/* Event Image */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold mb-4">Event Image</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Upload an image for your event. Accepted formats: JPG, PNG, WebP (max 5MB).
          </p>

          {imagePreview ? (
            <div className="relative">
              <img
                src={imagePreview}
                alt="Event image preview"
                className="w-full h-48 object-cover rounded-lg border"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2"
                onClick={handleRemoveImage}
                disabled={isUploading}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remove
              </Button>
              {isUploading && (
                <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                  <div className="text-center text-white">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm">
                      Uploading... {progress ? `${Math.round(progress.percentage)}%` : ''}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              aria-label="Upload event image"
            >
              <ImageIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">Click to upload an image</p>
              <p className="text-xs text-muted-foreground">JPG, PNG, or WebP up to 5MB</p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            className="hidden"
            onChange={handleImageUpload}
          />

          {uploadError && (
            <p className="text-sm text-red-500 mt-2">{uploadError}</p>
          )}

          {/* Fallback: paste URL */}
          <div className="mt-4">
            <Label htmlFor="image_url_manual" className="text-sm text-muted-foreground">
              Or paste an image URL
            </Label>
            <Input
              id="image_url_manual"
              type="url"
              {...register("image_url")}
              placeholder="https://example.com/your-event-image.jpg"
              onChange={(e) => {
                register("image_url").onChange(e);
                if (e.target.value && !uploadedImageUrl) {
                  setImagePreview(e.target.value);
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Additional Details */}
      <Card>
        <CardContent className="pt-6">
          <fieldset className="border-0 p-0 m-0">
            <legend className="text-lg font-semibold mb-4">Additional Details</legend>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="price">Price/Cost</Label>
                <Input
                  id="price"
                  {...register("price")}
                  placeholder="e.g., Free, $10, $5-15"
                />
              </div>

              <div>
                <Label htmlFor="website_url">Event Website or Ticket Link</Label>
                <Input
                  id="website_url"
                  type="url"
                  {...register("website_url")}
                  placeholder="https://yourwebsite.com/tickets"
                  autoComplete="url"
                />
              </div>

              <div>
                <Label htmlFor="contact_email">Contact Email</Label>
                <Input
                  id="contact_email"
                  type="email"
                  {...register("contact_email")}
                  placeholder="contact@yourevent.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <Label htmlFor="contact_phone">Contact Phone</Label>
                <Input
                  id="contact_phone"
                  type="tel"
                  {...register("contact_phone")}
                  placeholder="(515) 555-0123"
                  autoComplete="tel"
                />
              </div>
            </div>
          </fieldset>
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardContent className="pt-6">
          <fieldset className="border-0 p-0 m-0">
          <legend className="text-lg font-semibold mb-4">Tags</legend>
          <p className="text-sm text-muted-foreground mb-4">
            Add tags to help people find your event
          </p>

          {/* Popular Tags */}
          <div className="mb-4">
            <Label className="text-sm font-medium mb-2 block">Popular Tags</Label>
            <div className="flex flex-wrap gap-2">
              {POPULAR_TAGS.map((tag) => (
                <Button
                  key={tag}
                  type="button"
                  variant={selectedTags.includes(tag) ? "default" : "outline"}
                  size="sm"
                  onClick={() => selectedTags.includes(tag) ? removeTag(tag) : addTag(tag)}
                >
                  {tag}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Tags */}
          <div className="mb-4">
            <Label className="text-sm font-medium mb-2 block">Add Custom Tag</Label>
            <div className="flex gap-2">
              <Input
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                placeholder="Enter custom tag"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
              />
              <Button type="button" onClick={addCustomTag} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Selected Tags */}
          {selectedTags.length > 0 && (
            <div>
              <Label className="text-sm font-medium mb-2 block">Selected Tags</Label>
              <div className="flex flex-wrap gap-2">
                {selectedTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                    {tag}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 w-4 h-4"
                      onClick={() => removeTag(tag)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
          </fieldset>
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={submitEvent.isPending || updateEvent.isPending || isUploading}
          className="w-full sm:w-auto"
          size="lg"
        >
          {(submitEvent.isPending || updateEvent.isPending)
            ? "Submitting..."
            : isUploading
              ? "Uploading image..."
              : isEditing
                ? "Save Changes & Resubmit"
                : "Submit Event for Review"}
        </Button>
      </div>
    </form>
  );
}
