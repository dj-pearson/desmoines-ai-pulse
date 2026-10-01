-- WEB-FEAT-022: events need an indoor/outdoor classification so the site can
-- stop recommending an outdoor festival during a thunderstorm.
--
-- WHY `is_indoor` AND NOT `is_outdoor`. attractions already carries
-- `is_indoor BOOLEAN` (20260520000004_add_attraction_admin_fields.sql), it is
-- admin-editable through AttractionEditDialog as an explicit tristate, and it
-- is live in production. Adding `is_outdoor` to events would mean two columns
-- with opposite polarity describing the same fact on two tables that are
-- always queried together -- which is the exact drift this codebase already
-- pays for elsewhere. One name, one polarity, one accessor.
--
-- NULL IS A REAL VALUE HERE. Three states: true (indoor), false (outdoor),
-- NULL (not yet classified). NULL must never be read as false. An unclassified
-- event keeps its natural position in every list; the weather reorder in
-- _shared/weatherPolicy.ts ranks unknown ahead of a known mismatch precisely so
-- that a half-classified table degrades gracefully instead of burying
-- everything we have not labelled yet.
--
-- Additive per CLAUDE.md: ADD COLUMN ... NULL with no default, so no table
-- rewrite and no shipped iOS/Android binary is affected. Older clients ignore
-- the new key; nothing reads it until the web app ships the reorder.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_indoor BOOLEAN;

COMMENT ON COLUMN public.events.is_indoor IS
  'Tristate venue classification for weather-aware ranking (WEB-FEAT-022). '
  'true = indoor, false = outdoor, NULL = not yet classified. '
  'NULL must not be treated as false. Mirrors attractions.is_indoor.';

-- Partial index: the weather reorder only ever asks for rows that HAVE a
-- classification, and leaving the NULLs out keeps the index small while the
-- backfill is still incomplete.
CREATE INDEX IF NOT EXISTS idx_events_is_indoor
  ON public.events (is_indoor)
  WHERE is_indoor IS NOT NULL;

-- --------------------------------------------------------------------------
-- Conservative seed classification.
--
-- This labels only what the text states outright. Everything ambiguous stays
-- NULL on purpose: a wrong label actively misleads a visitor standing in the
-- rain, while a NULL just means the list is not reordered. Precision over
-- recall, and the admin tristate control is the path for the rest.
--
-- Guarded by `is_indoor IS NULL` so re-running never overwrites a human
-- correction, and so this is safe to replay.
-- --------------------------------------------------------------------------

-- A single pass, so that a row matching BOTH vocabularies resolves to NULL
-- rather than to whichever UPDATE happened to run first. ("Rooftop theater"
-- and "museum garden party" are real listings, and neither answer is safe.)
WITH classified AS (
  SELECT
    id,
    (
      COALESCE(venue, '') || ' ' || COALESCE(location, '') || ' ' ||
      COALESCE(title, '') || ' ' || COALESCE(category, '')
    ) ~* '\m(farmers?[ -]markets?|outdoors?|open[ -]air|parks?|trails?|gardens?|patio|rooftop|beer garden|festival grounds|amphitheater|amphitheatre|golf|campground|riverwalk|state fair|tailgate|parade|5k|fun run|marathon)\M'
      AS looks_outdoor,
    (
      COALESCE(venue, '') || ' ' || COALESCE(location, '') || ' ' ||
      COALESCE(title, '') || ' ' || COALESCE(category, '')
    ) ~* '\m(theatre|theater|museum|gallery|cinema|arena|civic center|convention center|library|taproom|lounge|nightclub|bowling|arcade|aquarium|planetarium|indoors?)\M'
      AS looks_indoor
  FROM public.events
  WHERE is_indoor IS NULL
)
UPDATE public.events AS e
SET is_indoor = CASE
  WHEN c.looks_indoor AND NOT c.looks_outdoor THEN true
  WHEN c.looks_outdoor AND NOT c.looks_indoor THEN false
  ELSE NULL  -- both matched, or neither: leave it for a human
END
FROM classified AS c
WHERE e.id = c.id
  AND (c.looks_indoor OR c.looks_outdoor)
  AND (c.looks_indoor <> c.looks_outdoor);  -- skip the ambiguous rows entirely

-- Deliberately NOT classified by this migration: anything whose venue is a
-- bare business name, every online/virtual listing, and every row where both
-- vocabularies matched. Those stay NULL for the admin surface to resolve.
