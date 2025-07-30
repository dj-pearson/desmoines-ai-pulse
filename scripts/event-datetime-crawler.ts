import { createClient } from "@supabase/supabase-js";
import puppeteer, { Browser } from "puppeteer";
import { zonedTimeToUtc } from "date-fns-tz";

// Supabase client setup
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

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
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
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
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

      // Wait a bit for dynamic content to load
      await new Promise((resolve) => setTimeout(resolve, 3000));

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
          /(?:Doors|Show|Event)\s*(?:at|@)?\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)/gi,
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

    // Process JSON-LD structured data first (highest confidence)
    if (extracted.schemas && extracted.schemas.length > 0) {
      const schema = extracted.schemas[0];
      if (schema.startDate) {
        try {
          result.extractedDate = new Date(schema.startDate);
          result.confidence = "high";
          return result;
        } catch (e) {
          // Invalid date format
        }
      }
    }

    // Process date and time patterns
    if (extracted.dates && extracted.dates.length > 0) {
      const dateStr = extracted.dates[0];
      try {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          result.extractedDate = date;
          result.confidence = "medium";
        }
      } catch (e) {
        // Invalid date
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
  async updateEventsWithCorrectTimes(dryRun: boolean = true): Promise<void> {
    console.log(
      `Starting event date/time correction ${dryRun ? "(DRY RUN)" : ""}`
    );

    // Get events that have source URLs
    const { data: events, error } = await supabase
      .from("events")
      .select("id, title, date, source_url")
      .not("source_url", "is", null)
      .order("date", { ascending: true });

    if (error) {
      console.error("Error fetching events:", error);
      return;
    }

    if (!events || events.length === 0) {
      console.log("No events with source URLs found");
      return;
    }

    console.log(`Found ${events.length} events to process`);

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

            // Combine date and time and convert to UTC for storage
            const combinedDateTime = this.combineDateTime(
              info.extractedDate,
              info.extractedTime
            );
            const utcDateTime = zonedTimeToUtc(
              combinedDateTime,
              "America/Chicago"
            );

            if (!dryRun) {
              const { error: updateError } = await supabase
                .from("events")
                .update({
                  date: utcDateTime.toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", event.id);

              if (updateError) {
                console.error(`Error updating event ${event.id}:`, updateError);
              } else {
                console.log(
                  `✅ Updated event with new datetime: ${utcDateTime.toISOString()}`
                );
              }
            } else {
              console.log(`🔍 Would update to: ${utcDateTime.toISOString()}`);
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
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Error processing event ${event.id}:`, error);
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

  const crawler = new EventDateTimeCrawler();

  try {
    await crawler.initialize();
    await crawler.updateEventsWithCorrectTimes(dryRun);
  } catch (error) {
    console.error("Crawler error:", error);
  } finally {
    await crawler.close();
  }
}

// Export for use as module
export { EventDateTimeCrawler };

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
