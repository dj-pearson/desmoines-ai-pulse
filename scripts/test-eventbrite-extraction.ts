import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer";

// Using same credentials as event-datetime-crawler.ts
const SUPABASE_URL = "https://wtkhfqpmcegzcbngroui.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1Mzc5NzcsImV4cCI6MjA2OTExMzk3N30.a-qKhaxy7l72IyT0eLq7kYuxm-wypuMxgycDy95r1aE";

async function testEventbritePage() {
  const url = "https://www.eventbrite.com/e/2025-iowa-wine-and-cider-festival-tickets-1471004968459";
  
  console.log("🔍 Testing Eventbrite page extraction...");
  console.log(`URL: ${url}`);
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  
  const page = await browser.newPage();
  
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    );
    
    console.log("🌐 Navigating to page...");
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    
    // Wait for dynamic content
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log("📊 Extracting all date/time information...");
    
    const allInfo = await page.evaluate(() => {
      const results = {
        schemas: [],
        dateElements: [],
        timeElements: [],
        textContent: "",
        title: "",
        meta: []
      };
      
      // Get page title
      results.title = document.title;
      
      // Extract JSON-LD structured data
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      scripts.forEach((script, index) => {
        try {
          const data = JSON.parse(script.textContent || "");
          results.schemas.push({
            index,
            data: data,
            hasStartDate: !!data.startDate,
            hasEndDate: !!data.endDate,
            type: data["@type"] || "unknown"
          });
        } catch (e) {
          results.schemas.push({
            index,
            error: "Invalid JSON",
            text: script.textContent?.substring(0, 200)
          });
        }
      });
      
      // Look for meta tags with date/time info
      const metaTags = document.querySelectorAll('meta[property*="time"], meta[property*="date"], meta[name*="time"], meta[name*="date"]');
      metaTags.forEach(meta => {
        results.meta.push({
          property: meta.getAttribute('property') || meta.getAttribute('name'),
          content: meta.getAttribute('content')
        });
      });
      
      // Look for common date/time selectors
      const dateSelectors = [
        '.event-date',
        '.date',
        '[class*="date"]',
        '.event-time',
        '.time',
        '[class*="time"]',
        'time[datetime]',
        '[datetime]',
        '.event-details-summary',
        '.event-details',
        '.eds-event-details',
        '.event-listing-summary'
      ];
      
      dateSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el, index) => {
          const text = el.textContent?.trim();
          const datetime = el.getAttribute('datetime');
          const className = el.className;
          
          if (text || datetime) {
            results.dateElements.push({
              selector,
              index,
              text: text?.substring(0, 200),
              datetime,
              className,
              tagName: el.tagName
            });
          }
        });
      });
      
      // Get a sample of the page text content
      results.textContent = document.body.textContent?.substring(0, 2000) || "";
      
      return results;
    });
    
    console.log("\n📋 Extraction Results:");
    console.log("─".repeat(50));
    
    console.log(`\n📄 Page Title: ${allInfo.title}`);
    
    console.log(`\n🏗️ JSON-LD Schemas Found: ${allInfo.schemas.length}`);
    allInfo.schemas.forEach((schema, i) => {
      console.log(`  ${i + 1}. Type: ${schema.type || 'unknown'}`);
      if (schema.hasStartDate) console.log(`     ✅ Has startDate: ${schema.data.startDate}`);
      if (schema.hasEndDate) console.log(`     ✅ Has endDate: ${schema.data.endDate}`);
      if (schema.data.name) console.log(`     📝 Name: ${schema.data.name}`);
      if (schema.error) console.log(`     ❌ Error: ${schema.error}`);
    });
    
    console.log(`\n🏷️ Meta Tags Found: ${allInfo.meta.length}`);
    allInfo.meta.forEach((meta, i) => {
      console.log(`  ${i + 1}. ${meta.property}: ${meta.content}`);
    });
    
    console.log(`\n📅 Date Elements Found: ${allInfo.dateElements.length}`);
    allInfo.dateElements.slice(0, 10).forEach((elem, i) => {
      console.log(`  ${i + 1}. Selector: ${elem.selector}`);
      if (elem.text) console.log(`     Text: ${elem.text}`);
      if (elem.datetime) console.log(`     DateTime: ${elem.datetime}`);
      if (elem.className) console.log(`     Class: ${elem.className}`);
    });
    
    console.log(`\n📝 Sample Text Content (first 500 chars):`);
    console.log(allInfo.textContent.substring(0, 500));
    
    // Look for specific date/time patterns
    const datePatterns = [
      /(?:August|Aug)\s+\d{1,2},?\s+\d{4}/gi,
      /\d{1,2}\/\d{1,2}\/\d{4}/g,
      /\d{4}-\d{2}-\d{2}/g,
      /Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday/gi
    ];
    
    const timePatterns = [
      /\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)/gi,
      /\d{1,2}\s*(?:AM|PM|am|pm)/gi,
      /(?:start|begin|door|show)\s*(?:at|@)?\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)/gi
    ];
    
    console.log(`\n🔍 Pattern Matches:`);
    datePatterns.forEach((pattern, i) => {
      const matches = allInfo.textContent.match(pattern);
      if (matches) {
        console.log(`  Date Pattern ${i + 1}: ${matches.slice(0, 3).join(', ')}`);
      }
    });
    
    timePatterns.forEach((pattern, i) => {
      const matches = allInfo.textContent.match(pattern);
      if (matches) {
        console.log(`  Time Pattern ${i + 1}: ${matches.slice(0, 3).join(', ')}`);
      }
    });
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await page.close();
    await browser.close();
  }
}

testEventbritePage().catch(console.error);
