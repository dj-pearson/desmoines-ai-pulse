/**
 * purgeUserStorage (WEB-LEGAL-003) — erase a user's uploaded files.
 *
 * Account deletion used to remove database rows only. Every upload bucket in
 * this project is public:true, so a file left behind is not merely retained, it
 * stays fetchable by anyone holding the URL, with no expiry and no revocation.
 * PrivacyPolicy.tsx promises erasure of the account "and associated data",
 * which uploaded photos plainly are.
 *
 * TWO THINGS MAKE THE NAIVE VERSION FAIL SILENTLY, both handled here:
 *
 * 1. Most of these buckets NEST under the user folder. Only review-photos is
 *    flat (<uid>/<uuid>.jpg). event-photos is <uid>/<eventId>/<ts>.<ext>, and
 *    media/videos/thumbnails are <uid>/<contentType>/<file>. Supabase's list()
 *    returns only immediate children, with folders marked by a null id, so a
 *    single list(userId) call returns folder placeholders and deletes nothing.
 *    The walk below recurses.
 *
 * 2. list() is capped (100 per page by default). A user with more than a page
 *    of photos would keep the remainder. The walk pages until a short read.
 *
 * ad-creatives is deliberately NOT in this list. Those files belong to an
 * advertising engagement with its own billing and dispute-retention needs, they
 * are uploaded under a campaign rather than a personal relationship, and the
 * advertiser may not be the deleting user. Retiring them is a separate decision
 * from personal-data erasure. (Their public-bucket exposure is WEB-LEGAL-007.)
 */

// deno-lint-ignore no-explicit-any
type Client = any;

/** Buckets a user can write to, all keyed by a leading <user_id>/ folder. */
export const USER_UPLOAD_BUCKETS = [
  "review-photos",
  "event-photos",
  "media",
  "videos",
  "thumbnails",
] as const;

const LIST_PAGE = 100;
/** Supabase rejects very large remove() payloads; delete in batches. */
const REMOVE_BATCH = 100;

export interface BucketPurgeResult {
  bucket: string;
  removed: number;
  error?: string;
}

/**
 * Every file path beneath `prefix`, walking nested folders. Folder entries come
 * back from Supabase with a null id, which is how they are told from files.
 */
async function listAllUnder(
  supabase: Client,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const files: string[] = [];
  const pending = [prefix];

  while (pending.length > 0) {
    const dir = pending.pop() as string;
    let offset = 0;

    for (;;) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(dir, { limit: LIST_PAGE, offset });

      if (error) throw new Error(error.message ?? String(error));
      if (!data || data.length === 0) break;

      for (const entry of data) {
        const full = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.id === null || entry.id === undefined) {
          pending.push(full);
        } else {
          files.push(full);
        }
      }

      // A short page means we reached the end of this folder.
      if (data.length < LIST_PAGE) break;
      offset += data.length;
    }
  }

  return files;
}

/**
 * Delete everything the user uploaded. Never throws: a failure in one bucket is
 * captured and the remaining buckets are still purged, matching how the table
 * loop in delete-user-account already behaves. Erasure that stops halfway is
 * worse than erasure that reports which part failed.
 */
export async function purgeUserStorage(
  supabase: Client,
  userId: string,
): Promise<BucketPurgeResult[]> {
  const results: BucketPurgeResult[] = [];

  for (const bucket of USER_UPLOAD_BUCKETS) {
    try {
      const paths = await listAllUnder(supabase, bucket, userId);
      if (paths.length === 0) {
        results.push({ bucket, removed: 0 });
        continue;
      }

      let removed = 0;
      let failure: string | undefined;

      for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
        const batch = paths.slice(i, i + REMOVE_BATCH);
        const { error } = await supabase.storage.from(bucket).remove(batch);
        if (error) {
          failure = error.message ?? String(error);
          break;
        }
        removed += batch.length;
      }

      results.push(failure ? { bucket, removed, error: failure } : { bucket, removed });
    } catch (err) {
      results.push({
        bucket,
        removed: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
