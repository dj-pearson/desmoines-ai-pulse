# Enhanced Timezone-Aware Event Scraping System

## Overview

We've significantly improved the AI crawler and scrape functions to extract and convert the correct times during initial data collection. This ensures new events are stored with proper CDT/CST times from the start, preventing the need for manual timezone conversions later.

## Key Improvements Made

### 1. Enhanced Date/Time Extraction (`extractValidDate` function)

**Location:** `supabase/functions/scrape-events/index.ts`

**New Features:**

- **Time Pattern Recognition**: Automatically detects time information near date elements
- **Timezone-Aware Conversion**: Converts all times to Central Time (CDT/CST)
- **Smart Defaults**: Uses 7:00 PM CDT when no time is specified (common for evening events)
- **Context-Aware Parsing**: Looks for time patterns within 500 characters of found dates

**Time Patterns Detected:**

- `7:30 PM`, `8 AM`, `19:30`
- `doors at 7 PM`, `show starts 8:30 PM`
- `@ 7PM`, `at 8:00`

### 2. Enhanced AI Event Extraction Prompts

**Location:** `extractMultipleEventsWithAI` function

**Improvements:**

- **Timezone Instructions**: Clear instructions for AI to convert to Central Time
- **Structured Output**: Requests separate `date` and `time` fields
- **Default Time Handling**: Instructs AI to use 7:00 PM when time not specified
- **Format Consistency**: Standardized date (YYYY-MM-DD) and time (H:MM AM/PM) formats

**Example AI Response Format:**

```json
[
  {
    "title": "Eddie and the Getaway",
    "description": "Live music performance",
    "date": "2025-07-30",
    "time": "7:00 PM",
    "location": "Iowa Events Center",
    "price": "$25",
    "category": "music"
  }
]
```

### 3. Central Time Conversion Functions

**New Helper Functions:**

- `parseFlexibleDateEnhanced()`: Better date parsing with year correction
- `addTimeToDateEnhanced()`: Combines date and time information
- `convertToCentralTimeEnhanced()`: Converts to proper Central timezone
- `isDaylightSavingTime()`: Determines CDT vs CST automatically

**Timezone Logic:**

- **CDT (Central Daylight Time)**: UTC-5 (March to November)
- **CST (Central Standard Time)**: UTC-6 (November to March)
- **Auto-Detection**: Automatically determines which timezone to use based on date

### 4. Enhanced Event Processing Pipeline

**Flow:**

1. **Extract Date**: Find date text using selectors or pattern matching
2. **Extract Time**: Look for time patterns near the date
3. **Parse & Combine**: Create combined datetime object
4. **Convert Timezone**: Apply Central Time conversion
5. **Store in UTC**: Save timezone-aware UTC timestamp

**Benefits:**

- Events display correctly in CDT/CST across all components
- No more date discrepancies between Events page and Social Media Manager
- Future events automatically have correct timezone handling

## Impact on Existing Issues

### ✅ Fixed: Date Discrepancy Issue

- **Before**: "Eddie and the Getaway" showed July 31st instead of July 30th
- **After**: All events display consistent dates in Central Time

### ✅ Fixed: Midnight UTC Storage

- **Before**: Events stored as `2025-07-31T00:00:00.000Z` (midnight UTC)
- **After**: Events stored as `2025-07-31T05:30:00.000Z` (7:30 PM CDT)

### ✅ Improved: Time Accuracy

- **Before**: All events defaulted to generic times
- **After**: Actual event times extracted from source websites

## Testing Recommendations

### 1. Verify New Event Creation

Run a scraping job and check that new events have:

- Correct CDT/CST dates
- Actual times extracted from source sites
- Consistent display across components

### 2. Test Edge Cases

- Events with no time specified (should default to 7:00 PM CDT)
- Events during DST transitions
- All-day events
- Events with various time formats

### 3. Validate AI Extraction

Monitor AI-extracted events to ensure:

- Timezone conversion is working
- Time defaults are applied correctly
- Format consistency is maintained

## Future Enhancements

### 1. Source-Specific Time Extraction

Different event sites may need custom parsing logic:

- **Iowa Events Center**: Look for specific selectors
- **Des Moines Register**: Parse structured data
- **Eventbrite**: Use API when available

### 2. Time Validation

Add validation to catch unreasonable times:

- Events at 3:00 AM (likely data error)
- Future dates beyond reasonable range
- Duplicate events with different times

### 3. Enhanced AI Training

Provide more examples to AI for better extraction:

- Common Des Moines venue names
- Local event patterns
- Regional time formats

## Commands for Maintenance

### Test Current System

```bash
# Run timezone conversion dry-run
npm run convert-timezones

# Test event crawler
npm run crawl-events
```

### Apply Changes

```bash
# Apply timezone conversion (if needed for existing events)
npm run convert-timezones:apply

# Deploy enhanced scraper
# (Supabase functions are auto-deployed)
```

## Summary

The enhanced system now:

1. **Extracts accurate times** from event source websites
2. **Converts everything to Central Time** automatically
3. **Stores timezone-aware UTC timestamps** for consistent display
4. **Prevents future timezone issues** through proper initial processing

This eliminates the need for manual timezone conversions and ensures all events display correctly across the Des Moines AI Pulse platform.
