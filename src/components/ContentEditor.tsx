import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Switch } from "./ui/switch";
import { X } from "lucide-react";

type ContentType = "event" | "restaurant" | "attraction" | "playground" | "restaurant_opening";

interface ContentEditorProps {
  type: ContentType;
  item: any;
  onSave: (item: any) => void;
  onClose: () => void;
}

const fieldConfigs = {
  event: {
    title: "Edit Event",
    description: "Update event information",
    fields: [
      { key: "title", label: "Event Title", type: "input", required: true },
      { key: "original_description", label: "Description", type: "textarea" },
      { key: "date", label: "Event Date", type: "datetime-local", required: true },
      { key: "location", label: "Location", type: "input" },
      { key: "venue", label: "Venue", type: "input" },
      { key: "category", label: "Category", type: "select", options: ["Art", "Sports", "Music", "Food", "Entertainment", "Community Event", "Theater", "Festival", "Business", "Education", "Family", "Health", "General"] },
      { key: "price", label: "Price", type: "input" },
      { key: "source_url", label: "Source URL", type: "input" },
      { key: "is_featured", label: "Featured", type: "switch" },
      { key: "is_enhanced", label: "AI Enhanced", type: "switch" },
    ]
  },
  restaurant: {
    title: "Edit Restaurant",
    description: "Update restaurant information",
    fields: [
      { key: "name", label: "Restaurant Name", type: "input", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "location", label: "Location", type: "input" },
      { key: "cuisine", label: "Cuisine Type", type: "input" },
      { key: "price_range", label: "Price Range", type: "select", options: ["$", "$$", "$$$", "$$$$"] },
      { key: "phone", label: "Phone", type: "input" },
      { key: "website", label: "Website", type: "input" },
      { key: "rating", label: "Rating", type: "number", min: 0, max: 5, step: 0.1 },
      { key: "image_url", label: "Image URL", type: "input" },
      { key: "opening_date", label: "Opening Date", type: "date" },
      { key: "status", label: "Status", type: "select", options: ["open", "opening_soon", "newly_opened", "announced", "closed"] },
      { key: "source_url", label: "Source URL", type: "input" },
      { key: "is_featured", label: "Featured", type: "switch" },
    ]
  },
  attraction: {
    title: "Edit Attraction",
    description: "Update attraction information",
    fields: [
      { key: "name", label: "Attraction Name", type: "input", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "location", label: "Location", type: "input" },
      { key: "type", label: "Type", type: "input" },
      { key: "website", label: "Website", type: "input" },
      { key: "rating", label: "Rating", type: "number", min: 0, max: 5, step: 0.1 },
      { key: "image_url", label: "Image URL", type: "input" },
      { key: "is_featured", label: "Featured", type: "switch" },
    ]
  },
  playground: {
    title: "Edit Playground",
    description: "Update playground information",
    fields: [
      { key: "name", label: "Playground Name", type: "input", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "location", label: "Location", type: "input" },
      { key: "age_range", label: "Age Range", type: "select", options: ["0-2", "2-5", "5-12", "All Ages"] },
      { key: "rating", label: "Rating", type: "number", min: 0, max: 5, step: 0.1 },
      { key: "image_url", label: "Image URL", type: "input" },
      { key: "is_featured", label: "Featured", type: "switch" },
    ]
  },
  restaurant_opening: {
    title: "Edit Restaurant Opening",
    description: "Update restaurant opening information",
    fields: [
      { key: "name", label: "Restaurant Name", type: "input", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "location", label: "Location", type: "input" },
      { key: "cuisine", label: "Cuisine Type", type: "input" },
      { key: "opening_date", label: "Opening Date", type: "date" },
      { key: "status", label: "Status", type: "select", options: ["announced", "opening_soon", "soft_opening", "open", "delayed", "cancelled"] },
      { key: "source_url", label: "Source URL", type: "input" },
    ]
  }
};

export default function ContentEditor({ type, item, onSave, onClose }: ContentEditorProps) {
  const config = fieldConfigs[type];
  const [formData, setFormData] = useState(() => {
    const initialData: any = {};
    config.fields.forEach(field => {
      if (field.type === "datetime-local" && item[field.key]) {
        // Convert ISO string to datetime-local format
        const date = new Date(item[field.key]);
        initialData[field.key] = date.toISOString().slice(0, 16);
      } else if (field.type === "date" && item[field.key]) {
        // Convert date to YYYY-MM-DD format
        const date = new Date(item[field.key]);
        initialData[field.key] = date.toISOString().slice(0, 10);
      } else {
        initialData[field.key] = item[field.key] ?? "";
      }
    });
    return initialData;
  });

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = () => {
    const updatedItem = { ...item };
    
    // Process form data
    config.fields.forEach(field => {
      if (field.type === "datetime-local" && formData[field.key]) {
        // Convert back to ISO string
        updatedItem[field.key] = new Date(formData[field.key]).toISOString();
      } else if (field.type === "date" && formData[field.key]) {
        // Keep as date string
        updatedItem[field.key] = formData[field.key];
      } else if (field.type === "number") {
        updatedItem[field.key] = formData[field.key] ? parseFloat(formData[field.key]) : null;
      } else {
        updatedItem[field.key] = formData[field.key];
      }
    });

    onSave(updatedItem);
  };

  const renderField = (field: any) => {
    const value = formData[field.key];

    switch (field.type) {
      case "input":
        return (
          <Input
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
          />
        );
      
      case "textarea":
        return (
          <Textarea
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            rows={3}
          />
        );
      
      case "select":
        return (
          <Select
            value={value}
            onValueChange={(newValue) => handleInputChange(field.key, newValue)}
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
      
      case "number":
      case "date":
      case "datetime-local":
        return (
          <Input
            type={field.type}
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            min={field.min}
            max={field.max}
            step={field.step}
          />
        );
      
      case "switch":
        return (
          <Switch
            checked={value}
            onCheckedChange={(checked) => handleInputChange(field.key, checked)}
          />
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>{config.title}</CardTitle>
            <CardDescription>{config.description}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {config.fields.map((field) => (
              <div 
                key={field.key} 
                className={field.type === "textarea" ? "md:col-span-2" : ""}
              >
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                <div className={field.type === "switch" ? "flex items-center mt-2" : "mt-2"}>
                  {renderField(field)}
                  {field.type === "switch" && (
                    <Label htmlFor={field.key} className="ml-2">
                      {field.label}
                    </Label>
                  )}
                </div>
              </div>
            ))}
          </div>

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
