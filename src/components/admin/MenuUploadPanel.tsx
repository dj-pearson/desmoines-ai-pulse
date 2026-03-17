import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Upload,
  FileImage,
  FileText,
  X,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Eye,
  Save,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { RestaurantMenuRow } from "./MenuUrlManager";

interface MenuUploadPanelProps {
  restaurants: RestaurantMenuRow[];
}

interface ExtractedSection {
  section_name: string;
  section_sort_order: number;
  items: ExtractedItem[];
}

interface ExtractedItem {
  item_name: string;
  item_description: string | null;
  price: string | null;
  price_numeric: number | null;
  dietary_tags: string[];
  is_popular: boolean;
}

type UploadStep = "select" | "preview" | "review" | "done";

const ACCEPTED = ".pdf,.jpg,.jpeg,.png";
const MAX_SIZE_MB = 10;

const DIETARY_LABELS: Record<string, string> = {
  vegan: "Vegan",
  vegetarian: "Vegetarian",
  "gluten-free": "GF",
  "dairy-free": "DF",
  spicy: "Spicy",
};

export function MenuUploadPanel({ restaurants }: MenuUploadPanelProps) {
  const queryClient = useQueryClient();
  const dropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<UploadStep>("select");
  const [restaurantId, setRestaurantId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<ExtractedSection[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const readFileAsBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]); // strip data-URL prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  const handleFile = useCallback(async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "jpg", "jpeg", "png"].includes(ext)) {
      toast.error("Unsupported file type. Use PDF, JPG, or PNG.");
      return;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`File too large. Maximum ${MAX_SIZE_MB}MB.`);
      return;
    }
    setFile(f);
    const b64 = await readFileAsBase64(f);
    setFileBase64(b64);
    setStep("preview");
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const parseMenu = async () => {
    if (!restaurantId || !fileBase64 || !file) {
      toast.error("Please select a restaurant and a menu file.");
      return;
    }
    setParsing(true);
    setSections([]);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() as string;
      const { data, error } = await supabase.functions.invoke("parse-menu-upload", {
        body: {
          restaurant_id: restaurantId,
          file_base64: fileBase64,
          file_type: ext,
          file_name: file.name,
          save_to_db: false,
        },
      });
      if (error) throw new Error(error.message);
      if (!data.success || !data.sections?.length) {
        toast.error("No menu items found in the file. Try a clearer scan or different file.");
        return;
      }
      setSections(data.sections);
      setExpandedSections(new Set(data.sections.map((s: ExtractedSection) => s.section_name)));
      setStep("review");
      toast.success(`Extracted ${data.items_count} items across ${data.sections.length} sections`);
    } catch (err) {
      toast.error(`Parsing failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setParsing(false);
    }
  };

  const saveMenu = async () => {
    if (!restaurantId || !fileBase64 || !file) return;
    setSaving(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() as string;
      const { data, error } = await supabase.functions.invoke("parse-menu-upload", {
        body: {
          restaurant_id: restaurantId,
          file_base64: fileBase64,
          file_type: ext,
          file_name: file.name,
          save_to_db: true,
          notes,
        },
      });
      if (error) throw new Error(error.message);
      if (!data.success) throw new Error(data.error || "Save failed");
      toast.success(`Menu saved! ${data.items_count} items stored.`);
      queryClient.invalidateQueries({ queryKey: ["admin-menu-restaurants"] });
      setStep("done");
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setStep("select");
    setFile(null);
    setFileBase64("");
    setNotes("");
    setSections([]);
    setExpandedSections(new Set());
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const toggleSection = (name: string) =>
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  const selectedRestaurant = restaurants.find((r) => r.id === restaurantId);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Step 1 — Select restaurant + file */}
      {(step === "select" || step === "preview") && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Restaurant</Label>
            <Select value={restaurantId} onValueChange={setRestaurantId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a restaurant..." />
              </SelectTrigger>
              <SelectContent>
                {restaurants
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                      {r.has_menu && (
                        <span className="ml-2 text-muted-foreground text-xs">(has menu)</span>
                      )}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div
            ref={dropRef}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
              ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40"}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div className="flex flex-col items-center gap-3 pointer-events-none">
              {file ? (
                <>
                  {file.type.startsWith("image/") ? (
                    <FileImage className="h-10 w-10 text-primary" />
                  ) : (
                    <FileText className="h-10 w-10 text-primary" />
                  )}
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / 1024).toFixed(0)} KB — click or drop to replace
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Drop menu file here or click to browse</p>
                    <p className="text-sm text-muted-foreground">PDF, JPG, or PNG — max {MAX_SIZE_MB}MB</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {step === "preview" && (
            <div className="space-y-2">
              <Label htmlFor="notes">Admin Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="e.g. Summer 2026 menu, from printed copy"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          )}

          {step === "preview" && (
            <Button
              className="w-full"
              disabled={!restaurantId || !fileBase64 || parsing}
              onClick={parseMenu}
            >
              {parsing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Extracting menu with AI…
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Extract &amp; Preview Menu
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Step 2 — Review extracted items */}
      {step === "review" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Extracted Menu</h3>
              <p className="text-sm text-muted-foreground">
                {selectedRestaurant?.name} · {totalItems} items · {sections.length} sections
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <X className="h-4 w-4 mr-1" /> Start over
            </Button>
          </div>

          <ScrollArea className="h-72 rounded-md border p-3 space-y-3">
            {sections.map((section) => (
              <div key={section.section_name} className="mb-3">
                <button
                  className="flex items-center gap-2 w-full text-left font-semibold text-sm py-1 hover:text-primary transition-colors"
                  onClick={() => toggleSection(section.section_name)}
                >
                  {expandedSections.has(section.section_name) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  {section.section_name}
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {section.items.length}
                  </Badge>
                </button>
                {expandedSections.has(section.section_name) && (
                  <div className="ml-6 space-y-1 mt-1">
                    {section.items.map((item, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 py-0.5 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium">{item.item_name}</span>
                          {item.is_popular && (
                            <Badge className="ml-1 text-xs bg-amber-100 text-amber-800 border-amber-200">
                              Popular
                            </Badge>
                          )}
                          {item.item_description && (
                            <p className="text-muted-foreground text-xs leading-snug mt-0.5 truncate max-w-sm">
                              {item.item_description}
                            </p>
                          )}
                          {item.dietary_tags.length > 0 && (
                            <div className="flex gap-1 mt-0.5">
                              {item.dietary_tags.map((tag) => (
                                <Badge key={tag} variant="outline" className="text-xs px-1 py-0">
                                  {DIETARY_LABELS[tag] ?? tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        {item.price && (
                          <span className="text-muted-foreground whitespace-nowrap shrink-0">
                            {item.price}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <Separator className="mt-2" />
              </div>
            ))}
          </ScrollArea>

          <div className="space-y-2">
            <Label htmlFor="notes-review">Admin Notes</Label>
            <Textarea
              id="notes-review"
              placeholder="e.g. Summer 2026 menu, from printed copy"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("preview")}>
              Back
            </Button>
            <Button className="flex-1" disabled={saving} onClick={saveMenu}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save {totalItems} items to {selectedRestaurant?.name}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 — Done */}
      {step === "done" && (
        <div className="text-center py-12 space-y-4">
          <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
          <div>
            <h3 className="font-semibold text-lg">Menu saved!</h3>
            <p className="text-muted-foreground text-sm mt-1">
              The new menu version is now live for {selectedRestaurant?.name}.
            </p>
          </div>
          <Button onClick={reset}>Upload Another Menu</Button>
        </div>
      )}
    </div>
  );
}
