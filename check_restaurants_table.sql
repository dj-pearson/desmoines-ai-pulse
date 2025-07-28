-- Get the actual structure of the restaurants table
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default,
    character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'restaurants' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Also check what data we have to understand the fields better
SELECT 
    id, 
    name, 
    website, 
    location, 
    cuisine, 
    description,
    phone,
    price_range,
    rating,
    image_url,
    is_featured,
    created_at,
    updated_at
FROM public.restaurants 
LIMIT 3;
