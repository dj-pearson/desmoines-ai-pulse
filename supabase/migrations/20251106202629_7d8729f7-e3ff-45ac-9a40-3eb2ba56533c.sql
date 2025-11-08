-- Add full-text search function for events
CREATE OR REPLACE FUNCTION public.fuzzy_search_events(search_query TEXT, search_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  original_description TEXT,
  enhanced_description TEXT,
  ai_writeup TEXT,
  date TIMESTAMPTZ,
  category TEXT,
  location TEXT,
  venue TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  image_url TEXT,
  source_url TEXT,
  price TEXT,
  city TEXT,
  relevance_score REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.title,
    e.description,
    e.original_description,
    e.enhanced_description,
    e.ai_writeup,
    e.date,
    e.category,
    e.location,
    e.venue,
    e.latitude,
    e.longitude,
    e.image_url,
    e.source_url,
    e.price,
    e.city,
    GREATEST(
      similarity(e.title, search_query),
      similarity(COALESCE(e.description, ''), search_query),
      similarity(COALESCE(e.venue, ''), search_query),
      similarity(COALESCE(e.category, ''), search_query)
    )::REAL as relevance_score
  FROM public.events e
  WHERE 
    e.title ILIKE '%' || search_query || '%'
    OR COALESCE(e.description, '') ILIKE '%' || search_query || '%'
    OR COALESCE(e.venue, '') ILIKE '%' || search_query || '%'
    OR COALESCE(e.category, '') ILIKE '%' || search_query || '%'
  ORDER BY relevance_score DESC
  LIMIT search_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Add full-text search function for restaurants
CREATE OR REPLACE FUNCTION public.fuzzy_search_restaurants(search_query TEXT, search_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  cuisine TEXT,
  location TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  phone TEXT,
  website TEXT,
  rating NUMERIC,
  price_range TEXT,
  image_url TEXT,
  city TEXT,
  relevance_score REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.name,
    r.description,
    r.cuisine,
    r.location,
    r.latitude,
    r.longitude,
    r.phone,
    r.website,
    r.rating,
    r.price_range,
    r.image_url,
    r.city,
    GREATEST(
      similarity(r.name, search_query),
      similarity(COALESCE(r.description, ''), search_query),
      similarity(COALESCE(r.cuisine, ''), search_query),
      similarity(COALESCE(r.location, ''), search_query)
    )::REAL as relevance_score
  FROM public.restaurants r
  WHERE 
    r.name ILIKE '%' || search_query || '%'
    OR COALESCE(r.description, '') ILIKE '%' || search_query || '%'
    OR COALESCE(r.cuisine, '') ILIKE '%' || search_query || '%'
    OR COALESCE(r.location, '') ILIKE '%' || search_query || '%'
  ORDER BY relevance_score DESC
  LIMIT search_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;