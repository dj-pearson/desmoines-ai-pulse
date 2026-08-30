import { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { signReviewCreative } from '@/lib/adCreativeStorage';

interface CreativePreviewProps {
  /** Public URL, set only once the creative is approved. */
  imageUrl?: string | null;
  /** Object path in the private review bucket, set while unapproved. */
  reviewPath?: string | null;
  alt: string;
  className?: string;
}

/**
 * Renders an ad creative from whichever bucket currently holds it
 * (WEB-LEGAL-011).
 *
 * An APPROVED creative has a public image_url and renders directly. An
 * UNAPPROVED one lives in the private ad-creatives-review bucket with image_url
 * null, so there is no URL to render until one is signed -- which is the whole
 * point: a plain <img src={creative.image_url}> on the approvals screen was
 * only ever able to work because the file was world-readable before anyone had
 * approved it.
 *
 * Signing is per-mount and short-lived. It is not cached across mounts on
 * purpose: the approvals screen shows a handful of creatives at a time, and a
 * cache would keep a valid URL alive past the point where the reviewer closed
 * the page.
 */
export function CreativePreview({ imageUrl, reviewPath, alt, className }: CreativePreviewProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    // Nothing to sign when the creative is already public.
    if (imageUrl || !reviewPath) {
      setSignedUrl(null);
      return;
    }

    let active = true;
    signReviewCreative(reviewPath).then((url) => {
      // Guards against a resolved signature landing after the card unmounted or
      // the creative changed underneath it.
      if (active) setSignedUrl(url);
    });

    return () => {
      active = false;
    };
  }, [imageUrl, reviewPath]);

  const src = imageUrl ?? signedUrl;

  if (!src) {
    return (
      <div className="flex items-center justify-center h-full">
        <ImageIcon className="h-12 w-12 text-muted-foreground" />
      </div>
    );
  }

  return <img src={src} alt={alt} className={className ?? 'w-full h-full object-cover'} />;
}
