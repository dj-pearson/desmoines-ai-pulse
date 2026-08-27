# Runbook: cut image egress and reclaim storage

Everything below is built, pushed, and **inert until you run it**. Nothing on the
branch changes production behaviour on its own.

Branch: `claude/prd-stories-loop-k5jmnk`

There are two independent halves. They share no state and can be done in either
order, or one without the other.

| Half | What it costs today | What it saves |
|---|---|---|
| **A. Venue default images** | one image downloaded and stored per event, at single-venue sources | ingest egress + storage rows + the files themselves |
| **B. Serve through Cloudflare** | Supabase egress on every card image, per page view, per visitor | serving egress, which is the bigger number |

Ingest downloads an image once, ever. Serving downloads it once per viewer. If
you only do one half, do **B**.

---

## Half A: one default image per venue

### A1. Apply the migration

```bash
supabase db push        # applies 20260827000001_known_venues_image_url.sql
```

Adds `known_venues.image_url text NULL` plus a partial index. Additive, no table
rewrite, safe per CLAUDE.md.

### A2. Regenerate types and re-baseline the schema check

Both, or CI stays wrong in two directions:

```bash
supabase gen types typescript --linked > src/integrations/supabase/types.ts
node scripts/check-schema-usage.mjs --update
```

Until you do, `schema-baseline.json` carries two **accurate** entries for
`known_venues.image_url`. The column really does not exist yet, so they are accurate rather than suppressed noise. They disappear
on the `--update`.

### A3. Set an image per venue

The venues are the sources in `supabase/functions/_shared/eventSourceProfiles.ts`
that declare a single `venue`. Eleven sources, eight distinct venues:

| Venue | Sources that feed it |
|---|---|
| Wells Fargo Arena | hyveetix, Iowa Barnstormers, Iowa Wild, Iowa Wolves |
| Principal Park | Iowa Cubs |
| Wooly's | firstfleetconcerts.com, woolysdm.com |
| Vibrant Music Hall | vibrantmusichall.com |
| Hoyt Sherman Place | hoytsherman.org |
| Des Moines Community Playhouse | dmplayhouse.com |
| Civic Center of Greater Des Moines | dmsymphony.org |
| Horizon Events Center | horizoneventscenter.com |

Aggregators (Catch Des Moines, SeatGeek, Eventbrite) declare no venue and are
deliberately untouched. Their events genuinely each have their own artwork.

Match is on `known_venues.name` **or any entry in `known_venues.aliases`**,
lowercased and trimmed. Confirm the row exists under the name above before
setting it:

```sql
select name, aliases, image_url from public.known_venues
where lower(name) in (
  'wells fargo arena','principal park','wooly''s','vibrant music hall',
  'hoyt sherman place','des moines community playhouse',
  'civic center of greater des moines','horizon events center'
);

update public.known_venues
   set image_url = 'https://<project>.supabase.co/storage/v1/object/public/media/venues/hoyt-sherman.jpg'
 where lower(name) = 'hoyt sherman place';
```

A venue left `NULL` keeps per-event images. That is the safe state, and it is
where every venue starts.

### A4. Deploy the three ingest functions

```bash
supabase functions deploy ai-crawler
supabase functions deploy firecrawl-scraper
supabase functions deploy backfill-images
```

These are the three that import `_shared/venueImage.ts`. From here, a new event
from a venue source with an image set stores the venue image and **never
downloads the per-event one**: `resolveEventImage` returns `skipFetch: true`.

### A5. Reclaim what is already stored

```bash
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...

npx tsx scripts/reclaim-venue-images.ts                              # DRY RUN
npx tsx scripts/reclaim-venue-images.ts --venue "Hoyt Sherman Place" # one venue
npx tsx scripts/reclaim-venue-images.ts --apply                      # do it
```

Dry run is the default. Start with one venue.

**The property that makes this safe:** storage files are shared. `imageStorage.ts`
dedupes twice, on source URL and then on content hash, and both paths write a new
`media_assets` row pointing at an *existing* `file_path`. So the script deletes
`media_assets` rows **first**, then re-counts references per `file_path` against
the state that now exists, and removes only files nothing points at. A file
shared with a Catch Des Moines event survives.

