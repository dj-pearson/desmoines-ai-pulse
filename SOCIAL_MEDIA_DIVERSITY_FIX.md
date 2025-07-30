# Social Media Manager Diversity Fix

## Problem Analysis

The social media manager was repeatedly posting about the "2025 Summer Concert Series" due to several issues:

### 1. UUID Format Error
- Error: `invalid input syntax for type uuid: "'274393b0-b726-4066-a104-18e452ee3b69'"`
- Cause: Extra quotes around UUID causing SQL query failures
- Impact: Recent post tracking wasn't working, so the same content wasn't being filtered out

### 2. Limited Content Pool
- Only looking at next 10 upcoming events
- Insufficient diversity logic
- No weighted selection based on posting frequency

### 3. Weak Repetition Prevention
- Only 30-day lookback period
- No tracking of posting frequency per content item
- No excessive repetition blocking

## Solutions Implemented

### 1. Enhanced Content Diversity Algorithm

#### Multi-tier Filtering System:
1. **Strict Filter (7 days)**: Block content posted in last week
2. **Moderate Filter (90 days)**: Allow content posted less than 2 times
3. **Fallback Filter**: Prioritize least-posted content

#### Weighted Random Selection:
- Higher weight for content posted less frequently
- Higher weight for content not posted recently
- Formula: `weight = max(1, (90 - postCount * 10) + daysSinceLastPost)`

### 2. UUID Validation and Safety
```typescript
const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};
```

### 3. Excessive Repetition Protection
```typescript
const checkExcessiveRepetition = (contentId: string): boolean => {
  const recentPostsForContent = recentPosts?.filter(post => 
    post.content_id === contentId && 
    new Date(post.created_at) > new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  ) || [];
  
  return recentPostsForContent.length >= 3; // Block if posted 3+ times in 2 weeks
};
```

### 4. Improved Data Tracking
- Extended lookback to 90 days
- Increased content pool from 10 to 50 items
- Track posting frequency per content item
- Separate tracking for events and restaurants

## Expected Results

### Before Fix:
- Same event (2025 Summer Concert Series) posted 3 times in 10 posts
- UUID errors preventing proper tracking
- Limited content diversity

### After Fix:
- Maximum 2 posts per content item in 2-week period
- Weighted selection favoring diverse content
- Proper UUID validation and error handling
- Broader content pool (50 vs 10 items)

## Monitoring and Validation

### Success Metrics:
1. **Content Diversity**: No single event/restaurant posted more than 2 times in 14 days
2. **Error Reduction**: No UUID format errors in logs
3. **Distribution**: More even distribution across available content
4. **Fallback Protection**: System gracefully handles low-content scenarios

### Debug Information:
The system now logs selected content with post count:
```
Selected event: Event Name (ID: uuid, Post count: 1)
Selected restaurant: Restaurant Name (ID: uuid, Post count: 0)
```

## Testing the Fix

To verify the fix is working:

1. **Generate Multiple Posts**: Create several "event_of_the_day" posts
2. **Check Logs**: Look for content selection debug information
3. **Verify Diversity**: Confirm different events are being selected
4. **Monitor Errors**: Ensure no UUID format errors occur

## Future Enhancements

1. **Content Scoring**: Add quality/engagement scoring to selection algorithm
2. **Seasonal Weighting**: Prefer timely/seasonal content
3. **Category Balance**: Ensure diversity across event categories
4. **Geographic Distribution**: Consider location diversity
5. **User Engagement**: Factor in historical post performance
