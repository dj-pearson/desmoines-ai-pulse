# AI Writeup Generation Feature

## Overview

The AI Writeup Generation feature allows admins to create SEO and GEO (Generative Engine Optimization) optimized content for both events and restaurants by automatically extracting information from their source websites and generating engaging writeups using Claude AI.

## Features

### For Events

- Extracts content from the event's `source_url`
- Analyzes event details, descriptions, and features
- Generates SEO-optimized writeups focusing on:
  - Event experience and value
  - Des Moines area keywords
  - Location benefits and accessibility
  - What makes the event special

### For Restaurants

- Extracts content from the restaurant's `website`
- Analyzes menu items, atmosphere, and specialties
- Generates SEO-optimized writeups focusing on:
  - Signature dishes and offerings
  - Dining experience
  - What makes it unique in Des Moines
  - Local dining keywords

## How to Use

### In the Admin Panel

1. **Navigate to Events or Restaurants section**
2. **Find the listing you want to enhance**
3. **Click the "Generate Writeup" button** (📄 icon) in the Actions column
4. **Wait for processing** - The system will:
   - Fetch content from the source URL/website
   - Extract relevant information
   - Generate an AI-powered writeup
   - Save it to the database
5. **View results** - The "AI Writeup" column will show ✅ when complete

## Technical Implementation

### Database Schema

New fields added to both `events` and `restaurants` tables:

- `ai_writeup` (TEXT) - The generated content
- `writeup_generated_at` (TIMESTAMP) - When it was created
- `writeup_prompt_used` (TEXT) - The AI prompt used

### API Endpoint

- **Function**: `generate-writeup`
- **Method**: POST
- **Parameters**:
  - `type`: "event" or "restaurant"
  - `id`: Record ID
  - `url`: Source URL or website
  - `title`: Event title or restaurant name
  - `description`: Existing description
  - `location`: Location information
  - `cuisine`: (restaurants only)
  - `category`: (events only)

### Content Extraction

The system:

1. Fetches the webpage content
2. Removes scripts, styles, and navigation
3. Extracts title, meta description, and main content
4. Identifies features, amenities, and key information
5. Processes contact information

### AI Generation

Uses Claude 3.5 Sonnet to create:

- 200-300 word engaging writeups
- Natural inclusion of Des Moines keywords
- SEO and GEO optimization
- Local relevance and authenticity

## Requirements

### Prerequisites

- Valid source URL for events
- Valid website for restaurants
- Claude API key configured in Supabase environment
- Admin access to the system

### Database Migration

Run the provided SQL migration script in Supabase:

```sql
-- See manual_migration_ai_writeup.sql
```

## Error Handling

The system handles:

- **Missing URLs**: Shows error message requesting URL
- **Failed webpage fetches**: Reports HTTP errors
- **AI API failures**: Falls back gracefully
- **Invalid content**: Skips processing

## Best Practices

1. **Ensure URLs are valid** before generating writeups
2. **Review generated content** before publishing
3. **Update regularly** as business information changes
4. **Use for high-priority listings** first to maximize SEO impact

## Monitoring

- Check the "AI Writeup" column to see completion status
- Monitor `writeup_generated_at` timestamps
- Review generated content quality
- Track SEO performance improvements

## Future Enhancements

Potential improvements:

- Batch processing for multiple items
- Content regeneration options
- Quality scoring for generated content
- Integration with other SEO tools
- Custom prompt templates per business type
