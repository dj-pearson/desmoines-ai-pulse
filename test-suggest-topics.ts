// Quick test script to debug suggest-article-topics function
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testSuggestTopics() {
  console.log('Testing suggest-article-topics function...');
  
  try {
    const { data, error } = await supabase.functions.invoke('suggest-article-topics', {
      body: {
        category: '',
        focusArea: '',
        includeLocalTrends: true,
        includeSeasonalTopics: true,
        excludeExistingTopics: true,
        suggestionCount: 8
      }
    });

    if (error) {
      console.error('Error response:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
    } else {
      console.log('Success!');
      console.log('Response:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('Exception:', error);
  }
}

testSuggestTopics();
