import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Enhanced timezone-aware date/time extraction functions
// These functions will be added to the main scraper

/**
 * Enhanced date and time extraction with proper CDT/CST timezone handling
 */
function extractDateTimeWithTimezone(
  html: string,
  dateSelector: string
): Date | null {
  console.log(
    `🕐 Attempting to extract date/time with timezone awareness: "${dateSelector}"`
  );

  // Step 1: Extract date text
  let dateText = querySelectorText(html, dateSelector);
  let timeText = "";

  // Step 2: Also look for time information nearby
  const timePatterns = [
    /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/gi,
    /(\d{1,2}\s*(?:AM|PM|am|pm))/gi,
    /(?:at|@)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/gi,
    /doors?\s*(?:at|open|@)?\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/gi,
    /show\s*(?:at|starts|@)?\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/gi,
    /(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/gi,
  ];

  // Try to find time in the same area as the date
  for (const pattern of timePatterns) {
    const timeMatch = html.match(pattern);
    if (timeMatch) {
      timeText = timeMatch[1] || timeMatch[0];
      console.log(`🕐 Found time text: "${timeText}"`);
      break;
    }
  }

  // Step 3: If no date text found, try fallback patterns
  if (!dateText) {
    console.log(`🔍 Primary selector failed, trying fallback patterns...`);

    const datePatterns = [
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/gi,
      /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/gi,
      /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
      /\b\d{4}-\d{2}-\d{2}\b/g,
    ];

    for (const pattern of datePatterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        for (const match of matches.slice(0, 3)) {
          const testDate = new Date(match);
          if (
            !isNaN(testDate.getTime()) &&
            testDate > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          ) {
            dateText = match;
            console.log(`🔍 Found date via pattern matching: "${dateText}"`);
            break;
          }
        }
        if (dateText) break;
      }
    }
  }

  if (!dateText) {
    console.log(`🔍 No date text found`);
    return null;
  }

  console.log(`🔍 Raw date text: "${dateText}", time text: "${timeText}"`);

  // Step 4: Parse the date
  let parsedDate = parseFlexibleDate(dateText);
  if (!parsedDate) {
    console.log(`⚠️ Could not parse date: "${dateText}"`);
    return null;
  }

  // Step 5: Add time information if found
  if (timeText) {
    parsedDate = addTimeToDate(parsedDate, timeText);
  } else {
    // Default to 7:00 PM CDT if no time specified (common for evening events)
    parsedDate.setHours(19, 0, 0, 0); // 7:00 PM
    console.log(`🕐 No time found, defaulting to 7:00 PM CDT`);
  }

  // Step 6: Convert to CDT/CST and then to UTC for storage
  const cdtDate = convertToCentralTime(parsedDate);

  console.log(
    `✅ Final date: ${cdtDate.toISOString()} (displays as ${cdtDate.toLocaleString(
      "en-US",
      { timeZone: "America/Chicago" }
    )} CDT)`
  );

  return cdtDate;
}

/**
 * Parse flexible date formats with better year handling
 */
function parseFlexibleDate(dateText: string): Date | null {
  const cleanDateText = dateText.trim();

  // Try parsing the date directly first
  let parsedDate = new Date(cleanDateText);

  // If invalid, try specific patterns
  if (isNaN(parsedDate.getTime())) {
    const datePatterns = [
      /(\w{3,9}\s+\d{1,2},?\s+\d{4})/i, // "January 15, 2025"
      /(\d{4}-\d{2}-\d{2})/, // "2025-01-15"
      /(\d{1,2}\/\d{1,2}\/\d{4})/, // "1/15/2025"
      /(\d{1,2}-\d{1,2}-\d{4})/, // "1-15-2025"
    ];

    for (const pattern of datePatterns) {
      const match = cleanDateText.match(pattern);
      if (match) {
        parsedDate = new Date(match[1]);
        if (!isNaN(parsedDate.getTime())) {
          break;
        }
      }
    }
  }

  // Validate and fix year if needed
  if (!isNaN(parsedDate.getTime())) {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);
    const threeYearsFromNow = new Date(
      now.getTime() + 3 * 365 * 24 * 60 * 60 * 1000
    );

    // If year is too old, try current or next year
    if (parsedDate.getFullYear() < 2020) {
      const currentYearDate = new Date(parsedDate);
      currentYearDate.setFullYear(now.getFullYear());

      // If that's in the past, try next year
      if (currentYearDate < now) {
        currentYearDate.setFullYear(now.getFullYear() + 1);
      }

      if (
        currentYearDate >= sixMonthsAgo &&
        currentYearDate <= threeYearsFromNow
      ) {
        return currentYearDate;
      }
    }

    if (parsedDate >= sixMonthsAgo && parsedDate <= threeYearsFromNow) {
      return parsedDate;
    }
  }

  return null;
}

