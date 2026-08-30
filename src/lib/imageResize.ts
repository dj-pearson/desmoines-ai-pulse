/**
 * Client-side image downscale + compress (WEB-FEAT-010). Resizes to a max edge
 * and re-encodes as JPEG, stepping quality down until the blob is under the byte
 * budget — so we never upload a multi-MB phone photo for a review thumbnail.
 */
export interface ResizeOptions {
  maxEdge?: number; // longest side in px
  maxBytes?: number; // target max output size
}

const DEFAULTS: Required<ResizeOptions> = { maxEdge: 1280, maxBytes: 500 * 1024 };

export async function resizeImageFile(file: File, opts: ResizeOptions = {}): Promise<Blob> {
  const { maxEdge, maxBytes } = { ...DEFAULTS, ...opts };

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    // Can't decode — return the original if it's already small enough, else throw.
    if (file.size <= maxBytes) return file;
    throw new Error("Unsupported image");
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const toBlob = (quality: number): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));

  for (const quality of [0.82, 0.7, 0.6, 0.5, 0.4]) {
    const blob = await toBlob(quality);
    if (blob && blob.size <= maxBytes) return blob;
    if (quality === 0.4 && blob) return blob; // best effort at the floor
  }
  throw new Error("Could not compress image");
}
