import { useId, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { OptimizedImage } from "@/components/OptimizedImage";
import { useAuth } from "@/hooks/useAuth";
import { isRpcMissing, ownerRefusalMessage, useUpdateClaimedListing } from "@/hooks/useMyBusinessClaims";
import type { ListingType } from "@/hooks/useBusinessClaim";
import { handleError } from "@/lib/errorHandler";
import { OWNER_PHOTO_TYPES, OwnerPhotoRefused, checkOwnerPhoto, uploadOwnerPhoto } from "@/lib/ownerPhoto";

export interface OwnerPhotoUploadProps {
  listingType: Extract<ListingType, "restaurant" | "attraction">;
  listingId: string;
  listingName: string;
  currentUrl: string | null | undefined;
}

/**
 * The listing photo, uploaded from the owner's device (WEB-ADS-048). It
 * replaced a "Photo link" text box: a hot-linked image could vanish or change
 * under us, and nothing but the browser checked it. The file is checked here
 * for type and size, stored under the owner's own folder, and the database
 * checks the stored object again before it becomes image_url.
 */
export function OwnerPhotoUpload({ listingType, listingId, listingName, currentUrl }: OwnerPhotoUploadProps) {
  const { user } = useAuth();
  const update = useUpdateClaimedListing();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();

  const setImage = async (url: string | null) => {
    await update.mutateAsync({ listingType, listingId, patch: { image_url: url } });
  };

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    const check = checkOwnerPhoto(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    if (!user) {
      setError("Sign in again to upload a photo.");
      return;
    }
    setBusy(true);
    try {
      const url = await uploadOwnerPhoto(file, user.id, listingId);
      await setImage(url);
      toast.success(`The photo for ${listingName} is updated.`);
    } catch (e) {
      if (e instanceof OwnerPhotoRefused) {
        setError(e.message);
      } else if (isRpcMissing(e)) {
        setError("Photos can't be changed yet. Try again later.");
      } else {
        handleError(e, { component: "OwnerPhotoUpload", action: "upload owner photo" });
        const message = ownerRefusalMessage(e);
        setError(message ? `That photo didn't save: ${message}.` : "That photo didn't upload. Try again.");
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onRemove = async () => {
    setError(null);
    setBusy(true);
    try {
      await setImage(null);
      toast.success(`The photo for ${listingName} is removed.`);
    } catch (e) {
      handleError(e, { component: "OwnerPhotoUpload", action: "remove owner photo" });
      setError("That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>Photo</Label>
      {currentUrl && (
        <OptimizedImage
          src={currentUrl}
          alt={`Current photo of ${listingName}`}
          width={192}
          height={128}
          sizes="192px"
          containerClassName="h-32 w-48 overflow-hidden rounded-lg"
          className="h-32 w-48"
          objectFit="cover"
        />
      )}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={Object.keys(OWNER_PHOTO_TYPES).join(",")}
        aria-describedby={hintId}
        disabled={busy}
        onChange={(e) => void onFile(e.target.files?.[0])}
        className="block min-h-11 text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:bg-background file:px-3"
      />
      <p id={hintId} className="text-xs text-muted-foreground">
        JPEG, PNG or WebP, up to 5 MB. It replaces the current photo straight away.
      </p>
      {busy && (
        <p className="text-sm text-muted-foreground" role="status">
          Uploading...
        </p>
      )}
      {currentUrl && !busy && (
        <Button type="button" variant="outline" className="min-h-11" onClick={() => void onRemove()}>
          Remove photo
        </Button>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
