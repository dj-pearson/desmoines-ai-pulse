-- Phase 1 Security Fix: Add SET search_path = '' to functions missing this security setting
-- This prevents search path injection attacks by ensuring functions use fully qualified names

-- Fix calculate_social_buzz_score function
CREATE OR REPLACE FUNCTION public.calculate_social_buzz_score(views_count integer, shares_count integer, saves_count integer, going_count integer, interested_count integer)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  RETURN (
    (views_count * 0.1) +
    (shares_count * 2.0) +
    (saves_count * 1.5) +
    (going_count * 3.0) +
    (interested_count * 1.0)
  );
END;
$function$;

-- Fix calculate_restaurant_popularity_score function
CREATE OR REPLACE FUNCTION public.calculate_restaurant_popularity_score(restaurant_rating numeric, is_featured boolean, days_since_created integer, review_count integer DEFAULT 0)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  RETURN LEAST(100, GREATEST(0,
    COALESCE(restaurant_rating * 10, 25)::INTEGER +
    CASE WHEN is_featured THEN 20 ELSE 0 END +
    CASE 
      WHEN days_since_created <= 30 THEN 20
      WHEN days_since_created <= 90 THEN 15
      WHEN days_since_created <= 180 THEN 10
      WHEN days_since_created <= 365 THEN 5
      ELSE 0
    END +
    LEAST(10, review_count / 5)
  ));
END;
$function$;

-- Fix generate_restaurant_slug function
CREATE OR REPLACE FUNCTION public.generate_restaurant_slug(restaurant_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  RETURN lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(restaurant_name, '[^a-zA-Z0-9\s-]', '', 'g'),
        '\s+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  );
END;
$function$;

-- Fix auto_generate_restaurant_slug function
CREATE OR REPLACE FUNCTION public.auto_generate_restaurant_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 1;
BEGIN
  -- Generate base slug
  base_slug := public.generate_restaurant_slug(NEW.name);
  final_slug := base_slug;
  
  -- Check for existing slugs and append number if needed
  WHILE EXISTS (SELECT 1 FROM public.restaurants WHERE slug = final_slug AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  NEW.slug := final_slug;
  RETURN NEW;
END;
$function$;

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Fix get_next_optimal_posting_time function
CREATE OR REPLACE FUNCTION public.get_next_optimal_posting_time(base_time timestamp with time zone DEFAULT now())
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  next_time TIMESTAMPTZ;
  day_of_week INTEGER;
  hour_of_day INTEGER;
BEGIN
  next_time := base_time;
  
  LOOP
    day_of_week := EXTRACT(DOW FROM next_time); -- 0=Sunday, 6=Saturday
    hour_of_day := EXTRACT(HOUR FROM next_time);
    
    -- Check if current time is within optimal posting hours
    IF (day_of_week BETWEEN 1 AND 5 AND hour_of_day BETWEEN 9 AND 18) OR  -- Weekdays 9AM-6PM
       (day_of_week IN (0, 6) AND hour_of_day BETWEEN 10 AND 16) THEN     -- Weekends 10AM-4PM
      RETURN next_time;
    END IF;
    
    -- Move to next hour
    next_time := next_time + INTERVAL '1 hour';
    
    -- Skip to next business day if it's too late
    IF day_of_week BETWEEN 1 AND 5 AND hour_of_day >= 18 THEN
      next_time := DATE_TRUNC('day', next_time) + INTERVAL '1 day 9 hours';
    ELSIF day_of_week IN (0, 6) AND hour_of_day >= 16 THEN
      next_time := DATE_TRUNC('day', next_time) + INTERVAL '1 day 10 hours';
    END IF;
  END LOOP;
END;
$function$;