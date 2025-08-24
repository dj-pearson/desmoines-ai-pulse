import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

interface WriteupRequest {
  type: "event" | "restaurant";
  id: string;
  url: string;
  title: string;
  description?: string;
  location?: string;
  cuisine?: string;
  category?: string;
}

// Enhanced content extraction from HTML
function extractContentFromHTML(html: string): {
  text: string;
  title: string;
  description: string;
  features: string[];
  contact: string;
} {
  // Remove script and style elements
  let cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Extract title
  const titleMatch = cleanHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // Extract meta description
  const metaDescMatch = cleanHtml.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i
  );
  const description = metaDescMatch ? metaDescMatch[1].trim() : "";

  // Extract main content areas
  const contentSelectors = [
    /<main[^>]*>(.*?)<\/main>/gis,
    /<article[^>]*>(.*?)<\/article>/gis,
    /<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/gis,
    /<div[^>]*class="[^"]*about[^"]*"[^>]*>(.*?)<\/div>/gis,
    /<section[^>]*>(.*?)<\/section>/gis,
  ];

  let extractedText = "";
  for (const selector of contentSelectors) {
    const matches = cleanHtml.match(selector);
    if (matches) {
      extractedText += matches
        .map((match) =>
          match
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        )
        .join(" ");
    }
  }

  // If no specific content found, extract from body
  if (!extractedText) {
    const bodyMatch = cleanHtml.match(/<body[^>]*>(.*?)<\/body>/is);
    if (bodyMatch) {
      extractedText = bodyMatch[1]
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  // Extract features (look for lists, amenities, etc.)
  const featureKeywords = [
    "amenities",
    "features",
    "offerings",
    "services",
    "specialties",
    "menu",
    "cuisine",
    "atmosphere",
    "parking",
    "hours",
    "location",
  ];

  const features: string[] = [];
  for (const keyword of featureKeywords) {
    const regex = new RegExp(`${keyword}[^.]*[.]`, "gi");
    const matches = extractedText.match(regex);
    if (matches) {
      features.push(...matches.slice(0, 3)); // Limit to 3 per keyword
    }
  }

  // Extract contact information
  const contactRegex =
    /(?:phone|call|contact)[^.]*\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}[^.]*/gi;
  const contactMatches = extractedText.match(contactRegex);
  const contact = contactMatches ? contactMatches[0] : "";

  return {
    text: extractedText.substring(0, 3000), // Limit for AI processing
    title,
    description,
    features: features.slice(0, 10), // Limit features
    contact,
  };
}

// Generate AI writeup using Claude
async function generateAIWriteup(
  request: WriteupRequest,
  extractedContent: any,
  claudeApiKey: string
): Promise<{ writeup: string; prompt: string }> {
  const isEvent = request.type === "event";

  const prompt = isEvent
    ? `Create an engaging, SEO and GEO (Generative Engine Optimization) optimized writeup for this Des Moines event. Make it informative, locally-focused, and search-friendly.

EVENT DETAILS:
- Title: ${request.title}
- Location: ${request.location || "Des Moines area"}
- Category: ${request.category || "Event"}
- Description: ${request.description || "See details below"}

EXTRACTED CONTENT FROM EVENT PAGE:
${extractedContent.text}

FEATURES/HIGHLIGHTS:
${extractedContent.features.join(", ")}

REQUIREMENTS:
- Write 200-300 words
- Include Des Moines area keywords naturally
- Make it engaging for locals and visitors
- Include what to expect, why it's special
- Mention location benefits/accessibility
- Use local SEO terms naturally
- Make it sound authentic and helpful
- Focus on the experience and value

Write the content as a complete, flowing article without headers or bullet points.`
    : `Create an engaging, SEO and GEO (Generative Engine Optimization) optimized writeup for this Des Moines restaurant. Make it informative, locally-focused, and search-friendly.

RESTAURANT DETAILS:
- Name: ${request.title}
- Cuisine: ${request.cuisine || "Restaurant"}
- Location: ${request.location || "Des Moines area"}
- Description: ${request.description || "See details below"}

EXTRACTED CONTENT FROM RESTAURANT WEBSITE:
${extractedContent.text}

FEATURES/OFFERINGS:
${extractedContent.features.join(", ")}

CONTACT: ${extractedContent.contact}

REQUIREMENTS:
- Write 200-300 words
- Include Des Moines dining keywords naturally
- Highlight signature dishes, atmosphere, specialties
- Mention what makes it unique in Des Moines
- Include accessibility, parking, location benefits
- Use local dining SEO terms naturally
- Make it sound like a trusted local recommendation
- Focus on the dining experience and value

Write the content as a complete, flowing article without headers or bullet points.`;

  try {
    const claudeResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": claudeApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-0",
          max_tokens: 400,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      }
    );

    if (!claudeResponse.ok) {
      throw new Error(`Claude API error: ${claudeResponse.status}`);
    }

    const claudeData = await claudeResponse.json();
    const writeup = claudeData.content?.[0]?.text?.trim();

    if (!writeup) {
      throw new Error("No writeup generated by Claude");
    }

    return { writeup, prompt };
  } catch (error) {
    console.error("Claude API error:", error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders,
      });
    }

    const requestBody = await req.json();
    console.log("Generate writeup request:", requestBody);

    const { type, id, url, title, description, location, cuisine, category } =
      requestBody;

    // Validate required fields
    if (!type || !id || !url || !title) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: type, id, url, title",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Claude API key
    const claudeApiKey = Deno.env.get("CLAUDE_API");
    if (!claudeApiKey) {
      throw new Error("Claude API key not configured");
    }

    console.log(`Starting content extraction from: ${url}`);

    // Fetch the webpage content
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${url}: ${response.status} ${response.statusText}`
      );
    }

    const html = await response.text();
    console.log(`Fetched HTML from ${url}, length: ${html.length}`);

    // Extract content from HTML
    const extractedContent = extractContentFromHTML(html);
    console.log("Extracted content summary:", {
      textLength: extractedContent.text.length,
      title: extractedContent.title,
      featuresCount: extractedContent.features.length,
    });

    // Generate AI writeup
    console.log("Generating AI writeup with Claude...");
    const { writeup, prompt } = await generateAIWriteup(
      { type, id, url, title, description, location, cuisine, category },
      extractedContent,
      claudeApiKey
    );

    console.log(`Generated writeup length: ${writeup.length}`);

    // Save to database
    const tableName = type === "event" ? "events" : "restaurants";
    const updateData = {
      ai_writeup: writeup,
      writeup_generated_at: new Date().toISOString(),
      writeup_prompt_used: prompt.substring(0, 1000), // Limit prompt storage
    };

    const { error: updateError } = await supabase
      .from(tableName)
      .update(updateData)
      .eq("id", id);

    if (updateError) {
      throw new Error(`Database update error: ${updateError.message}`);
    }

    console.log(`Successfully saved writeup for ${type} ${id}`);

    return new Response(
      JSON.stringify({
        success: true,
        writeup,
        extractedContentLength: extractedContent.text.length,
        featuresFound: extractedContent.features.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Generate writeup error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
