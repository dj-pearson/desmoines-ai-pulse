import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { createLogger } from "@/lib/logger";
import { Loader2, ImageIcon, Check } from "lucide-react";

const log = createLogger("ImagePickerDialog");

type Category = "events" | "restaurants" | "attractions" | "playgrounds";

type ImageSource =
  | "og"
  | "twitter"
  | "jsonld"
  | "image_src"
  | "img"
  | "venue"
  | "places";

interface Candidate {
  url: string;
  source: ImageSource;
  width?: number;
  height?: number;
}

interface RecordSummary {
  id: string;
  name: string;
  currentImageUrl: string | null;
  sourceUrl: string | null;
  venue: string | null;
}

interface Props {
  open: boolean;
  category: Category;
  recordId: string;
  recordName: string;
  onClose: () => void;
  onApplied?: (newImageUrl: string) => void;
}

const SOURCE_LABEL: Record<ImageSource, string> = {
  og: "OG",
  twitter: "Twitter",
  jsonld: "JSON-LD",
  image_src: "image_src",
  img: "page <img>",
  venue: "venue",
  places: "Places",
};

export default function ImagePickerDialog({
  open,
  category,
  recordId,
  recordName,
  onClose,
  onApplied,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [record, setRecord] = useState<RecordSummary | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setSelectedUrl(null);
      setCandidates([]);
      setRecord(null);
      try {
        const { data, error } = await supabase.functions.invoke(
          "find-image-candidates",
          { body: { category, id: recordId } },
        );
        if (cancelled) return;
        if (error) throw error;
        setRecord(data?.record ?? null);
        setCandidates(data?.candidates ?? []);
      } catch (err) {
        log.error("loadCandidates", "Failed", { error: String(err) });
        toast({
          title: "Couldn't load image candidates",
          description: String(err),
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, category, recordId, toast]);

  const apply = async (url: string) => {
    setApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke("apply-image", {
        body: { category, id: recordId, imageUrl: url },
      });
      if (error) throw error;
      toast({
        title: "Image updated",
        description: recordName,
      });
      onApplied?.(data?.imageUrl ?? url);
      onClose();
    } catch (err) {
      log.error("applyImage", "Failed", { error: String(err), url });
      toast({
        title: "Couldn't apply image",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Pick an image — {recordName}
          </DialogTitle>
          <DialogDescription>
            {record?.sourceUrl ? (
              <>
                Pulled from{" "}
                <a
                  href={record.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  source page
                </a>
                {record.venue ? `, venue ${record.venue}` : ""}, and Google Places.
              </>
            ) : (
              "Pulled from venue lookup and Google Places."
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Searching for images…</span>
          </div>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">
            No candidates found. You can paste a URL below.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {candidates.map((c, i) => {
              const isSelected = selectedUrl === c.url;
              return (
                <button
                  key={`${c.url}-${i}`}
                  type="button"
                  onClick={() => setSelectedUrl(c.url)}
                  className={`relative border rounded-md overflow-hidden hover:border-primary transition-colors ${
                    isSelected ? "border-primary ring-2 ring-primary" : "border-border"
                  }`}
                >
                  <img
                    src={c.url}
                    alt=""
                    loading="lazy"
                    className="w-full h-32 object-cover bg-muted"
                    onError={(e) => {
                      const img = e.currentTarget;
                      img.style.display = "none";
                      const parent = img.parentElement;
                      if (parent && !parent.querySelector(".broken-img")) {
                        const div = document.createElement("div");
                        div.className =
                          "broken-img w-full h-32 flex items-center justify-center text-xs text-muted-foreground bg-muted";
                        div.textContent = "Failed to load";
                        parent.appendChild(div);
                      }
                    }}
                  />
                  <div className="absolute top-1 left-1 flex gap-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {SOURCE_LABEL[c.source]}
                    </Badge>
                  </div>
                  {isSelected && (
                    <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-1">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="border-t pt-4 mt-2">
          <p className="text-xs text-muted-foreground mb-1">
            Or paste an image URL directly:
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com/image.jpg"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={!manualUrl.trim() || applying}
              onClick={() => apply(manualUrl.trim())}
            >
              Use URL
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button
            disabled={!selectedUrl || applying}
            onClick={() => selectedUrl && apply(selectedUrl)}
          >
            {applying ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Applying…
              </>
            ) : (
              "Apply selected"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
