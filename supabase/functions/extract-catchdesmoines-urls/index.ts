import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractResponse {
  success: boolean;
  processed: number;
  errors: Array<{ eventId: string; error: string }>;
  updated: Array<{ eventId: string; oldUrl: string; newUrl: string }>;
}

/**
 * Parse event date/time string and convert from Central Time to UTC
 * Uses proper timezone offset detection for CST/CDT
 */
function parseEventDateTime(dateStr: string, timeStr?: string): Date | null {
  try {
    console.log('Parsing datetime:', { dateStr, timeStr });
    
    // Parse date components
    const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!dateMatch) {
      console.error('Invalid date format:', dateStr);
      return null;
    }
    
    const [, year, month, day] = dateMatch;
    let hours = 0;
    let minutes = 0;
    let seconds = 0;
    
    // Parse time if provided
    if (timeStr) {
      const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (timeMatch) {
        hours = parseInt(timeMatch[1], 10);
        minutes = parseInt(timeMatch[2], 10);
        seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      }
    }
    
    // Determine Central Time offset (CST = -06:00, CDT = -05:00)
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    
    // Rough DST check: March 2nd Sunday through November 1st Sunday
    const isDST = (monthNum > 3 && monthNum < 11) || 
                  (monthNum === 3 && dayNum >= 8) || 
                  (monthNum === 11 && dayNum < 7);
    
    const offset = isDST ? '-05:00' : '-06:00';
    
    // Build ISO string with Central timezone
    const isoWithTimezone = `${year}-${month}-${day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${offset}`;
    
    console.log('Built ISO string:', isoWithTimezone);
    
    // Parse to Date (browser will convert to UTC internally)
    const date = new Date(isoWithTimezone);
    
    if (isNaN(date.getTime())) {
      console.error('Invalid date result:', isoWithTimezone);
      return null;
    }
    
    console.log('Parsed to UTC:', date.toISOString());
    return date;
    
  } catch (error) {
    console.error('Error parsing datetime:', error);
    return null;
  }
}

interface ExtractedEventData {
  visitUrl: string | null;
  dateStr: string | null;
  timeStr: string | null;
}

