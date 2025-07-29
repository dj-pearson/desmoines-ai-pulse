import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Switch } from "./ui/switch";
import { Badge } from "./ui/badge";
import { CalendarIcon, Save, X, Plus, Trash2 } from "lucide-react";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ContentType = "event" | "restaurant" | "attraction" | "playground" | "restaurant_opening";

interface ContentEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentType: ContentType;
  item: any;
  onSave: () => void;
}

const fieldConfigs = {
  event: {
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "location", label: "Location", type: "text", required: true },
      { key: "venue", label: "Venue", type: "text" },
      { key: "date", label: "Date", type: "datetime" },
      { key: "price", label: "Price", type: "text" },
      { key: "category", label: "Category", type: "select", options: ["General", "Art", "Sports", "Music", "Food", "Entertainment"] },
      { key: "original_description", label: "Original Description", type: "textarea" },
      { key: "enhanced_description", label: "Enhanced Description", type: "textarea" },
      { key: "image_url", label: "Image URL", type: "url" },
      { key: "source_url", label: "Source URL", type: "url" },
      { key: "is_featured", label: "Featured", type: "boolean" },
      { key: "is_enhanced", label: "Enhanced", type: "boolean" },
    ]
  },
  restaurant: {
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "location", label: "Location", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "website", label: "Website", type: "url" },
      { key: "cuisine", label: "Cuisine", type: "text" },
      { key: "price_range", label: "Price Range", type: "select", options: ["$", "$$", "$$$", "$$$$"] },
      { key: "description", label: "Description", type: "textarea" },
      { key: "rating", label: "Rating", type: "number", min: 0, max: 5, step: 0.1 },
      { key: "image_url", label: "Image URL", type: "url" },
      { key: "opening_date", label: "Opening Date (Exact)", type: "date" },
      { key: "opening_timeframe", label: "Opening Timeframe (e.g., Summer 2025)", type: "text" },
      { key: "status", label: "Status", type: "select", options: ["open", "opening_soon", "newly_opened", "announced", "closed"] },
      { key: "is_featured", label: "Featured", type: "boolean" },
    ]
  },
  attraction: {
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "location", label: "Location", type: "text" },
      { key: "website", label: "Website", type: "url" },
      { key: "type", label: "Type", type: "select", options: ["Museum", "Park", "Entertainment", "Historic", "Cultural", "Natural", "Other"] },
      { key: "description", label: "Description", type: "textarea" },
      { key: "rating", label: "Rating", type: "number", min: 0, max: 5, step: 0.1 },
      { key: "image_url", label: "Image URL", type: "url" },
      { key: "is_featured", label: "Featured", type: "boolean" },
    ]
  },
  playground: {
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "location", label: "Location", type: "text" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "age_range", label: "Age Range", type: "select", options: ["0-2 years", "2-5 years", "5-12 years", "All Ages"] },
      { key: "amenities", label: "Amenities", type: "array" },
      { key: "rating", label: "Rating", type: "number", min: 0, max: 5, step: 0.1 },
      { key: "image_url", label: "Image URL", type: "url" },
      { key: "is_featured", label: "Featured", type: "boolean" },
    ]
  },
  restaurant_opening: {
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "location", label: "Location", type: "text" },
      { key: "cuisine", label: "Cuisine", type: "text" },
      { key: "opening_date", label: "Opening Date (Exact)", type: "date" },
      { key: "opening_timeframe", label: "Opening Timeframe (e.g., Summer 2025)", type: "text" },
      { key: "status", label: "Status", type: "select", options: ["open", "opening_soon", "newly_opened", "announced", "closed"] },
      { key: "description", label: "Description", type: "textarea" },
      { key: "source_url", label: "Source URL", type: "url" },
    ]
  }
};

