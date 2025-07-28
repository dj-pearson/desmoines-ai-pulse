# Event Data Enhancer Feature

The Event Data Enhancer is a new feature in the Des Moines Insider Admin panel that allows you to automatically search for and enhance event data using AI-powered Google Search and Claude AI analysis.

## How It Works

1. **Admin Access**: Navigate to the Admin panel and go to the Events tab
2. **AI Enhance Button**: Click the "AI Enhance" button next to the "Add New" button
3. **Select Fields**: Choose which event fields you want to enhance (price, venue, location, category, etc.)
4. **Select Events**: Choose which event records you want to process
5. **Optional Search Query**: Add additional search context if needed
6. **AI Processing**: The system will:
   - Search Google for relevant information about each event
   - Use Claude AI to analyze the search results
   - Extract and improve the selected fields
   - Update the event records in the database

## Features

### Field Selection
You can enhance the following event fields:
- **Title**: Event name/title
- **Venue**: Specific venue name
- **Location**: Address or location details
- **Price**: Ticket pricing information
- **Category**: Event category (Music, Art, Sports, etc.)
- **Description**: Enhanced event description
- **Source URL**: Original event source
- **Image URL**: Event image location

### Batch Processing
- Select multiple events for simultaneous processing
- Real-time progress tracking with status indicators
- Error handling for individual events
- Bulk operations with rate limiting to respect API limits

### Search Enhancement
- Combines event title, venue, and location for contextual searches
- Optional additional search query for more specific results
- Uses Google Custom Search API for relevant results
- Claude AI analyzes and extracts meaningful improvements

## Technical Implementation

### Architecture
```
Admin Panel → EventDataEnhancer Component → Supabase Edge Function → Google Search API + Claude AI → Database Update
```

### Supabase Edge Function
The feature uses a dedicated Supabase Edge Function (`batch-enhance-events`) that:
- Handles secure API key management
- Performs Google searches for each event
- Analyzes results with Claude AI
- Updates the database with improvements
- Returns detailed results for each processed event

### API Requirements
- **Google Search API**: Configured as `GOOGLE_SEARCH_API` secret in Supabase
- **Claude API**: Configured as `CLAUDE_API` secret in Supabase
- **Custom Search Engine**: Requires a Google Custom Search Engine ID

## Usage Instructions

### For Administrators

1. **Access the Feature**
   ```
   Admin Panel → Events Tab → "AI Enhance" Button
   ```

2. **Configure Enhancement**
   - Select the fields you want to improve
   - Choose events to process (use "Select All" for batch operations)
   - Add optional search context if needed

3. **Monitor Progress**
   - Real-time status updates for each event
   - Success/error indicators
   - Detailed error messages if processing fails

4. **Review Results**
   - Enhanced events will be automatically updated
   - Refresh the events list to see improvements
   - Review enhanced data for accuracy

### Best Practices

1. **Field Selection**: Start with a few key fields (price, venue, location) for best results
2. **Event Selection**: Process events in smaller batches (10-20) for better performance
3. **Search Context**: Add specific search terms if events have ambiguous names
4. **Review Results**: Always review AI-enhanced data for accuracy before publishing

## Example Use Case

**Scenario**: You have events with missing price information and incomplete venue details.

**Process**:
1. Select "Price" and "Venue" fields
2. Select events missing this information
3. Add search context like "Des Moines Iowa ticket price" if needed
4. Run the enhancement
5. Review and verify the updated information

**Result**: Events now have accurate pricing and complete venue information automatically extracted from web sources.

## Error Handling

The system handles various error scenarios:
- **No Search Results**: Events with no relevant search results are skipped
- **API Errors**: Individual event failures don't stop the entire batch
- **Parsing Errors**: Claude AI response parsing issues are logged and reported
- **Rate Limiting**: Built-in delays prevent API rate limit violations

## Limitations

1. **Accuracy**: AI-enhanced data should always be reviewed for accuracy
2. **Rate Limits**: Google Search and Claude APIs have usage limits
3. **Search Quality**: Results depend on the quality of available web information
4. **Processing Time**: Large batches may take several minutes to complete
5. **API Costs**: Usage consumes Google Search API and Claude API credits

## Future Enhancements

- **Scheduling**: Automated periodic enhancement of events
- **Source Verification**: Multiple source verification for accuracy
- **Custom Prompts**: Configurable AI prompts for different enhancement strategies
- **Analytics**: Usage analytics and enhancement success metrics
- **Integration**: Integration with other content types (restaurants, attractions)

## Support

For technical issues or questions:
1. Check the Supabase Edge Function logs for detailed error information
2. Verify API key configuration in Supabase secrets
3. Monitor API usage and limits
4. Review individual event enhancement results in the progress dialog

## API Configuration

### Required Secrets in Supabase:
```
GOOGLE_SEARCH_API: Your Google Custom Search API key
CLAUDE_API: Your Anthropic Claude API key
```

### Google Custom Search Engine Setup:
1. Create a Custom Search Engine at https://cse.google.com/
2. Configure it to search the entire web or specific domains
3. Note the Search Engine ID for the Supabase function configuration
```
