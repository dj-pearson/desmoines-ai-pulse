-- Add enhanced column to restaurants table for tracking Google Places API updates
ALTER TABLE restaurants 
ADD COLUMN IF NOT EXISTS enhanced TEXT DEFAULT NULL;