/**
 * Add time information to a date
 */
function addTimeToDate(date: Date, timeStr: string): Date {
  const timeMatch = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/);

  if (!timeMatch) {
    return date; // Return original date if time parsing fails
  }

  let hours = parseInt(timeMatch[1]);
  const minutes = parseInt(timeMatch[2] || "0");
  const ampm = timeMatch[3]?.toUpperCase();

  // Convert to 24-hour format
  if (ampm === "PM" && hours < 12) {
    hours += 12;
  } else if (ampm === "AM" && hours === 12) {
    hours = 0;
  }

  const combined = new Date(date);
  combined.setHours(hours, minutes, 0, 0);

  console.log(
    `🕐 Combined date/time: ${combined.toLocaleString("en-US", {
      timeZone: "America/Chicago",
    })} CDT`
  );

  return combined;
}

/**
 * Convert a local time to Central Time (CDT/CST) and then to UTC for storage
 */
function convertToCentralTime(localDate: Date): Date {
  // Create a date string in Central timezone
  const centralTimeString = localDate.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Parse it back to get the UTC equivalent
  const [datePart, timePart] = centralTimeString.split(", ");
  const [month, day, year] = datePart.split("/");
  const [hour, minute, second] = timePart.split(":");

  // Create new date assuming the input was in Central Time
  const centralDate = new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}`
  );

  // Get timezone offset for Central Time (varies between CDT and CST)
  const centralOffset = getCentralTimezoneOffset(centralDate);

  // Convert to UTC by adjusting for timezone offset
  const utcDate = new Date(centralDate.getTime() - centralOffset * 60000);

  return utcDate;
}

/**
 * Get the timezone offset for Central Time (accounts for DST)
 */
function getCentralTimezoneOffset(date: Date): number {
  // Create a date in Central timezone to check if DST is in effect
  const centralTime = new Date(
    date.toLocaleString("en-US", { timeZone: "America/Chicago" })
  );
  const utcTime = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));

  // Calculate offset (CDT is UTC-5, CST is UTC-6)
  const offset = (utcTime.getTime() - centralTime.getTime()) / (1000 * 60);

  // Return the offset (negative for timezones behind UTC)
  return offset;
}

/**
 * Enhanced AI prompt for better date/time extraction
 */
function createEnhancedEventExtractionPrompt(
  html: string,
  jobName: string
): string {
  return `Extract event information from this HTML, paying special attention to dates and times. All events are in the Des Moines, Iowa area (Central Time Zone).

IMPORTANT TIMEZONE INSTRUCTIONS:
- Convert all times to Central Time (CDT in summer, CST in winter)
- If no time is specified, assume 7:00 PM Central Time for evening events
- For all-day events, use 12:00 PM Central Time
- Always include both date AND time in your response

HTML Content (first 4000 characters):
${html.substring(0, 4000)}

Please extract events in this exact JSON format:
{
  "events": [
    {
      "title": "Event Title",
      "description": "Event description",
      "date": "2025-07-30", // YYYY-MM-DD format
      "time": "7:00 PM", // Include time with AM/PM
      "location": "Venue Name",
      "venue": "Venue Name", 
      "category": "music|arts|food|sports|family|business|other",
      "price": "Free" or "$XX" or "Varies",
      "source_url": "${jobName}"
    }
  ]
}

Focus on finding:
1. Event titles
2. Dates (convert to Central Time)
3. Times (convert to Central Time, default to 7:00 PM if not specified)
4. Venue/location information
5. Brief descriptions
6. Pricing if mentioned

Return only valid JSON. If no events found, return {"events": []}.`;
}

export {
  extractDateTimeWithTimezone,
  parseFlexibleDate,
  addTimeToDate,
  convertToCentralTime,
  getCentralTimezoneOffset,
  createEnhancedEventExtractionPrompt,
};
