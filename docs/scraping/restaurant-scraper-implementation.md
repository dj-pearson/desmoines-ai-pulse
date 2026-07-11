# Supabase Edge Function: Restaurant Opening Scraper for Des Moines

## Complete Implementation Guide

---

## 1. Database Schema

```sql
-- New restaurant openings table
CREATE TABLE restaurant_openings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  description TEXT,
  expected_opening_date DATE,
  actual_opening_date DATE,
  status TEXT DEFAULT 'pending', -- pending, opened, cancelled
  source_url TEXT,
  confidence_score DECIMAL(3,2), -- 0.00 to 1.00
  last_checked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sources to monitor
CREATE TABLE scrape_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  source_type TEXT, -- news, blog, social, rss
  keywords TEXT[], -- array of keywords to search for
  last_scraped_at TIMESTAMP WITH TIME ZONE,
  scrape_frequency_hours INTEGER DEFAULT 24,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scrape history/logs
CREATE TABLE scrape_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES scrape_sources(id),
  status TEXT, -- success, failed, partial
  restaurants_found INTEGER DEFAULT 0,
  new_restaurants INTEGER DEFAULT 0,
  updated_restaurants INTEGER DEFAULT 0,
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_restaurant_openings_status ON restaurant_openings(status);
CREATE INDEX idx_restaurant_openings_name ON restaurant_openings(name);
CREATE INDEX idx_restaurant_openings_expected_date ON restaurant_openings(expected_opening_date);
CREATE INDEX idx_scrape_sources_active ON scrape_sources(active);
CREATE INDEX idx_scrape_logs_created_at ON scrape_logs(created_at);

-- Insert Des Moines sources
INSERT INTO scrape_sources (name, url, source_type, keywords, scrape_frequency_hours) VALUES
  ('Des Moines Register', 'https://www.desmoinesregister.com/search/?q=restaurant+opening', 'news', ARRAY['restaurant opening', 'new restaurant', 'coming soon', 'to open'], 24),
  ('Catch Des Moines', 'https://www.catchdesmoines.com/blog/', 'blog', ARRAY['opening soon', 'new dining', 'restaurant'], 48),
  ('DSM Magazine', 'https://dsmmagazine.com/category/food-drink/', 'magazine', ARRAY['restaurant', 'opening', 'coming soon', 'new spot'], 48),
  ('Cityview Des Moines', 'https://www.dmcityview.com/food-drink/', 'magazine', ARRAY['restaurant', 'opening', 'new'], 48);
```

---

## 2. Edge Function Main File

