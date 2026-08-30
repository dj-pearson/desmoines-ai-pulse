import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nrwafwjzhvdchkijyihp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yd2Fmd2p6aHZkY2hraWp5aWhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc2MDQ0MTQsImV4cCI6MjA1MzE4MDQxNH0.bPLJLyYJqbBhxBFaRmSbNZXfBtM7-RMI4ypNu8jbqMw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugCatchDesmoines() {
  console.log('Searching for catchdesmoines URLs...');
  
  // First, let's see what source_url patterns we have
  const { data: allEvents, error: allError } = await supabase
    .from('events')
    .select('source_url')
    .not('source_url', 'is', null)
    .limit(100);
  
  if (allError) {
    console.error('Error fetching all events:', allError);
    return;
  }
  
  console.log('\nSample of all source URLs:');
  allEvents.slice(0, 10).forEach((event, i) => {
    console.log(`${i + 1}. ${event.source_url}`);
  });
  
  // Look for any URL containing 'catch' or 'desmoines'
  const catchUrls = allEvents.filter(event => 
    event.source_url && (
      event.source_url.toLowerCase().includes('catch') ||
      event.source_url.toLowerCase().includes('desmoines')
    )
  );
  
  console.log(`\nFound ${catchUrls.length} URLs containing 'catch' or 'desmoines':`);
  catchUrls.forEach((event, i) => {
    console.log(`${i + 1}. ${event.source_url}`);
  });
  
  // More specific search for catchdesmoines
  const { data: catchEvents, error: catchError } = await supabase
    .from('events')
    .select('source_url, title')
    .ilike('source_url', '%catchdesmoines%')
    .limit(20);
  
  if (catchError) {
    console.error('Error searching for catchdesmoines:', catchError);
  } else {
    console.log(`\nDirect search for 'catchdesmoines' found ${catchEvents.length} events:`);
    catchEvents.forEach((event, i) => {
      console.log(`${i + 1}. ${event.title} - ${event.source_url}`);
    });
  }
  
  // Check for various domain patterns
  const patterns = [
    '%catchdesmoines.com%',
    '%www.catchdesmoines.com%', 
    '%catch-des-moines%',
    '%catch_des_moines%',
    '%catch des moines%'
  ];
  
  for (const pattern of patterns) {
    const { data: patternEvents, error: patternError } = await supabase
      .from('events')
      .select('source_url, title')
      .ilike('source_url', pattern)
      .limit(5);
    
    if (!patternError && patternEvents.length > 0) {
      console.log(`\nPattern '${pattern}' found ${patternEvents.length} events:`);
      patternEvents.forEach((event, i) => {
        console.log(`${i + 1}. ${event.source_url}`);
      });
    }
  }
}

debugCatchDesmoines().catch(console.error);
