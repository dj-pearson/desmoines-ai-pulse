import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { CalendarIcon, X, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { useScrollPreservation } from "@/hooks/useScrollPreservation";

interface EventEditorProps {
  event: any;
  onSave: (event: any) => void;
  onClose: () => void;
}

export default function EventEditor({
  event,
  onSave,
  onClose,
}: EventEditorProps) {
  const { preserveScrollPosition } = useScrollPreservation();
  const [formData, setFormData] = useState({
    title: event.title || "",
    original_description: event.original_description || "",
    enhanced_description: event.enhanced_description || "",
    date: new Date(event.date),
    location: event.location || "",
    venue: event.venue || "",
    category: event.category || "",
    price: event.price || "",
    source_url: event.source_url || "",
    is_featured: event.is_featured || false,
    is_enhanced: event.is_enhanced || false,
  });

  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const categories = [
    "Art",
    "Sports",
    "Music",
    "Food",
    "Entertainment",
    "Community Event",
    "Theater",
    "Festival",
    "Business",
    "Education",
    "Family",
    "Health",
    "General",
  ];

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    const updatedEvent = {
      ...event,
      ...formData,
      date: formData.date.toISOString(),
    };
    
    await preserveScrollPosition(async () => {
      onSave(updatedEvent);
    });
  };

  const isProblemEvent = () => {
    const title = formData.title.toLowerCase();
    const problemIndicators = [
      "event from",
      title.includes("aug") && new Date().getMonth() !== 7, // August issues
      formData.date.getFullYear() < new Date().getFullYear(),
      formData.date.getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000, // More than a week old
    ];
    return problemIndicators.some(Boolean);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              Edit Event
              {isProblemEvent() && (
                <Badge variant="destructive" className="text-xs">
                  Needs Attention
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Update event information that was incorrectly scraped
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Problem Indicators */}
          {isProblemEvent() && (
            <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg">
              <h4 className="font-medium text-orange-800 mb-2">
                Potential Issues Detected:
              </h4>
              <ul className="text-sm text-orange-700 space-y-1">
                {formData.title.toLowerCase().includes("event from") && (
                  <li>
                    • Generic title detected - consider updating with specific
                    event name
                  </li>
                )}
                {formData.date.getTime() <
                  Date.now() - 7 * 24 * 60 * 60 * 1000 && (
                  <li>• Event date appears to be in the past</li>
                )}
                {formData.date.getFullYear() < new Date().getFullYear() && (
                  <li>• Event year appears incorrect</li>
                )}
              </ul>
            </div>
          )}

          {/* Source URL */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Source:</span>
            <a
              href={formData.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-600 hover:underline"
            >
              {new URL(formData.source_url).hostname}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Title */}
            <div className="md:col-span-2">
              <Label htmlFor="title">Event Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange("title", e.target.value)}
                placeholder="e.g., Iowa Cubs vs Indianapolis Indians, 2025 Warren County Fair"
                className={
                  formData.title.toLowerCase().includes("event from")
                    ? "border-orange-500"
                    : ""
                }
              />
              {formData.title.toLowerCase().includes("event from") && (
                <p className="text-sm text-orange-600 mt-1">
                  Consider replacing with the actual event name
                </p>
              )}
            </div>

            {/* Date */}
            <div>
              <Label>Event Date *</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={`w-full justify-start text-left font-normal ${
                      formData.date.getTime() <
                      Date.now() - 7 * 24 * 60 * 60 * 1000
                        ? "border-orange-500"
                        : ""
                    }`}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(formData.date, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.date}
                    onSelect={(date) => {
                      if (date) {
                        handleInputChange("date", date);
                        setDatePickerOpen(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Category */}
            <div>
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => handleInputChange("category", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Location */}
            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => handleInputChange("location", e.target.value)}
                placeholder="e.g., Des Moines, IA"
              />
            </div>

            {/* Venue */}
            <div>
              <Label htmlFor="venue">Venue</Label>
              <Input
                id="venue"
                value={formData.venue}
                onChange={(e) => handleInputChange("venue", e.target.value)}
                placeholder="e.g., Principal Park, Wells Fargo Arena"
              />
            </div>

            {/* Price */}
            <div>
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                value={formData.price}
                onChange={(e) => handleInputChange("price", e.target.value)}
                placeholder="e.g., $15-$25, Free admission"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Original Description</Label>
            <Textarea
              id="description"
              value={formData.original_description}
              onChange={(e) =>
                handleInputChange("original_description", e.target.value)
              }
              placeholder="Event description as scraped from the source"
              rows={3}
            />
          </div>

          {/* Enhanced Description */}
          {formData.is_enhanced && (
            <div>
              <Label htmlFor="enhanced_description">
                AI Enhanced Description
              </Label>
              <Textarea
                id="enhanced_description"
                value={formData.enhanced_description}
                onChange={(e) =>
                  handleInputChange("enhanced_description", e.target.value)
                }
                placeholder="AI-enhanced description"
                rows={3}
              />
            </div>
          )}

          {/* Toggles */}
          <div className="flex items-center gap-6">
            <div className="flex items-center space-x-2">
              <Switch
                id="featured"
                checked={formData.is_featured}
                onCheckedChange={(checked) =>
                  handleInputChange("is_featured", checked)
                }
              />
              <Label htmlFor="featured">Featured Event</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="enhanced"
                checked={formData.is_enhanced}
                onCheckedChange={(checked) =>
                  handleInputChange("is_enhanced", checked)
                }
              />
              <Label htmlFor="enhanced">AI Enhanced</Label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Changes</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