**File:** `supabase/functions/scrape-restaurant-openings/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Types
interface Source {
  id: string
  name: string
  url: string
  source_type: string
  keywords: string[]
  last_scraped_at: string | null
}

interface RestaurantLead {
  name: string
  address?: string
  phone?: string
  email?: string
  website?: string
  description?: string
  expected_opening_date?: string
  source_url: string
  confidence_score: number
}

interface ScrapeResult {
  source: string
  status: 'success' | 'failed'
  found: number
  newRestaurants: number
  updated: number
  error?: string
}

// Main handler
serve(async (req) => {
  const startTime = Date.now()
  
  try {
    // Authenticate (cron secret or API key)
    const authHeader = req.headers.get('Authorization')
    const cronSecret = Deno.env.get('CRON_SECRET')
    
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), 
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get active sources that need scraping
    const sources = await getActiveSources(supabase)
    console.log(`Found ${sources.length} active sources to scrape`)

    // Process each source
    const results: ScrapeResult[] = []
    
    for (const source of sources) {
      const result = await scrapeSource(source, supabase)
      results.push(result)
    }

    // Send notifications if new restaurants found
    const totalNew = results.reduce((sum, r) => sum + r.newRestaurants, 0)
    if (totalNew > 0) {
      await sendNotifications(supabase, totalNew)
    }

    const executionTime = Date.now() - startTime

    return new Response(
      JSON.stringify({ 
        success: true, 
        executionTimeMs: executionTime,
        sourcesProcessed: results.length,
        totalRestaurantsFound: results.reduce((sum, r) => sum + r.found, 0),
        totalNewRestaurants: totalNew,
        totalUpdated: results.reduce((sum, r) => sum + r.updated, 0),
        results: results
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        stack: error.stack 
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    )
  }
})

// Get active sources that need scraping
async function getActiveSources(supabase: any): Promise<Source[]> {
  const { data, error } = await supabase
    .from('scrape_sources')
    .select('*')
    .eq('active', true)
    .order('last_scraped_at', { ascending: true, nullsFirst: true })

  if (error) {
    console.error('Error fetching sources:', error)
    throw error
  }

  // Filter sources that haven't been scraped recently
  const now = new Date()
  return data.filter((source: Source) => {
    if (!source.last_scraped_at) return true
    
    const lastScraped = new Date(source.last_scraped_at)
    const hoursSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60)
    const frequency = 24 // Default to 24 hours
    
    return hoursSinceLastScrape >= frequency
  })
}

// Scrape a single source
async function scrapeSource(source: Source, supabase: any): Promise<ScrapeResult> {
  const logId = crypto.randomUUID()
  const startTime = Date.now()
  
  try {
    console.log(`Scraping source: ${source.name}`)

    // Use Firecrawl to scrape the source
    const content = await scrapeWithFirecrawl(source.url)
    
    if (!content) {
      throw new Error('No content returned from Firecrawl')
    }

    // Extract restaurant information
    const restaurants = await extractRestaurantInfo(
      content,
      source.keywords,
      source.url
    )

    console.log(`Found ${restaurants.length} potential restaurants from ${source.name}`)

    // Save to database
    const saveResult = await saveRestaurants(restaurants, supabase)

    // Update source last_scraped_at
    await supabase
      .from('scrape_sources')
      .update({ last_scraped_at: new Date().toISOString() })
      .eq('id', source.id)

    // Log success
    const executionTime = Date.now() - startTime
    await supabase.from('scrape_logs').insert({
      id: logId,
      source_id: source.id,
      status: 'success',
      restaurants_found: restaurants.length,
      new_restaurants: saveResult.newCount,
      updated_restaurants: saveResult.updatedCount,
      execution_time_ms: executionTime
    })

    return { 
      source: source.name, 
      status: 'success',
      found: restaurants.length,
      newRestaurants: saveResult.newCount,
      updated: saveResult.updatedCount
    }

  } catch (error) {
    console.error(`Error scraping ${source.name}:`, error)
    
    const executionTime = Date.now() - startTime
    
    // Log failure
    await supabase.from('scrape_logs').insert({
      id: logId,
      source_id: source.id,
      status: 'failed',
      error_message: error.message,
      execution_time_ms: executionTime
    })
    
    return {
      source: source.name,
      status: 'failed',
      found: 0,
      newRestaurants: 0,
      updated: 0,
      error: error.message
    }
  }
}

// Scrape content using Firecrawl
async function scrapeWithFirecrawl(url: string): Promise<string> {
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY')
  
  if (!firecrawlApiKey) {
    throw new Error('FIRECRAWL_API_KEY not set')
  }

  const response = await fetch('https://api.firecrawl.dev/v0/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firecrawlApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: url,
      formats: ['markdown'],
      onlyMainContent: true,
      waitFor: 2000,
      timeout: 30000
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Firecrawl API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  return data.markdown || data.html || ''
}

// Extract restaurant information from content
async function extractRestaurantInfo(
  content: string,
  keywords: string[],
  sourceUrl: string
): Promise<RestaurantLead[]> {
  const restaurants: RestaurantLead[] = []
  
  // Split content into paragraphs
  const paragraphs = content.split('\n\n').filter(p => p.trim().length > 50)
  
  for (const paragraph of paragraphs) {
    // Check if paragraph contains relevant keywords
    const lowerParagraph = paragraph.toLowerCase()
    const hasKeyword = keywords.some(kw => 
      lowerParagraph.includes(kw.toLowerCase())
    )
    
    if (!hasKeyword) continue

    // Skip if it's just a menu listing or ad
    if (lowerParagraph.includes('menu') && lowerParagraph.includes('$')) continue
    if (lowerParagraph.includes('advertisement')) continue

    // Extract restaurant details
    const restaurant: Partial<RestaurantLead> = {
      source_url: sourceUrl,
      confidence_score: 0.5
    }

    // Extract name (look for quoted names, capitalized phrases, or possessive forms)
    const namePatterns = [
      /"([^"]+)"/,  // Quoted names
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})(?:\s+(?:restaurant|cafe|bar|bistro|grill|kitchen|eatery))?/i,
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})'s/  // Possessive form
    ]
    
    for (const pattern of namePatterns) {
      const nameMatch = paragraph.match(pattern)
      if (nameMatch && nameMatch[1]) {
        // Filter out common false positives
        const name = nameMatch[1]
        if (!['Des Moines', 'West Des Moines', 'The Des Moines'].includes(name) &&
            name.length > 3 && name.length < 50) {
          restaurant.name = name
          restaurant.confidence_score! += 0.2
          break
        }
      }
    }

    // Extract address (Des Moines area specific)
    const addressMatch = paragraph.match(
      /(\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Way|Court|Ct|Lane|Ln|Place|Pl)\.?(?:,?\s*(?:Des Moines|West Des Moines|Urbandale|Clive|Ankeny|Windsor Heights|Johnston))?(?:,?\s*(?:IA|Iowa))?(?:,?\s*\d{5})?)/i
    )
    if (addressMatch) {
      restaurant.address = addressMatch[1].trim()
      restaurant.confidence_score! += 0.15
    }

    // Extract phone
    const phoneMatch = paragraph.match(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/)
    if (phoneMatch) {
      restaurant.phone = phoneMatch[1]
      restaurant.confidence_score! += 0.1
    }

    // Extract email
    const emailMatch = paragraph.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
    if (emailMatch) {
      restaurant.email = emailMatch[1]
      restaurant.confidence_score! += 0.1
    }

    // Extract website
    const websiteMatch = paragraph.match(/(https?:\/\/[^\s<]+)|(?:www\.)?([a-zA-Z0-9-]+\.com|[a-zA-Z0-9-]+\.org|[a-zA-Z0-9-]+\.net)/i)
    if (websiteMatch) {
      restaurant.website = websiteMatch[0].startsWith('http') ? websiteMatch[0] : `https://${websiteMatch[0]}`
      restaurant.confidence_score! += 0.1
    }

    // Extract opening date
    const currentYear = new Date().getFullYear()
    const datePatterns = [
      // "opening in March 2025"
      /(?:open(?:ing|s)?|launch(?:ing|es)?|coming|expected|debut(?:ing|s)?|arrive|arrives|arriving)\s+(?:in\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
      // "March 15, 2025"
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i,
      // "early 2025", "spring 2025", "summer 2025"
      /(?:early|late|mid|spring|summer|fall|autumn|winter)\s+(\d{4})/i,
      // "in 3 months", "in 6 weeks"
      /(?:in\s+)?(\d{1,2})\s+(weeks?|months?)/i
    ]
    
    for (const pattern of datePatterns) {
      const dateMatch = paragraph.match(pattern)
      if (dateMatch) {
        const parsedDate = parseDateFromMatch(dateMatch)
        if (parsedDate) {
          restaurant.expected_opening_date = parsedDate
          restaurant.confidence_score! += 0.15
          break
        }
      }
    }

    // Extract description (get surrounding context)
    restaurant.description = paragraph.substring(0, 500).trim()

    // Only add if we have at least a name and reasonable confidence
    if (restaurant.name && restaurant.confidence_score! > 0.6) {
      restaurants.push(restaurant as RestaurantLead)
    }
  }

  return restaurants
}

