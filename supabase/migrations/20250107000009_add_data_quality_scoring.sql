-- Add data quality scoring for restaurants
-- Tracks completeness of restaurant data (0-100 score)

-- Step 1: Add data_quality_score column to restaurants table
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS data_quality_score INTEGER DEFAULT 0;

-- Step 2: Create index for quality score (for filtering low-quality records)
CREATE INDEX IF NOT EXISTS restaurants_quality_score_idx ON restaurants(data_quality_score);

-- Step 3: Create function to calculate quality score
CREATE OR REPLACE FUNCTION calculate_restaurant_quality_score(restaurant_row restaurants)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 0;
BEGIN
  -- Basic info (40 points total)
  IF restaurant_row.name IS NOT NULL AND LENGTH(restaurant_row.name) > 0 THEN
    score := score + 5;
  END IF;

  IF restaurant_row.cuisine IS NOT NULL AND LENGTH(restaurant_row.cuisine) > 0 THEN
    score := score + 5;
  END IF;

  IF restaurant_row.location IS NOT NULL AND LENGTH(restaurant_row.location) > 0 THEN
    score := score + 10;
  END IF;

  IF restaurant_row.phone IS NOT NULL AND LENGTH(restaurant_row.phone) > 0 THEN
    score := score + 10;
  END IF;

  IF restaurant_row.website IS NOT NULL AND LENGTH(restaurant_row.website) > 0 THEN
    score := score + 10;
  END IF;

  -- Content (30 points total)
  IF restaurant_row.description IS NOT NULL AND LENGTH(restaurant_row.description) > 50 THEN
    score := score + 15;
  END IF;

  IF restaurant_row.ai_writeup IS NOT NULL AND LENGTH(restaurant_row.ai_writeup) > 100 THEN
    score := score + 15;
  END IF;

  -- Media (15 points)
  IF restaurant_row.image_url IS NOT NULL AND LENGTH(restaurant_row.image_url) > 0 THEN
    score := score + 15;
  END IF;

  -- Coordinates (10 points)
  IF restaurant_row.latitude IS NOT NULL AND restaurant_row.longitude IS NOT NULL THEN
    score := score + 10;
  END IF;

  -- Reviews and ratings (5 points)
  IF restaurant_row.rating IS NOT NULL AND restaurant_row.rating > 0 THEN
    score := score + 5;
  END IF;

  RETURN score;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 4: Create trigger function to auto-update quality score
CREATE OR REPLACE FUNCTION update_restaurant_quality_score()
RETURNS trigger AS $$
BEGIN
  NEW.data_quality_score := calculate_restaurant_quality_score(NEW);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create trigger to auto-update on insert/update
DROP TRIGGER IF EXISTS restaurants_quality_score_trigger ON restaurants;
CREATE TRIGGER restaurants_quality_score_trigger
  BEFORE INSERT OR UPDATE ON restaurants
  FOR EACH ROW
  EXECUTE FUNCTION update_restaurant_quality_score();

-- Step 6: Backfill quality scores for existing restaurants
UPDATE restaurants SET data_quality_score = calculate_restaurant_quality_score(restaurants.*);

-- Step 7: Create view for quality statistics
CREATE OR REPLACE VIEW restaurant_quality_stats AS
SELECT
  COUNT(*) as total_restaurants,
  ROUND(AVG(data_quality_score), 2) as avg_quality_score,
  COUNT(*) FILTER (WHERE data_quality_score >= 90) as excellent_quality,
  COUNT(*) FILTER (WHERE data_quality_score >= 70 AND data_quality_score < 90) as good_quality,
  COUNT(*) FILTER (WHERE data_quality_score >= 50 AND data_quality_score < 70) as fair_quality,
  COUNT(*) FILTER (WHERE data_quality_score < 50) as poor_quality,
  COUNT(*) FILTER (WHERE phone IS NULL) as missing_phone,
  COUNT(*) FILTER (WHERE website IS NULL) as missing_website,
  COUNT(*) FILTER (WHERE image_url IS NULL) as missing_image,
  COUNT(*) FILTER (WHERE description IS NULL OR LENGTH(description) < 50) as missing_description,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as missing_coordinates,
  COUNT(*) FILTER (WHERE rating IS NULL) as missing_rating
