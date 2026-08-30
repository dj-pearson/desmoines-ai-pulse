// Debug script to check events and their source URLs
// Add this to browser console or run as a script

async function debugEventSources() {
  console.log('=== DEBUG: Event Source URLs ===');
  
  try {
    // Use the existing supabase client from the app
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = 'https://nrwafwjzhvdchkijyihp.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yd2Fmd2p6aHZkY2hraWp5aWhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc2MDQ0MTQsImV4cCI6MjA1MzE4MDQxNH0.bPLJLyYJqbBhxBFaRmSbNZXfBtM7-RMI4ypNu8jbqMw';
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get all events with source URLs
    const { data: events, error } = await supabase
      .from('events')
      .select('id, title, source_url')
      .not('source_url', 'is', null)
      .limit(100);
    
    if (error) {
      console.error('Error fetching events:', error);
      return;
    }
    
    console.log(`Found ${events.length} events with source URLs`);
    
    // Log all unique source URL patterns
    const urlPatterns = new Set();
    const catchdesmoinesEvents = [];
    
    events.forEach((event, index) => {
      if (event.source_url) {
        // Extract domain pattern
        try {
          const url = new URL(event.source_url);
          urlPatterns.add(url.hostname);
        } catch {
          // For malformed URLs, just add the raw URL
          urlPatterns.add(event.source_url);
        }
        
        // Check for catchdesmoines
        if (event.source_url.toLowerCase().includes('catch')) {
          catchdesmoinesEvents.push(event);
        }
        
        // Log first 10 URLs for inspection
        if (index < 10) {
          console.log(`Event ${index + 1}: ${event.source_url}`);
        }
      }
    });
    
    console.log('\n=== All URL Patterns Found ===');
    Array.from(urlPatterns).sort().forEach(pattern => {
      console.log(pattern);
    });
    
    console.log(`\n=== Catchdesmoines Events (${catchdesmoinesEvents.length}) ===`);
    catchdesmoinesEvents.forEach((event, index) => {
      console.log(`${index + 1}. ${event.title} - ${event.source_url}`);
    });
    
    // Search for various patterns
    const searchPatterns = ['catch', 'desmoines', 'dmgov', 'dsm.city'];
    
    for (const pattern of searchPatterns) {
      const matches = events.filter(event => 
        event.source_url && event.source_url.toLowerCase().includes(pattern.toLowerCase())
      );
      
      if (matches.length > 0) {
        console.log(`\n=== Events with '${pattern}' (${matches.length}) ===`);
        matches.slice(0, 5).forEach((event, index) => {
          console.log(`${index + 1}. ${event.source_url}`);
        });
      }
    }
    
  } catch (error) {
    console.error('Debug script error:', error);
  }
}

// Run the debug function
debugEventSources();
