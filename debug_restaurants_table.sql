-- Debug script to check current restaurants table structure
-- Run this in Supabase SQL Editor to see what columns exist

-- Check current table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'restaurants' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if the problematic columns exist
SELECT 
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'restaurants' 
        AND column_name = 'status'
    ) THEN 'status column EXISTS' 
    ELSE 'status column MISSING' END as status_check,
    
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'restaurants' 
        AND column_name = 'opening_timeframe'
    ) THEN 'opening_timeframe column EXISTS' 
    ELSE 'opening_timeframe column MISSING' END as timeframe_check,
    
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'restaurants' 
        AND column_name = 'opening_date'
    ) THEN 'opening_date column EXISTS' 
    ELSE 'opening_date column MISSING' END as date_check;

-- Sample data to see current values
SELECT id, name, status, opening_date, opening_timeframe, website
FROM public.restaurants 
LIMIT 3;
