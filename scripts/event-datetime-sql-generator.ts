import { createClient } from "@supabase/supabase-js";
import puppeteer, { Browser } from "puppeteer";
import { fromZonedTime } from "date-fns-tz";
import * as fs from "fs";

// Supabase client setup
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

interface UpdateRecord {
  eventId: string;
  title: string;
  sourceUrl: string;
  currentDate: string;
  newDate: string;
  confidence: string;
  extractedTime?: string;
}

class EventDateTimeCrawlerSQL {
  private browser: Browser | null = null;
  private updates: UpdateRecord[] = [];

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox", 
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor"
      ],
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async extractDateTimeFromUrl(
    url: string,
    eventTitle: string
  ): Promise<EventDateTimeInfo> {
    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    const page = await this.browser.newPage();

    try {
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      );

      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
      await new Promise((resolve) => setTimeout(resolve, 5000));

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

        const datePatterns = [
          /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi,
          /\d{1,2}\/\d{1,2}\/\d{4}/g,
          /\d{4}-\d{2}-\d{2}/g,
          /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}/gi,
        ];

        const timePatterns = [
          /\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)/gi,
          /\d{1,2}\s*(?:AM|PM|am|pm)/gi,
          /(?:Doors|Show|Event|Starts?|Begins?)\s*(?:at|@)?\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)/gi,
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

        return results;
      });

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

    const now = new Date();
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(now.getFullYear() + 1);

    // Process JSON-LD structured data first (highest confidence)
    if (extracted.schemas && extracted.schemas.length > 0) {
      const schema = extracted.schemas[0];
      if (schema.startDate) {
        try {
          const extractedDate = new Date(schema.startDate);
          if (extractedDate > now && extractedDate <= oneYearFromNow) {
            result.extractedDate = extractedDate;
            result.confidence = "high";
            
            if (schema.startDate.includes('T') && (schema.startDate.includes('-') || schema.startDate.includes('+'))) {
              result.extractedTime = "structured_data";
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
          if (!isNaN(date.getTime()) && date > now && date <= oneYearFromNow) {
            result.extractedDate = date;
            result.confidence = "medium";
            break;
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

  async generateUpdateScript(eventId?: string, limit?: number, filterType?: 'platform' | 'safe' | 'all'): Promise<void> {
    console.log("🚀 Event DateTime Crawler - SQL Generator");
    console.log("═".repeat(50));

    let query = supabase
      .from("events")
      .select("id, title, date, source_url")
      .not("source_url", "is", null);

    if (eventId) {
      query = query.eq("id", eventId);
      console.log(`🎯 Target Event ID: ${eventId}`);
    } else {
      // Apply filtering based on URL patterns
      if (filterType === 'platform') {
        console.log(`🏢 Filter: Specific Platforms Only (Eventbrite, First Fleet, DMPA)`);
        query = query.or(
          "source_url.ilike.%eventbrite.com/e/%," +
          "source_url.ilike.%firstfleetconcerts.com/events/detail/%," +
          "source_url.ilike.%desmoinesperformingarts.org/whats-on/events/%," +
          "source_url.ilike.%ticketmaster.com%"
        );
      } else if (filterType === 'safe') {
        console.log(`🛡️ Filter: Safe URLs Only (excluding generic calendar pages)`);
        query = query
          .not("source_url", "ilike", "%/events?%")
          .not("source_url", "ilike", "%/events/?%")
          .not("source_url", "ilike", "%catchdesmoines.com/events/?skip=%")
          .not("source_url", "ilike", "%catchdesmoines.com/events/?utm_source=%");
      } else if (filterType === 'all') {
        console.log(`🌍 Filter: ALL Events (including problematic URLs)`);
      } else {
        console.log(`📊 Filter: Default (all events)`);
      }
      
      query = query.order("date", { ascending: true });
      if (limit) {
        query = query.limit(limit);
        console.log(`📊 Limit: ${limit} events`);
      }
    }

    const { data: events, error } = await query;

    if (error) {
      console.error("❌ Error fetching events:", error);
      return;
    }

    if (!events || events.length === 0) {
      console.log(eventId ? `❌ No event found with ID: ${eventId}` : "❌ No events with source URLs found");
      return;
    }

    console.log(`📋 Processing ${events.length} event(s)...`);
    console.log("─".repeat(50));

    for (const [index, event] of events.entries()) {
      console.log(`\n[${index + 1}/${events.length}] ${event.title}`);
      console.log(`📅 Current: ${event.date}`);
      console.log(`🔗 URL: ${event.source_url}`);

      try {
        const info = await this.extractDateTimeFromUrl(
          event.source_url,
          event.title
        );

        if (info.extractedDate) {
          console.log(`✅ Extracted: ${info.extractedDate.toISOString()}`);
          console.log(`🎯 Confidence: ${info.confidence}`);

          let finalDateTime: Date;
          if (info.extractedTime === "structured_data") {
            console.log("📊 Using complete datetime from structured data");
            finalDateTime = info.extractedDate;
          } else if (info.extractedTime) {
            console.log(`⏰ Time: ${info.extractedTime}`);
            const combinedDateTime = this.combineDateTime(
              info.extractedDate,
              info.extractedTime
            );
            finalDateTime = fromZonedTime(combinedDateTime, "America/Chicago");
          } else {
            console.log("⚠️  No time info, using date only");
            finalDateTime = info.extractedDate;
          }

          // Check if it's actually different from current
          const currentDate = new Date(event.date);
          const timeDiff = Math.abs(finalDateTime.getTime() - currentDate.getTime());
          
          if (timeDiff > 60000) { // More than 1 minute difference
            this.updates.push({
              eventId: event.id,
              title: event.title,
              sourceUrl: event.source_url,
              currentDate: event.date,
              newDate: finalDateTime.toISOString(),
              confidence: info.confidence,
              extractedTime: info.extractedTime
            });
            console.log("✅ Added to update list");
          } else {
            console.log("ℹ️  No significant change needed");
          }
        } else {
          console.log("❌ Could not extract valid date information");
          if (info.error) {
            console.log(`   Error: ${info.error}`);
          }
        }

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } catch (error) {
        console.error(`❌ Error processing event:`, error);
      }
    }

    await this.generateSQLFile();
  }

  private combineDateTime(date: Date, timeStr: string): Date {
    const timeMatch = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/);

    if (!timeMatch) {
      return date;
    }

    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2] || "0");
    const ampm = timeMatch[3]?.toUpperCase();

    if (ampm === "PM" && hours < 12) {
      hours += 12;
    } else if (ampm === "AM" && hours === 12) {
      hours = 0;
    }

    const combined = new Date(date);
    combined.setHours(hours, minutes, 0, 0);
    return combined;
  }

  private async generateSQLFile(): Promise<void> {
    console.log("\n" + "═".repeat(50));
    console.log("📝 GENERATING SQL UPDATE SCRIPT");
    console.log("═".repeat(50));

    if (this.updates.length === 0) {
      console.log("ℹ️  No updates needed - all events have correct dates/times");
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `event-datetime-updates-${timestamp}.sql`;
    
    let sqlContent = `-- Event DateTime Updates Generated on ${new Date().toISOString()}\n`;
    sqlContent += `-- Total updates: ${this.updates.length}\n\n`;
    
    sqlContent += `-- Preview of changes:\n`;
    this.updates.forEach((update, index) => {
      sqlContent += `-- ${index + 1}. ${update.title}\n`;
      sqlContent += `--    Current: ${update.currentDate}\n`;
      sqlContent += `--    New:     ${update.newDate}\n`;
      sqlContent += `--    Confidence: ${update.confidence}\n`;
      sqlContent += `--    Source: ${update.sourceUrl}\n\n`;
    });

    sqlContent += `\n-- SQL UPDATE STATEMENTS:\n`;
    sqlContent += `-- Execute these one at a time and verify the results\n\n`;

    this.updates.forEach((update, index) => {
      sqlContent += `-- Update ${index + 1}: ${update.title}\n`;
      sqlContent += `UPDATE events \nSET \n`;
      sqlContent += `  date = '${update.newDate}',\n`;
      sqlContent += `  updated_at = NOW()\n`;
      sqlContent += `WHERE id = '${update.eventId}';\n`;
      sqlContent += `-- Verify: SELECT title, date, updated_at FROM events WHERE id = '${update.eventId}';\n\n`;
    });

    // Verification queries
    sqlContent += `\n-- VERIFICATION QUERIES:\n`;
    sqlContent += `-- Run these to verify all updates were applied correctly\n\n`;
    
    sqlContent += `-- Check all updated events:\n`;
    sqlContent += `SELECT title, date, updated_at \nFROM events \nWHERE id IN (\n`;
    this.updates.forEach((update, index) => {
      sqlContent += `  '${update.eventId}'${index < this.updates.length - 1 ? ',' : ''}\n`;
    });
    sqlContent += `);\n\n`;

    sqlContent += `-- Count total changes:\n`;
    sqlContent += `SELECT COUNT(*) as updated_events \nFROM events \nWHERE updated_at > NOW() - INTERVAL '1 hour';\n`;

    try {
      await fs.promises.writeFile(filename, sqlContent, 'utf8');
      
      console.log(`✅ SQL script generated: ${filename}`);
      console.log(`📊 Updates to process: ${this.updates.length}`);
      console.log("\n📋 Summary of updates:");
      
      this.updates.forEach((update, index) => {
        console.log(`${index + 1}. ${update.title}`);
        console.log(`   Current: ${update.currentDate}`);
        console.log(`   New:     ${update.newDate}`);
        console.log(`   Confidence: ${update.confidence}`);
        console.log("");
      });

      console.log("🔧 Instructions:");
      console.log("1. Open Supabase SQL Editor");
      console.log(`2. Load the file: ${filename}`);
      console.log("3. Execute the UPDATE statements one by one");
      console.log("4. Run the verification queries to confirm changes");
      console.log("5. Check your website to see the corrected event times");
      
    } catch (error) {
      console.error("❌ Error writing SQL file:", error);
    }
  }
}

// CLI usage
async function main() {
  const args = process.argv.slice(2);
  
  const eventIdIndex = args.indexOf("--event-id");
  const eventId = eventIdIndex !== -1 && args[eventIdIndex + 1] ? args[eventIdIndex + 1] : undefined;
  
  const limitIndex = args.indexOf("--limit");
  const limit = limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1]) : undefined;

  // Determine filter type
  let filterType: 'platform' | 'safe' | 'all' | undefined;
  if (args.includes("--platform-filter")) {
    filterType = 'platform';
  } else if (args.includes("--safe-urls-only")) {
    filterType = 'safe';
  } else if (args.includes("--all")) {
    filterType = 'all';
  }

  console.log("🚀 Event DateTime Crawler");
  if (eventId) console.log(`Target Event ID: ${eventId}`);
  if (limit) console.log(`Limit: ${limit} events`);
  if (filterType) console.log(`Filter: ${filterType}`);
  console.log("───────────────────────────────");

  const crawler = new EventDateTimeCrawlerSQL();

  try {
    await crawler.initialize();
    await crawler.generateUpdateScript(eventId, limit, filterType);
  } catch (error) {
    console.error("❌ Crawler error:", error);
  } finally {
    await crawler.close();
  }
}

main().catch(console.error);
