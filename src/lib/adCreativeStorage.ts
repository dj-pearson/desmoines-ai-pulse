import { supabase } from '@/integrations/supabase/client';

/**
 * Ad-creative storage helpers (WEB-LEGAL-011).
 *
 * Two buckets, on purpose:
 *
 *   ad-creatives-review   PRIVATE. Where a creative lives from upload until an
 *                         admin approves it. Readable only by the campaign
 *                         owner and by admins, via RLS on storage.objects.
 *   ad-creatives          PUBLIC. Where an APPROVED creative lives. It has to
 *                         be public: campaign_creatives.image_url holds a
 *                         public URL and get_active_ads returns that column
 *                         straight to shipped iOS and Android binaries, so
 *                         making it private would blank every live ad in one
 *                         release.
 *
 * The confidentiality problem is only the pending and rejected window, so the
 * fix changes where an UNAPPROVED file lives, not how an approved one is served.
 */

export const REVIEW_BUCKET = 'ad-creatives-review';
export const PUBLIC_BUCKET = 'ad-creatives';

/** How long a review preview URL stays valid. Long enough to review, short
 *  enough that a copied link is not a durable leak. */
const SIGNED_URL_TTL_SECONDS = 60 * 10;

/**
 * A temporary URL for previewing a creative that is still under review.
 *
 * Returns null rather than throwing: a broken preview must not take down the
 * approvals screen, and the caller renders a placeholder for null anyway.
 */
export async function signReviewCreative(reviewPath: string | null | undefined): Promise<string | null> {
  if (!reviewPath) return null;

  const { data, error } = await supabase.storage
    .from(REVIEW_BUCKET)
    .createSignedUrl(reviewPath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Move an approved creative into the public bucket and return its public URL.
 *
 * Done in the browser as the approving admin rather than in an edge function,
 * because the admin already holds read on the review bucket and write on the
 * public one, and a creative is capped at 5 MB. A server-side copy would be
 * tidier but would add a deploy step to the approval path.
 *
 * Supabase's storage `copy` is same-bucket only, hence download then upload.
 *
 * Throws on failure. The caller must NOT mark the creative approved unless this
 * succeeds: an approved row whose image_url is null renders as a blank ad slot
 * for the whole campaign, which is worse than a failed approval the admin can
 * retry.
 */
export async function publishCreative(reviewPath: string): Promise<string> {
  const { data: file, error: downloadError } = await supabase.storage
    .from(REVIEW_BUCKET)
    .download(reviewPath);

  if (downloadError || !file) {
    throw new Error(`Could not read the creative from review storage: ${downloadError?.message ?? 'no file'}`);
  }

  const { data: uploaded, error: uploadError } = await supabase.storage
    .from(PUBLIC_BUCKET)
    // Same path in both buckets, so the two copies are obviously the same file.
    // upsert, because a re-approval after a rejection writes the path again.
    .upload(reviewPath, file, { cacheControl: '3600', upsert: true, contentType: file.type });

  if (uploadError || !uploaded) {
    throw new Error(`Could not publish the creative: ${uploadError?.message ?? 'no path'}`);
  }

  const { data: urlData } = supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(uploaded.path);
  return urlData.publicUrl;
}

/**
 * Remove the review copy once the creative is public.
 *
 * Best effort on purpose. The file is already published at this point, so a
 * failed cleanup leaves a duplicate in a private bucket -- untidy, not a leak --
 * and must not fail an approval that has otherwise succeeded.
 */
export async function discardReviewCopy(reviewPath: string): Promise<void> {
  await supabase.storage.from(REVIEW_BUCKET).remove([reviewPath]);
}
