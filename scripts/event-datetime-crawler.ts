import { createClient } from "@supabase/supabase-js";
import puppeteer, { Browser } from "puppeteer";
import { fromZonedTime, utcToZonedTime, format } from "date-fns-tz";

// Supabase client setup - using same credentials as convert-timezones.ts
const SUPABASE_URL = "https://wtkhfqpmcegzcbngroui.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1Mzc5NzcsImV4cCI6MjA2OTExMzk3N30.a-qKhaxy7l72IyT0eLq7kYuxm-wypuMxgycDy95r1aE";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

interface EventDateTimeInfo {
  id: string;
  title: string;
  sourceUrl: string;
  extractedDate?: Date;
  extractedTime?: string;
  confidence: "high" | "medium" | "low";
  error?: string;
}

class EventDateTimeCrawler {
  private browser: Browser | null = null;

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox", 
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-plugins",
        "--disable-images"
      ],
      protocolTimeout: 60000, // Increase protocol timeout
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * Extract date and time information from various event platforms
   */
  async extractDateTimeFromUrl(
    url: string,
    eventTitle: string
  ): Promise<EventDateTimeInfo> {
    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    const page = await this.browser.newPage();

    try {
      // Set user agent to avoid blocking
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      );

      // Navigate to the page
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

      // Wait a bit for dynamic content to load
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Extract date and time information using multiple strategies
      const dateTimeInfo = await page.evaluate(() => {
        interface ExtractedInfo {
          dates: string[];
          times: string[];
          schemas: Array<{
            startDate?: string;
            endDate?: string;
            name?: string;
          }>;
          text: string[];
        }

        const results: ExtractedInfo = {
          dates: [],
          times: [],
          schemas: [],
          text: [],
        };

        // Strategy 1: Look for JSON-LD structured data
        const scripts = document.querySelectorAll(
          'script[type="application/ld+json"]'
        );
        scripts.forEach((script) => {
          try {
            const data = JSON.parse(script.textContent || "");
            if (data["@type"] === "Event" || data.startDate) {
              results.schemas.push({
                startDate: data.startDate,
                endDate: data.endDate,
                name: data.name,
              });
            }
          } catch (e) {
            // Ignore invalid JSON
          }
        });

        // Strategy 2: Look for common date/time patterns in text
        const textContent = document.body.textContent || "";

        // Common date patterns
        const datePatterns = [
          /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi,
          /\d{1,2}\/\d{1,2}\/\d{4}/g,
          /\d{4}-\d{2}-\d{2}/g,
          /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}/gi,
        ];

        // Common time patterns
        const timePatterns = [
          /\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)/gi,
          /\d{1,2}\s*(?:AM|PM|am|pm)/gi,
          /(?:Doors|Show|Event|Starts?|Begins?)\s*(?:at|@)?\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)/gi,
          /\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)\s*(?:-|to|until)\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)/gi,
          /(?:from|start|begins?)\s+\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)/gi,
        ];

        datePatterns.forEach((pattern) => {
          const matches = textContent.match(pattern);
          if (matches) {
            results.dates.push(...matches);
          }
        });

        timePatterns.forEach((pattern) => {
          const matches = textContent.match(pattern);
          if (matches) {
            results.times.push(...matches);
          }
        });

        // Strategy 3: Look for common selectors used by event platforms
        const commonSelectors = [
          ".event-date",
          ".event-time",
          ".date",
          ".time",
          '[class*="date"]',
          '[class*="time"]',
          ".datetime",
          ".event-datetime",
          "time[datetime]",
          "[datetime]",
        ];

        commonSelectors.forEach((selector) => {
          const elements = document.querySelectorAll(selector);
          elements.forEach((el) => {
            const text = el.textContent?.trim();
            const datetime = el.getAttribute("datetime");
            if (text) results.text.push(text);
            if (datetime) results.text.push(datetime);
          });
        });

        return results;
      });

      // Process the extracted information
      return this.processExtractedInfo(url, eventTitle, dateTimeInfo);
    } catch (error) {
      console.error(`Error crawling ${url}:`, error);
      return {
        id: "",
        title: eventTitle,
        sourceUrl: url,
        confidence: "low",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      await page.close();
    }
  }

  private processExtractedInfo(
    url: string,
    title: string,
    extracted: {
      dates: string[];
      times: string[];
      schemas: Array<{ startDate?: string; endDate?: string; name?: string }>;
      text: string[];
    }
  ): EventDateTimeInfo {
    const result: EventDateTimeInfo = {
      id: "",
      title,
      sourceUrl: url,
      confidence: "low",
    };

    // Get current date for validation
    const now = new Date();
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(now.getFullYear() + 1);

    // Process JSON-LD structured data first (highest confidence)
    if (extracted.schemas && extracted.schemas.length > 0) {
      const schema = extracted.schemas[0];
      if (schema.startDate) {
        try {
          const extractedDate = new Date(schema.startDate);
          // Validate that the date is in the future and within one year
          if (extractedDate > now && extractedDate <= oneYearFromNow) {
            result.extractedDate = extractedDate;
            result.confidence = "high";
            
            // If the structured data includes time (not just date), mark as having time info
            if (schema.startDate.includes('T') && (schema.startDate.includes('-') || schema.startDate.includes('+'))) {
              result.extractedTime = "structured_data"; // Mark that time is included in the date
            }
            
            return result;
          } else {
            console.log(`🗓️ Rejected schema date (${extractedDate.toISOString()}) - not in valid future range`);
          }
        } catch (e) {
          // Invalid date format
        }
      }
    }

    // Process date and time patterns
    if (extracted.dates && extracted.dates.length > 0) {
      for (const dateStr of extracted.dates) {
        try {
          const date = new Date(dateStr);
          // Validate that the date is in the future and within one year
          if (!isNaN(date.getTime()) && date > now && date <= oneYearFromNow) {
            result.extractedDate = date;
            result.confidence = "medium";
            break; // Use the first valid future date
          } else if (!isNaN(date.getTime())) {
            console.log(`🗓️ Rejected date (${date.toISOString()}) - not in valid future range`);
          }
        } catch (e) {
          // Invalid date
        }
      }
    }

    if (extracted.times && extracted.times.length > 0) {
      result.extractedTime = extracted.times[0];
      if (result.extractedDate) {
        result.confidence = "high";
      }
    }

    return result;
  }

  /**
   * Update events in the database with correct CDT times
   */
  async updateEventsWithCorrectTimes(dryRun: boolean = true, eventId?: string, limit?: number): Promise<void> {
    console.log(
      `Starting event date/time correction ${dryRun ? "(DRY RUN)" : ""}`
    );

    let query = supabase
      .from("events")
      .select("id, title, date, source_url")
      .not("source_url", "is", null);

    // If specific event ID provided, filter to just that event
    if (eventId) {
      query = query.eq("id", eventId);
      console.log(`Filtering to specific event ID: ${eventId}`);
    } else {
      query = query.order("date", { ascending: true });
      if (limit) {
        query = query.limit(limit);
        console.log(`Limiting to ${limit} events`);
      }
    }

    const { data: events, error } = await query;

    if (error) {
      console.error("Error fetching events:", error);
      return;
    }

    if (!events || events.length === 0) {
      console.log(eventId ? `No event found with ID: ${eventId}` : "No events with source URLs found");
      return;
    }

    console.log(`Found ${events.length} event(s) to process`);

    for (const event of events) {
      console.log(`\nProcessing: ${event.title}`);
      console.log(`Current date: ${event.date}`);
      console.log(`Source URL: ${event.source_url}`);

      try {
        const info = await this.extractDateTimeFromUrl(
          event.source_url,
          event.title
        );

        if (info.extractedDate) {
          console.log(`Extracted date: ${info.extractedDate.toISOString()}`);
          console.log(`Confidence: ${info.confidence}`);

          if (info.extractedTime) {
            console.log(`Extracted time: ${info.extractedTime}`);

            // If time is from structured data, the date already includes time info
            let finalDateTime: Date;
            let eventStartLocal: string;
            let eventTimezone: string = "America/Chicago"; // Default to CDT

            if (info.extractedTime === "structured_data") {
              console.log("✅ Using complete datetime from structured data");
              finalDateTime = info.extractedDate;
              eventStartLocal = format(utcToZonedTime(finalDateTime, eventTimezone), "yyyy-MM-dd HH:mm:ss");
            } else {
              const combinedDateTime = this.combineDateTime(
                info.extractedDate,
                info.extractedTime
              );
              eventStartLocal = format(combinedDateTime, "yyyy-MM-dd HH:mm:ss");
              finalDateTime = fromZonedTime(
                combinedDateTime,
                eventTimezone
              );
            }

            if (!dryRun) {
              const { data: updateData, error: updateError } = await supabase
                .from("events")
                .update({
                  date: finalDateTime.toISOString(), // Keep for now, will remove later
                  event_start_local: eventStartLocal,
                  event_timezone: eventTimezone,
                  event_start_utc: finalDateTime,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", event.id)
                .select(); // Return the updated record to verify

              if (updateError) {
                console.error(`❌ Error updating event ${event.id}:`, updateError);
              } else if (updateData && updateData.length > 0) {
                console.log(
                  `✅ Successfully updated event: ${eventStartLocal} (${eventTimezone}) -> ${finalDateTime.toISOString()} (UTC)`
                );
                console.log(`📝 Database record updated at: ${updateData[0].updated_at}`);
              } else {
                console.log(`⚠️ Update command succeeded but no rows were affected`);
              }
            } else {
              console.log(`🔍 Would update to: ${eventStartLocal} (${eventTimezone}) -> ${finalDateTime.toISOString()} (UTC)`);
            }
          } else {
            console.log("⚠️ No time information found, keeping existing time");
          }
        } else {
          console.log("❌ Could not extract date information");
          if (info.error) {
            console.log(`Error: ${info.error}`);
          }
        }

        // Rate limiting - wait between requests
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } catch (error) {
        console.error(`Error processing event ${event.id}:`, error);
        
        // Skip problematic URLs and continue
        if (error instanceof Error && error.message.includes('timeout')) {
          console.log('⏰ Skipping due to timeout, continuing with next event...');
        }
      }
    }

    console.log("\n✅ Event processing complete");
  }

  private combineDateTime(date: Date, timeStr: string): Date {
    // Parse time string (e.g., "7:30 PM", "8 PM", "19:30")
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

    return combined;
  }
}

// CLI usage
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--apply");
  
  // Parse command line arguments
  const eventIdIndex = args.indexOf("--event-id");
  const eventId = eventIdIndex !== -1 && args[eventIdIndex + 1] ? args[eventIdIndex + 1] : undefined;
  
  const limitIndex = args.indexOf("--limit");
  const limit = limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1]) : undefined;

  console.log("🚀 Event DateTime Crawler");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE UPDATE"}`);
  if (eventId) console.log(`Target Event ID: ${eventId}`);
  if (limit) console.log(`Limit: ${limit} events`);
  console.log("───────────────────────────────");

  const crawler = new EventDateTimeCrawler();

  try {
    await crawler.initialize();
    await crawler.updateEventsWithCorrectTimes(dryRun, eventId, limit);
  } catch (error) {
    console.error("Crawler error:", error);
  } finally {
    await crawler.close();
  }
}

// Export for use as module
export { EventDateTimeCrawler };

// Run the main function
main().catch(console.error);
