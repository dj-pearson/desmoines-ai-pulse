// Quick test to see what content the AI crawler sees from websites
// Run this in Node.js to debug content extraction

async function testContentExtraction(url) {
  console.log(`🔍 Testing content extraction from: ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) {
      console.error(
        `❌ Failed to fetch: ${response.status} ${response.statusText}`
      );
      return;
    }

    const html = await response.text();
    console.log(`✅ Fetched HTML, total length: ${html.length} characters`);

    // Extract content like the AI crawler does
    const cleanHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "");

    const contentPatterns = [
      /<main[^>]*>([\s\S]*?)<\/main>/gi,
      /<article[^>]*>([\s\S]*?)<\/article>/gi,
      /<section[^>]*>([\s\S]*?)<\/section>/gi,
      /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      /<div[^>]*class="[^"]*main[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      /<div[^>]*class="[^"]*events?[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      /<div[^>]*class="[^"]*calendar[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      /<div[^>]*class="[^"]*listing[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      /<div[^>]*id="[^"]*events?[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      /<ul[^>]*class="[^"]*events?[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi,
    ];

    let relevantContent = "";
    for (const pattern of contentPatterns) {
      const matches = cleanHtml.match(pattern);
      if (matches) {
        relevantContent += matches.join("\n\n--- SECTION ---\n\n");
      }
    }

    if (!relevantContent || relevantContent.length < 1000) {
      console.log("⚠️ No specific content sections found, using fallback...");
      let fallbackContent = cleanHtml
        .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
        .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
        .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "");

      relevantContent = fallbackContent.substring(0, 15000);
    }

    const finalContent = relevantContent.substring(0, 12000);

    console.log(
      `📄 Extracted content length: ${finalContent.length} characters`
    );
    console.log(`📝 Content preview (first 1000 chars):`);
    console.log("=" * 50);
    console.log(finalContent.substring(0, 1000));
    console.log("=" * 50);

    // Look for obvious event patterns
    const eventPatterns = [
      /\b(concert|show|event|game|match|performance)\b/gi,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/gi,
      /\d{1,2}\/\d{1,2}\/\d{4}/g,
      /\d{1,2}\/\d{1,2}/g,
    ];

    console.log(`\n🔍 Pattern analysis:`);
    eventPatterns.forEach((pattern, index) => {
      const matches = finalContent.match(pattern);
      if (matches) {
        console.log(`Pattern ${index + 1}: Found ${matches.length} matches`);
        console.log(`Examples: ${matches.slice(0, 5).join(", ")}`);
      } else {
        console.log(`Pattern ${index + 1}: No matches found`);
      }
    });
  } catch (error) {
    console.error(`❌ Error:`, error.message);
  }
}

// Test both sites you mentioned
const testUrls = [
  "https://vibrantmusichall.com",
  "https://catchdesmoines.com/events",
  "https://www.catchdesmoines.com",
];

console.log("🚀 Starting content extraction tests...\n");

testUrls.forEach(async (url, index) => {
  console.log(`\n--- TEST ${index + 1} ---`);
  await testContentExtraction(url);
});
