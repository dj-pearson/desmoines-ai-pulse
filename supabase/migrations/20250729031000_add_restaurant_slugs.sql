-- Add slug column to restaurants table
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS slug TEXT;

-- Create function to generate slug from restaurant name
CREATE OR REPLACE FUNCTION generate_restaurant_slug(restaurant_name TEXT)
RETURNS TEXT AS $$
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
$$ LANGUAGE plpgsql;

-- Update existing restaurants with generated slugs
UPDATE public.restaurants 
SET slug = generate_restaurant_slug(name) 
WHERE slug IS NULL;

-- Handle duplicate slugs by adding numbers
WITH duplicate_slugs AS (
  SELECT slug, count(*) as count
  FROM public.restaurants 
  WHERE slug IS NOT NULL
  GROUP BY slug 
  HAVING count(*) > 1
),
numbered_slugs AS (
  SELECT 
    r.id,
    r.slug,
    ROW_NUMBER() OVER (PARTITION BY r.slug ORDER BY r.created_at) as rn
  FROM public.restaurants r
  INNER JOIN duplicate_slugs d ON r.slug = d.slug
)
UPDATE public.restaurants 
SET slug = numbered_slugs.slug || '-' || numbered_slugs.rn
FROM numbered_slugs 
WHERE restaurants.id = numbered_slugs.id 
AND numbered_slugs.rn > 1;

-- Create unique index on slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_slug 
ON public.restaurants(slug);

-- Add trigger to automatically generate slug for new restaurants
CREATE OR REPLACE FUNCTION auto_generate_restaurant_slug()
RETURNS TRIGGER AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 1;
BEGIN
  -- Generate base slug
  base_slug := generate_restaurant_slug(NEW.name);
  final_slug := base_slug;
  
  -- Check for existing slugs and append number if needed
  WHILE EXISTS (SELECT 1 FROM public.restaurants WHERE slug = final_slug AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  NEW.slug := final_slug;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_auto_generate_restaurant_slug ON public.restaurants;
CREATE TRIGGER trigger_auto_generate_restaurant_slug
  BEFORE INSERT OR UPDATE OF name ON public.restaurants
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_restaurant_slug();
