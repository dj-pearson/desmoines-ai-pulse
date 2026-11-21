import { supabase } from "@/integrations/supabase/client";

/**
 * WEB-ADS-048: an owner's listing photo is uploaded, not linked.
 *
 * It goes to the public `media` bucket under the owner's own id, which the
 * bucket's insert policy requires (migration 20261101000003). The database
 * accepts the resulting URL as image_url only when storage holds that object
 * in the owner's listing-photos folder with one of these types and at most
 * this size (owner_photo_is_stored, migration 20261121000150), so these
 * checks run twice: here, to say what is wrong before a large upload, and
 * there, where they cannot be skipped.
 */

export const OWNER_PHOTO_BUCKET = "media";

export const OWNER_PHOTO_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type OwnerPhotoType = keyof typeof OWNER_PHOTO_TYPES;

export const OWNER_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export type OwnerPhotoCheck = { ok: true; type: OwnerPhotoType } | { ok: false; error: string };

export function checkOwnerPhoto(file: Pick<File, "type" | "size">): OwnerPhotoCheck {
  const type = file.type.toLowerCase();
  if (!(type in OWNER_PHOTO_TYPES)) {
    return { ok: false, error: "Use a JPEG, PNG or WebP photo." };
  }
  if (file.size <= 0) {
    return { ok: false, error: "That file is empty." };
  }
  if (file.size > OWNER_PHOTO_MAX_BYTES) {
    return { ok: false, error: "That photo is over 5 MB. Export a smaller copy and try again." };
  }
  return { ok: true, type: type as OwnerPhotoType };
}

/** <uid>/listing-photos/<listing id>/<time>.<ext>: the only folder the database accepts. */
export function ownerPhotoPath(userId: string, listingId: string, type: OwnerPhotoType, now: number = Date.now()): string {
  return `${userId}/listing-photos/${listingId}/${now}.${OWNER_PHOTO_TYPES[type]}`;
}

/**
 * Uploads the photo and returns its public URL. Throws the check's message
 * for a file that fails it, and the storage error for a failed upload.
 */
export async function uploadOwnerPhoto(file: File, userId: string, listingId: string): Promise<string> {
  const check = checkOwnerPhoto(file);
  if (!check.ok) throw new OwnerPhotoRefused(check.error);
  const path = ownerPhotoPath(userId, listingId, check.type);
  const { error } = await supabase.storage
    .from(OWNER_PHOTO_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: check.type });
  if (error) throw error;
  const { data } = supabase.storage.from(OWNER_PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** A file the browser-side check refused; its message is meant for the owner. */
export class OwnerPhotoRefused extends Error {}
