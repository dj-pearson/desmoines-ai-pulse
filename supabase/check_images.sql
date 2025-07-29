SELECT name, image_url 
FROM restaurants 
WHERE image_url IS NOT NULL 
LIMIT 5;
