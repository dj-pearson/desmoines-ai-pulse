// WEB-FEAT-010: client-side review photo compression + upload.
//
// Photos are resized and re-encoded to JPEG under 500KB in the browser before
// upload (the bucket also hard-caps at 1MB), then stored under an owner-scoped
// path so the review-photos RLS policies allow the write.

import { supabase } from "@/integrations/supabase/client";

export const MAX_REVIEW_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 500 * 1024; // 500KB target (criterion)
const MAX_DIMENSION = 1600; // longest edge after resize
const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

export function isAcceptedReviewPhoto(file: File): boolean {
  return ACCEPTED_TYPES.includes(file.type);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Resize to <= MAX_DIMENSION on the longest edge, then step JPEG quality down
 * until the result is under MAX_PHOTO_BYTES. Always returns a JPEG blob.
 */
export async function compressReviewPhoto(file: File): Promise<Blob> {
  const img = await loadImage(file);

  let { width, height } = img;
  if (Math.max(width, height) > MAX_DIMENSION) {
    if (width >= height) {
      height = Math.round((height * MAX_DIMENSION) / width);
      width = MAX_DIMENSION;
    } else {
      width = Math.round((width * MAX_DIMENSION) / height);
      height = MAX_DIMENSION;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  // White matte so PNG transparency doesn't turn black in JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.85;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > MAX_PHOTO_BYTES && quality > 0.4) {
    quality -= 0.15;
    blob = await canvasToBlob(canvas, quality);
  }
  return blob;
}

/**
 * Compress + upload up to MAX_REVIEW_PHOTOS to the review-photos bucket under an
 * owner-scoped path (`{userId}/{contentType}/{contentId}/{ts}-{i}.jpg`) and
 * return their public URLs. Throws on the first upload failure.
 */
export async function uploadReviewPhotos(
  userId: string,
  contentType: string,
  contentId: string,
  files: File[],
): Promise<string[]> {
  const slice = files.slice(0, MAX_REVIEW_PHOTOS);
  const urls: string[] = [];
  const ts = Date.now();

  for (let i = 0; i < slice.length; i++) {
    const blob = await compressReviewPhoto(slice[i]);
    const path = `${userId}/${contentType}/${contentId}/${ts}-${i}.jpg`;
    const { error } = await supabase.storage
      .from("review-photos")
      .upload(path, blob, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
    if (error) throw error;
    const { data } = supabase.storage.from("review-photos").getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return urls;
}