// Parse date from regex match
function parseDateFromMatch(match: RegExpMatchArray): string | null {
  const months: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4,
    may: 5, june: 6, july: 7, august: 8,
    september: 9, october: 10, november: 11, december: 12
  }
  
  const now = new Date()
  const currentYear = now.getFullYear()
  
  // Handle "March 2025" format
  if (match[1] && months[match[1].toLowerCase()] && match[2] && match[2].length === 4) {
    const month = months[match[1].toLowerCase()]
    const year = parseInt(match[2])
    return `${year}-${String(month).padStart(2, '0')}-01`
  }
  
  // Handle "March 15, 2025" format
  if (match[1] && match[2] && match[3]) {
    const month = months[match[1].toLowerCase()]
    const day = parseInt(match[2])
    const year = parseInt(match[3])
    if (month && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  
  // Handle "early 2025", "spring 2025" etc
  if (match[1] && match[1].length === 4) {
    const year = parseInt(match[1])
    const season = match[0].toLowerCase()
    
    if (season.includes('early') || season.includes('winter')) {
      return `${year}-02-01`
    } else if (season.includes('spring')) {
      return `${year}-04-01`
    } else if (season.includes('summer')) {
      return `${year}-07-01`
    } else if (season.includes('fall') || season.includes('autumn')) {
      return `${year}-10-01`
    } else if (season.includes('late')) {
      return `${year}-11-01`
    }
  }
  
  // Handle "in 3 months", "in 6 weeks"
  if (match[1] && match[2]) {
    const amount = parseInt(match[1])
    const unit = match[2].toLowerCase()
    
    const futureDate = new Date()
    if (unit.startsWith('week')) {
      futureDate.setDate(futureDate.getDate() + (amount * 7))
    } else if (unit.startsWith('month')) {
      futureDate.setMonth(futureDate.getMonth() + amount)
    }
    
    const year = futureDate.getFullYear()
    const month = futureDate.getMonth() + 1
    const day = futureDate.getDate()
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  
  return null
}

// Save restaurants to database with deduplication
async function saveRestaurants(
  restaurants: RestaurantLead[],
  supabase: any
): Promise<{ newCount: number, updatedCount: number }> {
  let newCount = 0
  let updatedCount = 0

  for (const restaurant of restaurants) {
    // Check for duplicates using fuzzy name match
    const { data: existing } = await supabase
      .from('restaurant_openings')
      .select('*')
      .ilike('name', `%${restaurant.name}%`)
      .limit(5)

    // Find best match
    let bestMatch = null
    let highestSimilarity = 0

    if (existing && existing.length > 0) {
      for (const existingRestaurant of existing) {
        const similarity = calculateSimilarity(
          restaurant.name.toLowerCase(),
          existingRestaurant.name.toLowerCase()
        )
        
        if (similarity > highestSimilarity && similarity > 0.7) {
          highestSimilarity = similarity
          bestMatch = existingRestaurant
        }
      }
    }

    if (bestMatch) {
      // Update if new info is more complete or has higher confidence
      const shouldUpdate = 
        restaurant.confidence_score > (bestMatch.confidence_score || 0) ||
        (restaurant.address && !bestMatch.address) ||
        (restaurant.phone && !bestMatch.phone) ||
        (restaurant.website && !bestMatch.website) ||
        (restaurant.expected_opening_date && !bestMatch.expected_opening_date)

      if (shouldUpdate) {
        // Merge data - keep existing non-null values, add new ones
        const mergedData = {
          name: restaurant.name || bestMatch.name,
          address: restaurant.address || bestMatch.address,
          phone: restaurant.phone || bestMatch.phone,
          email: restaurant.email || bestMatch.email,
          website: restaurant.website || bestMatch.website,
          description: restaurant.description || bestMatch.description,
          expected_opening_date: restaurant.expected_opening_date || bestMatch.expected_opening_date,
          confidence_score: Math.max(restaurant.confidence_score, bestMatch.confidence_score || 0),
          source_url: restaurant.source_url,
          updated_at: new Date().toISOString(),
          last_checked_at: new Date().toISOString()
        }

        await supabase
          .from('restaurant_openings')
          .update(mergedData)
          .eq('id', bestMatch.id)
        
        updatedCount++
        console.log(`Updated restaurant: ${restaurant.name}`)
      } else {
        // Just update last_checked_at
        await supabase
          .from('restaurant_openings')
          .update({ last_checked_at: new Date().toISOString() })
          .eq('id', bestMatch.id)
      }
    } else {
      // Insert new restaurant
      await supabase
        .from('restaurant_openings')
        .insert({
          ...restaurant,
          status: 'pending',
          created_at: new Date().toISOString(),
          last_checked_at: new Date().toISOString()
        })
      
      newCount++
      console.log(`Added new restaurant: ${restaurant.name}`)
    }
  }

  return { newCount, updatedCount }
}

// Calculate string similarity (Levenshtein distance)
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 1.0
  
  const editDistance = levenshteinDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  return matrix[str2.length][str1.length]
}

// Send notifications when new restaurants are found
async function sendNotifications(supabase: any, newRestaurantsCount: number): Promise<void> {
  try {
    // Get the newly added restaurants from today
    const { data: newRestaurants } = await supabase
      .from('restaurant_openings')
      .select('*')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10)

    if (!newRestaurants || newRestaurants.length === 0) return

    // You can implement email notifications here using Resend, SendGrid, etc.
    console.log(`Would send notification about ${newRestaurantsCount} new restaurants`)
    
    // Example with Resend (uncomment and configure)
    /*
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (resendApiKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'alerts@yourdomain.com',
          to: 'admin@yourdomain.com',
          subject: `${newRestaurantsCount} New Restaurant Openings Found in Des Moines`,
          html: generateEmailHTML(newRestaurants)
        })
      })
    }
    */
  } catch (error) {
    console.error('Error sending notifications:', error)
  }
}