export default function ContentEditDialog({
  open,
  onOpenChange,
  contentType,
  item,
  onSave
}: ContentEditDialogProps) {
  const [formData, setFormData] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);
  const [newAmenity, setNewAmenity] = useState("");

  const config = fieldConfigs[contentType];

  useEffect(() => {
    if (item && open) {
      // Initialize form data with item values
      const initialData = { ...item };
      
      // Handle date formatting for date/datetime fields
      config.fields.forEach(field => {
        if ((field.type === "date" || field.type === "datetime") && initialData[field.key]) {
          initialData[field.key] = new Date(initialData[field.key]);
        }
        if (field.type === "array" && !initialData[field.key]) {
          initialData[field.key] = [];
        }
        // Ensure all configured fields exist in form data, even if null/undefined
        if (!(field.key in initialData)) {
          initialData[field.key] = null;
        }
      });
      
      console.log('Initialized form data:', initialData);
      setFormData(initialData);
    }
  }, [item, open, config.fields]);

  const handleFieldChange = (fieldKey: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [fieldKey]: value
    }));
  };

  const handleArrayAdd = (fieldKey: string) => {
    if (newAmenity.trim()) {
      setFormData(prev => ({
        ...prev,
        [fieldKey]: [...(prev[fieldKey] || []), newAmenity.trim()]
      }));
      setNewAmenity("");
    }
  };

  const handleArrayRemove = (fieldKey: string, index: number) => {
    setFormData(prev => ({
      ...prev,
      [fieldKey]: prev[fieldKey].filter((_: any, i: number) => i !== index)
    }));
  };

  const getTableName = (type: ContentType): 
    "restaurants" | "events" | "attractions" | "playgrounds" | "restaurant_openings" => {
    switch (type) {
      case 'restaurant': return 'restaurants';
      case 'event': return 'events';
      case 'attraction': return 'attractions';
      case 'playground': return 'playgrounds';
      case 'restaurant_opening': return 'restaurants'; // Restaurant openings are stored in restaurants table
      default: 
        throw new Error(`Unknown content type: ${type}`);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Prepare data for save
      const saveData = { ...formData };
      
      console.log('Original form data:', formData);
      console.log('Content type:', contentType);
      
      // Format dates properly
      config.fields.forEach(field => {
        if ((field.type === "date" || field.type === "datetime") && saveData[field.key]) {
          if (field.type === "date") {
            saveData[field.key] = format(saveData[field.key], 'yyyy-MM-dd');
          } else {
            saveData[field.key] = saveData[field.key].toISOString();
          }
        }
      });

      // Remove readonly fields
      delete saveData.id;
      delete saveData.created_at;
      delete saveData.updated_at;

      console.log('Save data after processing:', saveData);

      const tableName = getTableName(contentType);
      console.log('Table name:', tableName);
      console.log('Item ID:', item.id);

      // Let's first check if the record exists
      const { data: existingRecord, error: checkError } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', item.id)
        .maybeSingle();

      console.log('Existing record check:', { existingRecord, checkError });

      if (!existingRecord) {
        console.error('Record not found in table:', tableName);
        throw new Error(`Record with ID ${item.id} not found in ${tableName} table`);
      }

      console.log('Full existing record:', existingRecord);
      console.log('Fields we are trying to update:', Object.keys(saveData));
      console.log('Update values:', saveData);

      const { data: result, error } = await supabase
        .from(tableName)
        .update(saveData)
        .eq('id', item.id)
        .select();

      console.log('Supabase response:', { result, error });

      if (error) {
        console.error('Supabase error details:', error);
        throw error;
      }

      if (!result || result.length === 0) {
        console.error('No rows were updated! This suggests the ID was not found.');
        throw new Error('No rows were updated. The record may not exist.');
      }

      console.log('Save successful! Updated data:', result);
      toast.success(`${contentType.charAt(0).toUpperCase() + contentType.slice(1)} updated successfully!`);
      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const renderField = (field: any) => {
    const value = formData[field.key];

    switch (field.type) {
      case "text":
      case "url":
        return (
          <Input
            value={value || ""}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            required={field.required}
          />
        );

      case "number":
        return (
          <Input
            type="number"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.key, parseFloat(e.target.value) || 0)}
            min={field.min}
            max={field.max}
            step={field.step}
            placeholder={`Enter ${field.label.toLowerCase()}`}
          />
        );

      case "textarea":
        return (
          <Textarea
            value={value || ""}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            rows={3}
          />
        );

      case "select":
        return (
          <Select
            value={value || ""}
            onValueChange={(val) => handleFieldChange(field.key, val)}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option: string) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "boolean":
        return (
          <div className="flex items-center space-x-2">
            <Switch
              checked={value || false}
              onCheckedChange={(checked) => handleFieldChange(field.key, checked)}
            />
            <Label>{value ? "Yes" : "No"}</Label>
          </div>
        );

      case "date":
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !value && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {value ? format(value, "PPP") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={value}
                onSelect={(date) => handleFieldChange(field.key, date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        );

      case "datetime":
        return (
          <div className="space-y-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !value && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {value ? format(value, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={value}
                  onSelect={(date) => {
                    if (date) {
                      const currentTime = value || new Date();
                      date.setHours(currentTime.getHours(), currentTime.getMinutes());
                      handleFieldChange(field.key, date);
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <div className="flex gap-2">
              <Input
                type="time"
                value={value ? format(value, "HH:mm") : ""}
                onChange={(e) => {
                  const [hours, minutes] = e.target.value.split(':');
                  const newDate = value ? new Date(value) : new Date();
                  newDate.setHours(parseInt(hours), parseInt(minutes));
                  handleFieldChange(field.key, newDate);
                }}
              />
            </div>
          </div>
        );

      case "array":
        return (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={newAmenity}
                onChange={(e) => setNewAmenity(e.target.value)}
                placeholder="Add new amenity"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleArrayAdd(field.key);
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                onClick={() => handleArrayAdd(field.key)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(value || []).map((item: string, index: number) => (
                <Badge key={index} variant="secondary" className="flex items-center gap-1">
                  {item}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-4 w-4 p-0"
                    onClick={() => handleArrayRemove(field.key, index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          </div>
        );

      default:
        return (
          <Input
            value={value || ""}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={`Enter ${field.label.toLowerCase()}`}
          />
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Edit {contentType.charAt(0).toUpperCase() + contentType.slice(1).replace('_', ' ')}
          </DialogTitle>
          <DialogDescription>
            Make changes to this {contentType.replace('_', ' ')} record. Click save when you're done.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {config.fields.map((field) => (
            <div key={field.key} className="grid gap-2">
              <Label htmlFor={field.key} className="text-sm font-medium">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </Label>
              {renderField(field)}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isLoading}
          >
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}