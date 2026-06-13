import React, { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { StarRating } from "@/components/reviews/StarRating";
import { Database } from "@/integrations/supabase/types";
import {
  MAX_REVIEW_PHOTOS,
  isAcceptedReviewPhoto,
  uploadReviewPhotos,
} from "@/lib/reviewPhotos";
import { handleError } from "@/lib/errorHandler";

type ContentType = Database["public"]["Enums"]["content_type"];
type RatingValue = Database["public"]["Enums"]["rating_value"];

interface ReviewComposerProps {
  contentType: ContentType;
  contentId: string;
  initialRating?: RatingValue;
  initialText?: string;
  /** Receives already-uploaded photo URLs; returns true on success. */
  onSubmit: (rating: RatingValue, reviewText?: string, photoUrls?: string[]) => Promise<boolean>;
  onCancel: () => void;
}

interface LocalPhoto {
  file: File;
  preview: string;
}

/**
 * WEB-FEAT-010: review composer — star picker, optional text, and up to 3 photos
 * (client-compressed to < 500KB, uploaded to owner-scoped storage on submit).
 */
export const ReviewComposer: React.FC<ReviewComposerProps> = ({
  contentType,
  contentId,
  initialRating = "5",
  initialText = "",
  onSubmit,
  onCancel,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rating, setRating] = useState<RatingValue>(initialRating);
  const [reviewText, setReviewText] = useState(initialText);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [busy, setBusy] = useState<"idle" | "uploading" | "submitting">("idle");

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = "";
    if (files.length === 0) return;

    const accepted: LocalPhoto[] = [];
    for (const file of files) {
      if (!isAcceptedReviewPhoto(file)) {
        toast({
          title: "Unsupported image",
          description: `${file.name} isn't a JPEG, PNG, or WebP.`,
          variant: "destructive",
        });
        continue;
      }
      accepted.push({ file, preview: URL.createObjectURL(file) });
    }

    setPhotos((prev) => {
      const room = MAX_REVIEW_PHOTOS - prev.length;
      if (accepted.length > room) {
        toast({
          title: "Photo limit reached",
          description: `You can attach up to ${MAX_REVIEW_PHOTOS} photos.`,
        });
      }
      return [...prev, ...accepted.slice(0, Math.max(0, room))];
    });
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.preview);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!user) return;

    let photoUrls: string[] = [];
    try {
      if (photos.length > 0) {
        setBusy("uploading");
        photoUrls = await uploadReviewPhotos(
          user.id,
          contentType,
          contentId,
          photos.map((p) => p.file),
        );
      }
    } catch (error) {
      handleError(error, { component: "ReviewComposer", action: "uploadPhotos" });
      toast({
        title: "Photo upload failed",
        description: "Your photos couldn't be uploaded. Try again or post without them.",
        variant: "destructive",
      });
      setBusy("idle");
      return;
    }

    setBusy("submitting");
    const ok = await onSubmit(rating, reviewText.trim() || undefined, photoUrls);
    setBusy("idle");
    if (ok) {
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPhotos([]);
    }
  };

  const isWorking = busy !== "idle";

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Your Rating</label>
        <StarRating rating={Number(rating)} onRatingChange={setRating} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="review-text">
          Review (Optional)
        </label>
        <Textarea
          id="review-text"
          placeholder={`Share your thoughts about this ${contentType}...`}
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Photos (Optional)</label>
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={p.preview} className="relative h-20 w-20 overflow-hidden rounded-md border">
              <img src={p.preview} alt={`Selected photo ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                disabled={isWorking}
                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                aria-label={`Remove photo ${i + 1}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {photos.length < MAX_REVIEW_PHOTOS && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isWorking}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
              aria-label="Add photo"
            >
              <ImagePlus className="h-5 w-5" />
              <span className="text-[10px]">Add</span>
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={handleFiles}
        />
        <p className="text-xs text-muted-foreground">
          Up to {MAX_REVIEW_PHOTOS} photos. Large images are automatically compressed.
        </p>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={isWorking}>
          {busy === "uploading"
            ? "Uploading photos…"
            : busy === "submitting"
              ? "Submitting…"
              : "Submit Review"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={isWorking}>
          Cancel
        </Button>
      </div>
    </div>
  );
};
