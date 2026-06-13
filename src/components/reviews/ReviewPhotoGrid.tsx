import React, { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface ReviewPhotoGridProps {
  photos: string[];
  /** Accessible label prefix, e.g. the reviewer name. */
  altPrefix?: string;
}

/**
 * WEB-FEAT-010: thumbnail grid of review photos with a click-to-zoom lightbox.
 */
export const ReviewPhotoGrid: React.FC<ReviewPhotoGridProps> = ({ photos, altPrefix = "Review" }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!photos || photos.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={() => setOpenIndex(i)}
            className="h-20 w-20 overflow-hidden rounded-md border focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label={`${altPrefix} photo ${i + 1} — view larger`}
          >
            <img
              src={url}
              alt={`${altPrefix} photo ${i + 1}`}
              loading="lazy"
              className="h-full w-full object-cover transition-transform hover:scale-105"
            />
          </button>
        ))}
      </div>

      <Dialog open={openIndex !== null} onOpenChange={(o) => !o && setOpenIndex(null)}>
        <DialogContent className="max-w-3xl p-2">
          {openIndex !== null && (
            <img
              src={photos[openIndex]}
              alt={`${altPrefix} photo ${openIndex + 1}`}
              className="max-h-[80vh] w-full rounded-md object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