FROM restaurants;

-- Step 8: Grant permissions
GRANT SELECT ON restaurant_quality_stats TO anon, authenticated;

-- Step 9: Add comments for documentation
COMMENT ON COLUMN restaurants.data_quality_score IS 'Data completeness score (0-100): name(5) + cuisine(5) + location(10) + phone(10) + website(10) + description(15) + ai_writeup(15) + image(15) + coordinates(10) + rating(5)';
COMMENT ON FUNCTION calculate_restaurant_quality_score IS 'Calculates data quality score (0-100) based on field completeness and content length';
COMMENT ON VIEW restaurant_quality_stats IS 'Summary statistics of restaurant data quality across the database';

-- Step 10: Create function to get restaurants needing enrichment
CREATE OR REPLACE FUNCTION get_restaurants_needing_enrichment(
  max_score INTEGER DEFAULT 80,
  limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  name text,
  data_quality_score INTEGER,
  missing_fields text[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    r.data_quality_score,
    ARRAY[
      CASE WHEN r.phone IS NULL THEN 'phone' END,
      CASE WHEN r.website IS NULL THEN 'website' END,
      CASE WHEN r.image_url IS NULL THEN 'image' END,
      CASE WHEN r.description IS NULL OR LENGTH(r.description) < 50 THEN 'description' END,
      CASE WHEN r.ai_writeup IS NULL THEN 'ai_writeup' END,
      CASE WHEN r.latitude IS NULL OR r.longitude IS NULL THEN 'coordinates' END,
      CASE WHEN r.rating IS NULL THEN 'rating' END
    ]::text[] as missing_fields
  FROM restaurants r
  WHERE r.data_quality_score < max_score
  ORDER BY r.data_quality_score ASC, r.created_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_restaurants_needing_enrichment TO anon, authenticated;

-- Log success
DO $$
DECLARE
  stats RECORD;
BEGIN
  SELECT * INTO stats FROM restaurant_quality_stats;

  RAISE NOTICE '✅ Data quality scoring enabled successfully';
  RAISE NOTICE '';
  RAISE NOTICE 'Current Quality Statistics:';
  RAISE NOTICE '  Total Restaurants: %', stats.total_restaurants;
  RAISE NOTICE '  Average Quality Score: %/100', stats.avg_quality_score;
  RAISE NOTICE '  Excellent (90-100): % restaurants', stats.excellent_quality;
  RAISE NOTICE '  Good (70-89): % restaurants', stats.good_quality;
  RAISE NOTICE '  Fair (50-69): % restaurants', stats.fair_quality;
  RAISE NOTICE '  Poor (0-49): % restaurants', stats.poor_quality;
  RAISE NOTICE '';
  RAISE NOTICE 'Missing Data:';
  RAISE NOTICE '  Phone: % restaurants', stats.missing_phone;
  RAISE NOTICE '  Website: % restaurants', stats.missing_website;
  RAISE NOTICE '  Image: % restaurants', stats.missing_image;
  RAISE NOTICE '  Description: % restaurants', stats.missing_description;
  RAISE NOTICE '  Coordinates: % restaurants', stats.missing_coordinates;
  RAISE NOTICE '  Rating: % restaurants', stats.missing_rating;
  RAISE NOTICE '';
  RAISE NOTICE 'Usage:';
  RAISE NOTICE '  -- View quality stats';
  RAISE NOTICE '  SELECT * FROM restaurant_quality_stats;';
  RAISE NOTICE '';
  RAISE NOTICE '  -- Get restaurants needing enrichment (score < 80)';
  RAISE NOTICE '  SELECT * FROM get_restaurants_needing_enrichment(80, 20);';
END $$;