It will not touch an aggregator event, a venue with no `image_url`, an `events`
row, a `known_venues` row, or any bucket other than the one the `media_assets`
row names.

---

## Half B: serve images through Cloudflare instead of Supabase

`cdnUrlFor()` in `_shared/imageStorage.ts` writes

```
https://<project>.supabase.co/storage/v1/object/public/media/<path>
```

into `events.image_url` and friends. Every card image, on every page view, by
every visitor and every crawler, is billed as Supabase egress. `public/_headers`
does not help: those rules apply to files Cloudflare Pages serves out of
`dist/`, not to a URL on the supabase.co origin.

### B1. Deploy the Pages Function

`functions/media/[[path]].ts` ships with the next Pages build. It fetches the
object from Supabase once, puts it in the Cloudflare edge cache, and serves
everything after that from there.

Cloudflare Pages → Settings → Environment variables, **Production**:

- `SUPABASE_URL`. The Pages Function reads this to find the origin. Without it
  the route returns 502, deliberately not 404: a 404 would read as "no such
  image" in a log.

### B2. Confirm it serves BEFORE rewriting anything

```bash
curl -sSI "https://desmoinesinsider.com/media/events/<some-uuid>/hero.jpg" | head -20
```

Expect `200` and `X-Media-Origin: supabase-storage`. Repeat it; the second call should come from the edge cache.

Do not skip this. Rewriting a thousand rows to a route that 404s is a thousand
broken images.

### B3. Switch new writes over

Cloudflare Pages **and** Supabase edge functions both need it, and they must
agree or new writes and rewritten rows will disagree about where images live:

```bash
supabase secrets set MEDIA_CDN_BASE=https://desmoinesinsider.com
supabase functions deploy ai-crawler firecrawl-scraper backfill-images apply-image find-image-candidates
```

Also set `MEDIA_CDN_BASE` in Cloudflare Pages env.

With it set, `cdnUrlFor` emits `https://desmoinesinsider.com/media/<path>`. Unset,
it emits the Supabase URL exactly as before. That env var is the whole switch.

### B4. Move the existing rows

```bash
export MEDIA_CDN_BASE=https://desmoinesinsider.com

npx tsx scripts/repoint-media-urls.ts                    # DRY RUN, prints a sample URL
npx tsx scripts/repoint-media-urls.ts --table events     # one table
npx tsx scripts/repoint-media-urls.ts --apply            # all of them
npx tsx scripts/repoint-media-urls.ts --revert --apply   # put them all back
```

Covers `events`, `restaurants`, `attractions`, `playgrounds`. Only rewrites URLs
starting with this project's own storage prefix. An externally hosted
`image_url` that was never stored is left alone, because `/media` cannot serve
what is not in the bucket.

**This is a cost change, not a correctness fix.** Both URL forms resolve. A row
left on supabase.co still works; it just costs egress. So there is no hurry,
nothing breaks if it runs halfway, and `--revert` is the exact inverse.

---

## What was verified, and what was not

Verified offline, in CI:

- `npm run test:venue-images`, 26 checks on the URL-to-venue mapping and the
  reclaim's reference counting, including that the edge module and the script
  agree on which sources are venue sources
- `npm run test:media-route`, 12 checks on the `/media` path guard. It is an
  **allowlist**, not a `..` denylist, because the route forwards a
  caller-supplied path to a storage origin
- `npm run test:media-urls`, 15 checks on the rewrite and its inverse, weighted
  toward the URLs it must **not** touch
- `npm run test:offline` runs all of them; `pr-checks.yml` runs that

Not verified: every database call in both scripts, and the live `/media` route.
This container has no Supabase credentials and no network route to one. That is
why both scripts dry-run by default, why `--revert` exists, and why B2 says to
curl the route before B4.

## Rollback

| Step | Undo |
|---|---|
| A3 venue image | `update known_venues set image_url = null where ...`; ingest returns to per-event images immediately (15 min cache TTL) |
| A5 reclaim | **None.** Deleted storage files are gone. Dry-run first, one venue first |
| B3 switch | `supabase secrets unset MEDIA_CDN_BASE` + redeploy; new writes go back to supabase.co |
| B4 rewrite | `npx tsx scripts/repoint-media-urls.ts --revert --apply` |

A5 is the only irreversible step in the runbook.
