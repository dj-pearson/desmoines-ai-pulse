-- Add Google Places integration columns to restaurants table
ALTER TABLE restaurants 
ADD COLUMN IF NOT EXISTS google_place_id TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
