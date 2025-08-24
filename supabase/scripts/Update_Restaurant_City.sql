UPDATE restaurants
SET city = 
  CASE
    WHEN location IS NOT NULL AND position(',' IN location) > 0
    THEN trim(split_part(location, ',', 2))
    ELSE NULL
  END
WHERE city IS NULL OR city ~ 'IA|[0-9]{5}';