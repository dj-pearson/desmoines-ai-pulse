-- Add popularity_score column to restaurants table for AI-based ranking
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS popularity_score INTEGER DEFAULT 0;

-- Create a function to calculate AI-based popularity score
CREATE OR REPLACE FUNCTION calculate_restaurant_popularity_score(
  restaurant_rating DECIMAL(2,1),
  is_featured BOOLEAN,
  days_since_created INTEGER,
  review_count INTEGER DEFAULT 0
) 
RETURNS INTEGER AS $$
BEGIN
  -- AI-based popularity calculation
  -- Base score from rating (0-50 points)
  -- Featured bonus (20 points)
  -- Recency bonus (0-20 points, higher for newer restaurants)
  -- Review count bonus (0-10 points)
  
  RETURN LEAST(100, GREATEST(0,
    -- Rating component (0-50 points)
    COALESCE(restaurant_rating * 10, 25)::INTEGER +
    
    -- Featured bonus
    CASE WHEN is_featured THEN 20 ELSE 0 END +
    
    -- Recency bonus (newer restaurants get boost)
    CASE 
      WHEN days_since_created <= 30 THEN 20
      WHEN days_since_created <= 90 THEN 15
      WHEN days_since_created <= 180 THEN 10
      WHEN days_since_created <= 365 THEN 5
      ELSE 0
    END +
    
    -- Review count simulation (would be real review count in production)
    LEAST(10, review_count / 5)
  ));
END;
$$ LANGUAGE plpgsql;

-- Update existing restaurants with calculated popularity scores
UPDATE public.restaurants 
SET popularity_score = calculate_restaurant_popularity_score(
  rating,
  is_featured,
  EXTRACT(DAY FROM (NOW() - created_at))::INTEGER,
  -- Simulate review count based on rating and age
  CASE 
    WHEN rating IS NOT NULL THEN 
      GREATEST(1, (rating * 10 + RANDOM() * 20)::INTEGER)
    ELSE 
      (RANDOM() * 15 + 5)::INTEGER
  END
);

-- Create index for better performance on popularity sorting
CREATE INDEX IF NOT EXISTS idx_restaurants_popularity_score ON public.restaurants(popularity_score DESC);

-- Add view count tracking for future popularity calculations
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;