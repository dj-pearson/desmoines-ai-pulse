-- TIMEZONE CONVERSION SCRIPT FOR DES MOINES INSIDER EVENTS
-- 
-- This script converts existing UTC midnight events to proper CDT evening times
-- Run this in your Supabase SQL Editor
--
-- BEFORE RUNNING: 
-- 1. Backup your events table
-- 2. Test with a small subset first by adding WHERE id = 'specific-event-id'

-- Step 1: First let's see what we're working with
-- Uncomment this query to inspect current events:
/*
SELECT 
    id,
    title,
    date as original_utc_date,
    date AT TIME ZONE 'America/Chicago' as current_cdt_display,
    EXTRACT(HOUR FROM date AT TIME ZONE 'UTC') as utc_hour,
    EXTRACT(MINUTE FROM date AT TIME ZONE 'UTC') as utc_minute,
    source_url
FROM events 
WHERE EXTRACT(HOUR FROM date AT TIME ZONE 'UTC') = 0 
    AND EXTRACT(MINUTE FROM date AT TIME ZONE 'UTC') = 0
ORDER BY date 
LIMIT 10;
*/

-- Step 2: Preview the conversion (DRY RUN)
-- This shows what the dates WOULD become:
SELECT 
    id,
    title,
    date as original_utc_date,
    date AT TIME ZONE 'America/Chicago' as original_cdt_display,
    -- Convert to CDT date and add 7:30 PM, then back to UTC for storage
    ((date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::date + INTERVAL '19 hours 30 minutes') 
        AT TIME ZONE 'America/Chicago' AT TIME ZONE 'UTC' as new_utc_date,
    ((date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::date + INTERVAL '19 hours 30 minutes') 
        AT TIME ZONE 'America/Chicago' as new_cdt_display
FROM events 
WHERE EXTRACT(HOUR FROM date AT TIME ZONE 'UTC') = 0 
    AND EXTRACT(MINUTE FROM date AT TIME ZONE 'UTC') = 0
ORDER BY date 
LIMIT 10;

-- Step 3: ACTUAL CONVERSION (uncomment when ready)
-- IMPORTANT: Test with a specific event first by adding WHERE id = 'your-event-id'
/*
UPDATE events 
SET 
    date = (
        -- Convert to CDT/CST date and set to 7:30 PM, then convert back to UTC
        ((date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::date + INTERVAL '19 hours 30 minutes') 
        AT TIME ZONE 'America/Chicago' AT TIME ZONE 'UTC'
    ),
    updated_at = now()
WHERE 
    -- Only update events that are stored as midnight UTC
    EXTRACT(HOUR FROM date AT TIME ZONE 'UTC') = 0 
    AND EXTRACT(MINUTE FROM date AT TIME ZONE 'UTC') = 0 
    AND EXTRACT(SECOND FROM date AT TIME ZONE 'UTC') = 0;
*/

-- Step 4: Verify the changes
-- Uncomment after running the update:
/*
SELECT 
    id,
    title,
    date as new_utc_date,
    date AT TIME ZONE 'America/Chicago' as new_cdt_display,
    updated_at
FROM events 
ORDER BY updated_at DESC 
LIMIT 10;
*/

-- SPECIFIC EXAMPLES:
-- Test with the events you mentioned:

-- Preview Eddie and the Getaway conversion:
SELECT 
    title,
    date as original_utc,
    date AT TIME ZONE 'America/Chicago' as original_cdt,
    ((date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::date + INTERVAL '19 hours') 
        AT TIME ZONE 'America/Chicago' AT TIME ZONE 'UTC' as new_utc_7pm,
    ((date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::date + INTERVAL '19 hours') 
        AT TIME ZONE 'America/Chicago' as new_cdt_7pm
FROM events 
WHERE title ILIKE '%eddie%getaway%';

-- Preview Def Leppard conversion:
SELECT 
    title,
    date as original_utc,
    date AT TIME ZONE 'America/Chicago' as original_cdt,
    ((date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::date + INTERVAL '20 hours') 
        AT TIME ZONE 'America/Chicago' AT TIME ZONE 'UTC' as new_utc_8pm,
    ((date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::date + INTERVAL '20 hours') 
        AT TIME ZONE 'America/Chicago' as new_cdt_8pm
FROM events 
WHERE title ILIKE '%def%leppard%';