// Generate HTML email (optional - for notifications)
function generateEmailHTML(restaurants: any[]): string {
  let html = '<h2>New Restaurant Openings Detected</h2><ul>'
  
  for (const restaurant of restaurants) {
    html += `<li>
      <strong>${restaurant.name}</strong><br/>
      ${restaurant.address || 'Address TBD'}<br/>
      Expected Opening: ${restaurant.expected_opening_date || 'TBD'}<br/>
      ${restaurant.description?.substring(0, 200) || ''}<br/>
      <a href="${restaurant.source_url}">Source</a>
    </li>`
  }
  
  html += '</ul>'
  return html
}
```

---

## 3. Deployment Instructions

### Step 1: Setup Supabase Project

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations to create tables
supabase db push
```

### Step 2: Create Edge Function

```bash
# Create the function directory
supabase functions new scrape-restaurant-openings

# Copy the index.ts file content above into:
# supabase/functions/scrape-restaurant-openings/index.ts
```

### Step 3: Set Environment Secrets

```bash
# Set Firecrawl API key
supabase secrets set FIRECRAWL_API_KEY=your_firecrawl_api_key_here

# Set cron secret for authentication
supabase secrets set CRON_SECRET=your_secure_random_string_here

# Optional: Set Resend API key for notifications
supabase secrets set RESEND_API_KEY=your_resend_api_key_here
```