async function extractVisitWebsiteUrl(eventUrl: string): Promise<ExtractedEventData> {
  try {
    console.log('Processing URL:', eventUrl);
    
    // Use fetch with user agent to simulate browser request
    const response = await fetch(eventUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      },
      signal: AbortSignal.timeout(12000) // 12 second timeout
    });

    // Even if non-200, try to parse the body (some 410/404 pages still include useful HTML)
    if (!response.ok) {
      console.warn(`Non-2xx response for ${eventUrl}: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();

    // Define excluded domains (social, shorteners, host site & related CMS)
    const excludeDomains = [
      'catchdesmoines.com',
      'simpleview.com',
      'simpleviewcrm.com',
      'simpleviewcms.com',
      'extranet.simpleview',
      'facebook.com',
      'fb.com',
      'twitter.com',
      'x.com',
      'instagram.com',
      'youtube.com',
      'youtu.be',
      'tiktok.com',
      'linkedin.com',
      'pinterest.com',
      'reddit.com',
      'snapchat.com',
      'whatsapp.com',
      'telegram.org',
      'discord.com',
      'google.com',
      'maps.google.com',
      'goo.gl',
      'bit.ly',
      'ow.ly',
      'mailto:',
      'tel:',
      '#'
    ];

    const candidatesSet = new Set<string>();

    // Helper: normalize protocol-relative URLs
    const normalizeUrl = (url: string) => {
      if (url.startsWith('//')) return `https:${url}`;
      return url;
    };

    // 1) Collect URLs from full anchor tags (capture href and inner text)
    const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let anchorMatch: RegExpExecArray | null;
    let anchorCount = 0;
    let collectedFromAnchors = 0;
    while ((anchorMatch = anchorRegex.exec(html)) !== null) {
      anchorCount++;
      let href = anchorMatch[1].trim();
      const inner = (anchorMatch[2] || '').replace(/<[^>]*>/g, ' ').trim();
      href = normalizeUrl(href);

      // Ignore non-http(s) & obvious internal relative paths
      const isHttp = /^https?:\/\//i.test(href) || href.startsWith('//');
      if (!isHttp) continue;

      candidatesSet.add(href);
      collectedFromAnchors++;

      // Also try to capture onclick/data-* inside this same <a ...>
      const tagStartIdx = Math.max(html.lastIndexOf('<a', anchorRegex.lastIndex - anchorMatch[0].length - 1), 0);
      const tagEndIdx = anchorRegex.lastIndex; // end of </a>
      const anchorTagHtml = html.slice(tagStartIdx, tagEndIdx);

      // data-* attributes
      const dataAttrRegex = /data-(?:href|url|website|externalurl|external-url|link)=["']([^"']+)["']/gi;
      let dataMatch: RegExpExecArray | null;
      while ((dataMatch = dataAttrRegex.exec(anchorTagHtml)) !== null) {
        const dataUrl = normalizeUrl(dataMatch[1].trim());
        if (/^https?:\/\//i.test(dataUrl) || dataUrl.startsWith('//')) {
          candidatesSet.add(dataUrl);
        }
      }

      // onclick patterns
      const onclickRegex = /onclick=["'][^"']*(?:window\.open|location\.(?:assign|href|replace))\(['"]([^'"\)]+)['"][^"']*["']/i;
      const onclickMatch = anchorTagHtml.match(onclickRegex);
      if (onclickMatch && onclickMatch[1]) {
        const clickUrl = normalizeUrl(onclickMatch[1].trim());
        if (/^https?:\/\//i.test(clickUrl) || clickUrl.startsWith('//')) {
          candidatesSet.add(clickUrl);
        }
      }

      // If this looks like the explicit Visit Website link, prefer it by adding again (will score higher later)
      if (/\b(visit\s*website|official\s*site|website)\b/i.test(inner)) {
        candidatesSet.add(href);
      }
    }

    // 2) Collect raw URLs anywhere in the HTML (including scripts)
    const rawUrlRegex = /https?:\/\/[^\s"'<>]+/gi;
    let rawMatch: RegExpExecArray | null;
    let collectedRaw = 0;
    while ((rawMatch = rawUrlRegex.exec(html)) !== null) {
      const rawUrl = normalizeUrl(rawMatch[0].trim());
      candidatesSet.add(rawUrl);
      collectedRaw++;
    }

    // 3) Parse JSON-LD blocks for potential URLs
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jsonMatch: RegExpExecArray | null;
    let jsonBlocks = 0;
    let collectedJson = 0;
    function collectUrlsFromJson(obj: any) {
      if (obj == null) return;
      if (typeof obj === 'string') {
        const s = obj.trim();
        if (/^https?:\/\//i.test(s)) candidatesSet.add(s);
        return;
      }
      if (Array.isArray(obj)) {
        for (const item of obj) collectUrlsFromJson(item);
        return;
      }
      if (typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
          if (k.toLowerCase() === 'url' || k.toLowerCase() === 'sameas' || k.toLowerCase() === 'website') {
            collectUrlsFromJson(v);
          } else {
            collectUrlsFromJson(v);
          }
        }
      }
    }
    while ((jsonMatch = jsonLdRegex.exec(html)) !== null) {
      jsonBlocks++;
      const block = jsonMatch[1];
      try {
        const json = JSON.parse(block);
        const before = candidatesSet.size;
        collectUrlsFromJson(json);
        const after = candidatesSet.size;
        collectedJson += Math.max(0, after - before);
      } catch (_e) {
        // ignore parse errors
      }
    }

    // Convert set to array and filter out excluded
    const allCandidates = Array.from(candidatesSet);

    const isExcluded = (u: string) => {
      const lower = u.toLowerCase();
      return excludeDomains.some((d) => lower.includes(d.toLowerCase()));
    };

    // Score candidates: prefer explicit visit/website anchors, and de-prioritize anything from excluded
    type Scored = { url: string; score: number };

    const scored: Scored[] = [];

    // Build a quick map from URL to best anchor-context score based on keyword proximity
    const visitAnchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const anchorContextScores = new Map<string, number>();
    let vaMatch: RegExpExecArray | null;
    while ((vaMatch = visitAnchorRegex.exec(html)) !== null) {
      const href = normalizeUrl(vaMatch[1].trim());
      const text = (vaMatch[2] || '').replace(/<[^>]*>/g, ' ').trim();
      let score = 0;
      if (/\b(visit\s*website|official\s*site|event\s*website|website)\b/i.test(text)) score += 10;
      if (/\b(learn\s*more|details)\b/i.test(text)) score += 2;
      if (/btn|button|cta|visit|website/i.test(vaMatch[0])) score += 2;
      if (score > 0) {
        const prev = anchorContextScores.get(href) ?? 0;
        if (score > prev) anchorContextScores.set(href, score);
      }
    }

    for (const url of allCandidates) {
      if (isExcluded(url)) continue;
      // Skip obvious tracking redirectors unless they are the only option (handled by later fallback)
      let s = 0;
      s += anchorContextScores.get(url) ?? 0;
      // Slight boost for non-tracking clean domains
      if (!/[?&](utm_|fbclid|gclid|mc_cid|mc_eid)/i.test(url)) s += 1;
      scored.push({ url, score: s });
    }

    // Choose best candidate
    scored.sort((a, b) => b.score - a.score);

    let visitUrl: string | null = null;

    if (scored.length > 0) {
      visitUrl = scored[0].url;
    } else {
      // As a last resort, pick the first non-excluded absolute URL from the page body
      const fallback = allCandidates.find((u) => /^https?:\/\//i.test(u) && !isExcluded(u));
      visitUrl = fallback || null;
    }

    console.log('Extraction diagnostic:', {
      anchorCount,
      collectedFromAnchors,
      collectedRaw,
      jsonBlocks,
      collectedJson,
      candidatesTotal: allCandidates.length,
      candidatesAfterFilter: scored.length,
      selected: visitUrl || null,
    });

    if (visitUrl) {
      console.log('Selected visit URL:', visitUrl);
    } else {
      console.log('No suitable external URL found for:', eventUrl);
    }

    // Extract date/time information (keep existing lightweight heuristics)
    let dateStr: string | null = null;
    let timeStr: string | null = null;

    const datePatterns = [
      /<time[^>]*datetime=["']([^"']+)["']/i,
      /<meta[^>]*property=["']event:start_date["'][^>]*content=["']([^"']+)["']/i,
      /<span[^>]*class=["'][^"']*date[^"']*["'][^>]*>([^<]+)</i,
      /Date:\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      /(\d{4}-\d{2}-\d{2})/
    ];

    for (const pattern of datePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        dateStr = match[1];
        console.log('Found date:', dateStr);
        break;
      }
    }

    const timePatterns = [
      /<time[^>]*>([^<]*\d{1,2}:\d{2}[^<]*)<\/time>/i,
      /Time:\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i,
      /(\d{1,2}:\d{2}\s*(?:AM|PM))/i
    ];

    for (const pattern of timePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        timeStr = match[1];
        console.log('Found time:', timeStr);
        break;
      }
    }

    return { visitUrl, dateStr, timeStr };
    
  } catch (error) {
    console.error('Error extracting URL from', eventUrl, ':', error);
    return { visitUrl: null, dateStr: null, timeStr: null };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is admin
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has admin role
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('user_role')
      .eq('user_id', user.id)
      .single();

    if (!profile || !['admin', 'root_admin', 'moderator'].includes(profile.user_role)) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const batchSize = Math.min(Math.max(body.batchSize || 20, 1), 50); // Min 1, max 50, default 20
      
      console.log(`Processing batch of ${batchSize} events`);
      
      // Get events with catchdesmoines.com URLs
      const { data: events, error: fetchError } = await supabaseClient
        .from('events')
        .select('id, title, source_url')
        .ilike('source_url', '%catchdesmoines.com%')
        .limit(batchSize);

      if (fetchError) {
        throw new Error(`Failed to fetch events: ${fetchError.message}`);
      }

      if (!events || events.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            processed: 0, 
            errors: [], 
            updated: [],
            message: 'No events with catchdesmoines.com URLs found' 
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const result: ExtractResponse = {
        success: true,
        processed: events.length,
        errors: [],
        updated: []
      };

      console.log(`Processing ${events.length} events with catchdesmoines.com URLs...`);

      // Process each event
      for (const event of events) {
        try {
          const extractedData = await extractVisitWebsiteUrl(event.source_url);
          
          if (extractedData.visitUrl) {
            // Prepare update data
            const updateData: any = { source_url: extractedData.visitUrl };
            
            // If we extracted datetime info, parse and update event_start_utc
            if (extractedData.dateStr) {
              const parsedDate = parseEventDateTime(extractedData.dateStr, extractedData.timeStr || undefined);
              if (parsedDate) {
                updateData.event_start_utc = parsedDate.toISOString();
                console.log(`Parsed event datetime for ${event.id}: ${parsedDate.toISOString()}`);
              } else {
                console.warn(`Failed to parse datetime for event ${event.id}: ${extractedData.dateStr} ${extractedData.timeStr}`);
              }
            }
            
            // Update the event with the new URL and potentially datetime
            const { error: updateError } = await supabaseClient
              .from('events')
              .update(updateData)
              .eq('id', event.id);

            if (updateError) {
              result.errors.push({
                eventId: event.id,
                error: `Failed to update: ${updateError.message}`
              });
            } else {
              result.updated.push({
                eventId: event.id,
                oldUrl: event.source_url,
                newUrl: extractedData.visitUrl
              });
              console.log(`Updated event ${event.id}: ${event.source_url} -> ${extractedData.visitUrl}${updateData.event_start_utc ? ` (datetime: ${updateData.event_start_utc})` : ''}`);
            }
          } else {
            result.errors.push({
              eventId: event.id,
              error: 'No external URL found on page'
            });
          }

          // Add small delay between requests to be respectful
          await new Promise(resolve => setTimeout(resolve, 800));

        } catch (error) {
          result.errors.push({
            eventId: event.id,
            error: `Processing failed: ${error.message}`
          });
        }
      }

      return new Response(
        JSON.stringify(result),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    if (req.method === 'GET') {
      // Return count of remaining catchdesmoines URLs
      const { count, error: countError } = await supabaseClient
        .from('events')
        .select('id', { count: 'exact', head: true })
        .ilike('source_url', '%catchdesmoines.com%');
      
      if (countError) {
        throw new Error(`Failed to count events: ${countError.message}`);
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          remaining: count || 0 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});