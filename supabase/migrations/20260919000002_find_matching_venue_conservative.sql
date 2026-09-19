-- WEB-BE-039. find_matching_venue() matched on a bare substring with no guard.
--
-- THE STORY'S AC3 SAYS TO REUSE THIS FUNCTION "rather than a second matcher".
-- That is backwards, and reading it is what found this: the TypeScript matcher
-- in firecrawl-scraper at least attempted a length guard (a broken one - an OR
-- whose right-hand side was about the known venue, so it always passed). This
-- function attempted nothing. Its partial branch was:
--
--     WHERE is_active = true
--       AND ( LOWER(name) LIKE '%' || search_text || '%'
--          OR search_text LIKE '%' || LOWER(name) || '%' )
--
-- so find_matching_venue('The') returns whichever active venue contains "the",
-- and find_matching_venue('Park') returns the first one containing "park".
-- Converging on it would have made the defect worse and spread it to the web
-- app, which calls this from src/hooks/useKnownVenues.ts.
--
-- WHAT A WRONG ANSWER COSTS. Callers do not treat the result as a label. The
-- ingestion path overwrites the event's venue name, its full street ADDRESS
-- and its LATITUDE and LONGITUDE from the matched venue, so an event whose
-- venue scraped as "Park" was stored at Principal Park's address and pinned
-- there on the map.
--
-- THE RULES, identical to supabase/functions/_shared/venueMatch.ts so the two
-- callers cannot disagree. Keep them in step.
--   exact name        always matches
--   exact alias       always matches
--   partial           needs ALL THREE:
--                       the search text is at least 5 characters
--                       it lines up on word boundaries (not "Hall" inside
--                         "Marshalltown")
--                       it covers at least half the candidate ("Hoyt Sherman"
--                         is 12 of 18 in "Hoyt Sherman Place" and passes;
--                         "Center" is 6 of 18 in "Iowa Events Center" and does
--                         not)
--
-- SIGNATURE UNCHANGED - same name, same argument, same UUID return - so no
-- caller sees a different shape. The BEHAVIOUR is stricter: it returns NULL
-- where it used to return a wrong venue. That is the fix, not a regression,
-- and a NULL is what every caller already handles, since the function could
-- always return NULL for an unknown venue.

CREATE OR REPLACE FUNCTION find_matching_venue(venue_text TEXT)
RETURNS UUID AS $$
DECLARE
  venue_id UUID;
  search_text TEXT;
  search_re TEXT;
BEGIN
  search_text := LOWER(BTRIM(REGEXP_REPLACE(COALESCE(venue_text, ''), '\s+', ' ', 'g')));
  IF search_text = '' THEN
    RETURN NULL;
  END IF;

  -- 1. Exact canonical name.
  SELECT id INTO venue_id
    FROM known_venues
   WHERE LOWER(name) = search_text
     AND is_active = true
   LIMIT 1;
  IF venue_id IS NOT NULL THEN
    RETURN venue_id;
  END IF;

  -- 2. Exact alias.
  SELECT id INTO venue_id
    FROM known_venues
   WHERE is_active = true
     AND EXISTS (
       SELECT 1 FROM unnest(aliases) AS alias
        WHERE LOWER(alias) = search_text
     )
   LIMIT 1;
  IF venue_id IS NOT NULL THEN
    RETURN venue_id;
  END IF;

  -- 3. Partial, and only if it earns it. Below the length floor there is
  --    nothing to consider: those are the common nouns that caused the damage.
  IF LENGTH(search_text) < 5 THEN
    RETURN NULL;
  END IF;

  -- The search text goes into a regex, so its metacharacters are escaped -
  -- venue names carry '.', '&', '(' and apostrophes.
  search_re := REGEXP_REPLACE(search_text, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g');

  SELECT id INTO venue_id
    FROM known_venues v
   WHERE v.is_active = true
     AND (
       -- The extraction names part of the venue, on word boundaries, and
       -- covers at least half of it.
       (
         LOWER(v.name) ~ ('(^|[^a-z0-9])' || search_re || '($|[^a-z0-9])')
         AND LENGTH(search_text)::numeric / NULLIF(LENGTH(LOWER(v.name)), 0) >= 0.5
       )
       -- Or the extraction is longer and contains the venue, measured the same
       -- way round so a scraped paragraph cannot match on one venue inside it.
       OR (
         search_text ~ ('(^|[^a-z0-9])' ||
           REGEXP_REPLACE(LOWER(v.name), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') ||
           '($|[^a-z0-9])')
         AND LENGTH(LOWER(v.name))::numeric / NULLIF(LENGTH(search_text), 0) >= 0.5
       )
     )
   ORDER BY
     -- Prefer the closest in length, so a venue that is nearly the whole of the
     -- extraction wins over one that merely clears the floor.
     ABS(LENGTH(LOWER(v.name)) - LENGTH(search_text)),
     v.name
   LIMIT 1;

  RETURN venue_id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION find_matching_venue IS
'WEB-BE-039. Finds a venue by exact name, exact alias, or a partial match that clears a 5-character floor, word boundaries and 50% coverage. Returns NULL rather than a best guess: callers overwrite an event''s address and coordinates from the result, so a wrong answer moves the event. Rules mirror supabase/functions/_shared/venueMatch.ts - keep the two in step.';