### Step 4: Deploy Edge Function

```bash
# Deploy the function
supabase functions deploy scrape-restaurant-openings

# Get the function URL (you'll need this for cron)
# It will be something like:
# https://your-project-ref.supabase.co/functions/v1/scrape-restaurant-openings
```

---

## 4. Schedule with GitHub Actions

Create `.github/workflows/scrape-restaurants.yml`:

```yaml
name: Scrape Restaurant Openings

on:
  schedule:
    # Run daily at 9 AM UTC (3 AM CST/4 AM CDT)
    - cron: '0 9 * * *'
  # Allow manual trigger
  workflow_dispatch:

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Supabase Edge Function
        run: |
          curl -X POST \
            'https://your-project-ref.supabase.co/functions/v1/scrape-restaurant-openings' \
            -H 'Authorization: Bearer ${{ secrets.CRON_SECRET }}' \
            -H 'Content-Type: application/json' \
            -w "\nHTTP Status: %{http_code}\n"
        continue-on-error: false

      - name: Check result
        if: failure()
        run: echo "Scraping failed! Check function logs in Supabase dashboard."
```

**GitHub Secrets to Add:**
- `CRON_SECRET`: Same secret you set in Supabase

---

## 5. Alternative: Use Supabase pg_cron

If you prefer database-level scheduling:

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily scraping at 9 AM UTC
SELECT cron.schedule(
  'scrape-restaurants-daily',
  '0 9 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://your-project-ref.supabase.co/functions/v1/scrape-restaurant-openings',
      headers := jsonb_build_object(
        'Authorization', 'Bearer YOUR_CRON_SECRET_HERE',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);

-- View scheduled jobs
SELECT * FROM cron.job;

-- Unschedule if needed
-- SELECT cron.unschedule('scrape-restaurants-daily');
```

---

## 6. Testing

### Test Locally

```bash
# Start local Supabase
supabase start

# Serve function locally
supabase functions serve scrape-restaurant-openings --no-verify-jwt

# Test with curl
curl -X POST http://localhost:54321/functions/v1/scrape-restaurant-openings \
  -H "Authorization: Bearer your-test-secret" \
  -H "Content-Type: application/json"
```

### Test in Production

```bash
# Manual trigger via curl
curl -X POST https://your-project-ref.supabase.co/functions/v1/scrape-restaurant-openings \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

---

## 7. Monitoring & Maintenance

### View Logs

```bash
# View function logs
supabase functions logs scrape-restaurant-openings --limit 100
```

### SQL Queries for Monitoring

```sql
-- Check recent scrape results
SELECT 
  sl.created_at,
  ss.name as source,
  sl.status,
  sl.restaurants_found,
  sl.new_restaurants,
  sl.execution_time_ms
FROM scrape_logs sl
JOIN scrape_sources ss ON ss.id = sl.source_id
ORDER BY sl.created_at DESC
LIMIT 20;

-- View pending restaurant openings
SELECT 
  name,
  address,
  expected_opening_date,
  confidence_score,
  source_url,
  created_at
FROM restaurant_openings
WHERE status = 'pending'
  AND (expected_opening_date IS NULL OR expected_opening_date >= CURRENT_DATE)
ORDER BY expected_opening_date ASC NULLS LAST;

-- Check for restaurants that may have already opened
SELECT 
  name,
  address,
  expected_opening_date,
  source_url
FROM restaurant_openings
WHERE status = 'pending'
  AND expected_opening_date < CURRENT_DATE
ORDER BY expected_opening_date DESC;

-- Performance metrics
SELECT 
  ss.name,
  COUNT(*) as scrapes,
  AVG(sl.execution_time_ms) as avg_time_ms,
  SUM(sl.new_restaurants) as total_new_found
FROM scrape_logs sl
JOIN scrape_sources ss ON ss.id = sl.source_id
WHERE sl.created_at >= NOW() - INTERVAL '30 days'
GROUP BY ss.name;
```

---

## 8. Adding More Sources

```sql
-- Add individual news sites
INSERT INTO scrape_sources (name, url, source_type, keywords, scrape_frequency_hours) VALUES
  ('Business Record', 'https://businessrecord.com/category/dining/', 'news', ARRAY['restaurant', 'opening', 'new'], 48),
  ('Iowa Starting Line Food', 'https://iowastartingline.com/tag/food/', 'blog', ARRAY['restaurant', 'opening', 'des moines'], 48);

-- Add restaurant group announcement pages
INSERT INTO scrape_sources (name, url, source_type, keywords, scrape_frequency_hours) VALUES
  ('Orchestrate Hospitality News', 'https://www.orchestratehospitality.com/news', 'corporate', ARRAY['opening', 'location', 'des moines'], 168);

-- Disable a source temporarily
UPDATE scrape_sources 
SET active = false 
WHERE name = 'Source Name';
```

---

## 9. API Endpoints for Your Frontend

Create additional edge functions to expose data:

**File:** `supabase/functions/get-upcoming-restaurants/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const url = new URL(req.url)
  const limit = parseInt(url.searchParams.get('limit') || '20')
  const status = url.searchParams.get('status') || 'pending'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  )

  const { data, error } = await supabase
    .from('restaurant_openings')
    .select('*')
    .eq('status', status)
    .gte('expected_opening_date', new Date().toISOString().split('T')[0])
    .order('expected_opening_date', { ascending: true })
    .limit(limit)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify(data), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
})
```

Deploy:
```bash
supabase functions deploy get-upcoming-restaurants
```

---

## 10. Improvements & Next Steps

1. **Google Maps API Integration**: Validate and geocode addresses
2. **Social Media Scraping**: Add Instagram/Facebook page monitoring
3. **Manual Review Dashboard**: Build UI for low-confidence matches
4. **Email Digest**: Weekly summary of new openings
5. **Webhook Notifications**: Post to Slack/Discord when new restaurants found
6. **Image Scraping**: Capture restaurant photos from sources
7. **Menu Detection**: Flag if menu information is available
8. **Phone Validation**: Verify phone numbers with Twilio Lookup API
9. **Duplicate Detection**: Improve fuzzy matching algorithm
10. **Historical Tracking**: Track changes to opening dates over time

---

## Cost Estimation

- **Supabase**: Free tier supports up to 500MB database
- **Firecrawl**: ~$0.001-0.01 per page scrape (20 sources/day = ~$6-60/month)
- **Edge Functions**: Free tier includes 500K invocations/month
- **GitHub Actions**: Free for public repos, 2000 minutes/month for private

**Estimated monthly cost: $10-70** depending on scraping frequency and Firecrawl usage.

---

## Support & Troubleshooting

### Common Issues

**Issue: "Unauthorized" error**
- Check that CRON_SECRET matches in Supabase secrets and GitHub Actions

**Issue: Firecrawl timeout**
- Increase `timeout` parameter in scrapeWithFirecrawl function
- Some sites may require longer wait times

**Issue: No restaurants found**
- Check scrape_logs table for error messages
- Verify keywords match actual content on source pages
- Test regex patterns with sample content

**Issue: Too many duplicates**
- Adjust similarity threshold in calculateSimilarity function
- Improve name extraction patterns

### Debug Mode

Add to edge function for verbose logging:

```typescript
const DEBUG = Deno.env.get('DEBUG') === 'true'

if (DEBUG) {
  console.log('Debug info:', { restaurant, paragraph })
}
```

Set with:
```bash
supabase secrets set DEBUG=true
```

---

## License & Credits

Built for Des Moines restaurant discovery. Uses:
- Supabase Edge Functions (Deno runtime)
- Firecrawl API for web scraping
- PostgreSQL for data storage

**Maintenance**: Review and update source URLs quarterly, adjust keywords based on performance metrics.
