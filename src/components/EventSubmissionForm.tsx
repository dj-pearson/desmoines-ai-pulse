import { useState } from "react";
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
import { CalendarIcon, X, Plus, Info } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useSubmitEvent } from "@/hooks/useUserSubmittedEvents";
import { toast } from "sonner";
import { createLogger } from '@/lib/logger';

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
}

export default function EventSubmissionForm({ onSuccess }: EventSubmissionFormProps) {
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  
  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = useForm();
  const submitEvent = useSubmitEvent();

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

  const onSubmit = async (data: any) => {
    try {
      const eventData = {
        ...data,
        date: selectedDate?.toISOString(),
        tags: selectedTags,
      };

      await submitEvent.mutateAsync(eventData);
      
      // Reset form
      reset();
      setSelectedDate(undefined);
      setSelectedTags([]);
      setCustomTag("");
      
      toast.success("Event submitted successfully!");
      onSuccess?.();
    } catch (error) {
      log.error('Error submitting event', { action: 'onSubmit', metadata: { error } });
      toast.error("Failed to submit event. Please try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          All events are reviewed within 48 hours. We'll email you when your event is approved or if we need more information.
        </AlertDescription>
      </Alert>

      {/* Basic Information */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="title">Event Title *</Label>
              <Input
                id="title"
                {...register("title", { required: "Event title is required" })}
                placeholder="e.g., Summer Jazz in the Park"
              />
              {errors.title && (
                <p className="text-sm text-red-500 mt-1">{errors.title.message as string}</p>
              )}
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...register("description")}
                placeholder="Tell people what your event is about..."
                rows={4}
              />
            </div>

            <div>
              <Label htmlFor="category">Category *</Label>
              <Select onValueChange={(value) => setValue("category", value)}>
                <SelectTrigger>
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
                <p className="text-sm text-red-500 mt-1">Please select a category</p>
              )}
            </div>

            <div>
              <Label>Event Date</Label>
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
        </CardContent>
      </Card>

      {/* Location Information */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold mb-4">Location Information</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="venue">Venue Name</Label>
              <Input
                id="venue"
                {...register("venue")}
                placeholder="e.g., Downtown Des Moines Park"
              />
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
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Details */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold mb-4">Additional Details</h3>
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
              <Label htmlFor="website_url">Website URL</Label>
              <Input
                id="website_url"
                type="url"
                {...register("website_url")}
                placeholder="https://yourwebsite.com"
              />
            </div>

            <div>
              <Label htmlFor="contact_email">Contact Email</Label>
              <Input
                id="contact_email"
                type="email"
                {...register("contact_email")}
                placeholder="contact@yourevent.com"
              />
            </div>

            <div>
              <Label htmlFor="contact_phone">Contact Phone</Label>
              <Input
                id="contact_phone"
                type="tel"
                {...register("contact_phone")}
                placeholder="(515) 555-0123"
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="image_url">Event Image URL (optional)</Label>
              <Input
                id="image_url"
                type="url"
                {...register("image_url")}
                placeholder="https://example.com/your-event-image.jpg"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold mb-4">Tags</h3>
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
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTag())}
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
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button 
          type="submit" 
          disabled={submitEvent.isPending}
          className="w-full sm:w-auto"
        >
          {submitEvent.isPending ? "Submitting..." : "Submit Event for Review"}
        </Button>
      </div>
    </form>
  );
}
