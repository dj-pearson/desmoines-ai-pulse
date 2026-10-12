import { placesPhotoCredit } from "@/lib/placesPhotoCredit";

interface PlacesPhotoCreditProps {
  imageUrl: string | null | undefined;
  attribution?: string | null;
  className?: string;
}

/**
 * The Google credit over a Places photo, bottom-right of the image. Renders
 * nothing for any other image. Place inside the image's positioned container.
 */
export function PlacesPhotoCredit({ imageUrl, attribution, className = "" }: PlacesPhotoCreditProps) {
  const credit = placesPhotoCredit(imageUrl, attribution);
  if (!credit) return null;
  return (
    <p
      className={`absolute bottom-0 right-0 max-w-full truncate rounded-tl bg-black/60 px-1.5 py-0.5 text-[10px] leading-tight text-white ${className}`}
      data-testid="places-photo-credit"
    >
      {credit}
    </p>
  );
}
