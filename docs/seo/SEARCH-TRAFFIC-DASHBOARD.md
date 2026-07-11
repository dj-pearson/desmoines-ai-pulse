# Search & Traffic Analytics Dashboard

## Overview

A comprehensive, enterprise-level analytics dashboard that integrates multiple analytics platforms into a single, unified interface. This dashboard allows you to analyze traffic, search performance, keywords, and SEO opportunities without switching between different platforms.

## Supported Platforms

1. **Google Analytics** - Website traffic and user behavior metrics
2. **Google Search Console** - Search performance and keyword data
3. **Bing Webmaster Tools** - Bing search analytics
4. **Yandex Webmaster** - Yandex search analytics

## Features

### 1. OAuth Integration
- Secure OAuth 2.0 authentication for all platforms
- Automatic token refresh
- Multi-property support (connect multiple sites/properties)

### 2. Unified Dashboard Views

#### Overview
- High-level metrics: sessions, users, pageviews, bounce rate
- Traffic trend charts
- Device breakdown (mobile, desktop, tablet)
- Top countries by traffic

#### Traffic Analysis
- Daily traffic trends
- Sessions vs. users comparison
- Device and geographic analysis
- Bounce rate tracking

#### Search Performance
- Impressions and clicks over time
- Click-through rate (CTR) trends
- Average position tracking
- Top-performing pages

#### Keyword Analytics
- Top 100 keywords by performance
- Keyword trends (up, down, stable)
- Impression and click data
- Position tracking

#### SEO Opportunities
- Low CTR opportunities (high impressions, low clicks)
- Near first page rankings (positions 11-20)
- Declining keywords requiring attention
- Actionable recommendations

#### Site Health
- Technical SEO issues
- Crawl errors
- Mobile usability issues
- Core Web Vitals
- Severity-based categorization (critical, warning, info)

#### Comparative Analysis
- Side-by-side platform comparison
- Normalized performance metrics
- Radar charts for relative comparison

### 3. Advanced Features

- **Date Range Selection**: Custom date ranges for analysis
- **Platform Filtering**: View data from specific platforms or all combined
- **Data Synchronization**: Manual sync button to fetch latest data
- **Export Functionality**: Export analytics data to CSV
- **Real-time Updates**: Automatic data refresh
- **Responsive Design**: Works on desktop, tablet, and mobile

## Database Schema

### Tables Created

1. **oauth_providers**: OAuth configuration for each platform
2. **user_oauth_tokens**: Stores user OAuth tokens per provider
3. **analytics_properties**: Tracks connected properties/sites
4. **traffic_metrics**: Aggregated daily traffic data
5. **search_performance**: Search Console metrics by query/page
6. **keyword_rankings**: Keyword position tracking over time
7. **site_health_metrics**: Technical SEO issues
8. **analytics_sync_jobs**: Track synchronization status

### SQL Functions

- `refresh_oauth_token()`: Automatically refresh expired tokens
- `get_traffic_summary()`: Get aggregated traffic metrics
- `get_top_keywords()`: Retrieve top-performing keywords
- `get_seo_opportunities()`: Identify SEO improvement opportunities

## Installation & Setup

### 1. Run Database Migration

```bash
npm run migrate
```

Or apply the migration directly:

```bash
psql -d your_database < supabase/migrations/20251107000000_create_search_traffic_analytics.sql
```

### 2. Configure OAuth Credentials

For each platform you want to connect:

1. **Google Analytics & Search Console**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create OAuth 2.0 credentials
   - Add authorized redirect URI: `https://yourdomain.com/admin/oauth/callback`
   - Enable Analytics API and Search Console API

2. **Bing Webmaster Tools**:
   - Register app in [Azure AD](https://portal.azure.com/)
   - Configure API permissions
   - Add redirect URI

3. **Yandex Webmaster**:
   - Create app in [Yandex OAuth](https://oauth.yandex.com/)
   - Request webmaster API access

### 3. Deploy Edge Functions

```bash
# Deploy sync function
supabase functions deploy sync-analytics-data

# Deploy export function
supabase functions deploy export-analytics-data

# Deploy OAuth callback
supabase functions deploy oauth-callback
```

### 4. Set Environment Variables

In Supabase Edge Functions settings, add:

```
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Usage

### Connecting a Platform

1. Navigate to Admin > Search & Traffic Analytics
2. Click "Configure Credentials" for the platform you want to connect
3. Enter your OAuth Client ID and Client Secret
4. Click "Connect" and authorize access
5. Select the property/site you want to track

### Syncing Data

- **Manual Sync**: Click the "Sync Data" button in the dashboard
- **Automatic Sync**: Data syncs automatically every 24 hours (configurable)

### Viewing Analytics

1. Select date range using the date picker
2. Choose platform filter (All or specific platform)
3. Navigate through different tabs:
   - Overview for high-level metrics
   - Traffic for detailed traffic analysis
   - Search for search performance
   - Keywords for keyword tracking
   - SEO for optimization opportunities
   - Health for technical issues
   - Compare for platform comparison

### Exporting Data

1. Configure filters (date range, platforms)
2. Click "Export" button
3. CSV file will download automatically

## Architecture

### Frontend Components

```
SearchTrafficDashboard/
├── SearchTrafficDashboard.tsx (Main dashboard)
├── OAuthProviderSetup.tsx (OAuth configuration)
├── TrafficOverview.tsx (High-level metrics)
├── SearchPerformance.tsx (Search Console data)
├── KeywordAnalytics.tsx (Keyword tracking)
├── SEOOpportunities.tsx (SEO recommendations)
├── SiteHealth.tsx (Technical SEO issues)
└── ComparativeAnalysis.tsx (Platform comparison)
```

### Backend Services

```
supabase/functions/
├── sync-analytics-data/ (Data synchronization)
├── export-analytics-data/ (Data export)
└── oauth-callback/ (OAuth handling)
```

## API Integration Details

### Google Analytics (GA4)
- Uses Analytics Data API v1
- Metrics: sessions, users, pageviews, bounce rate, session duration
- Dimensions: date, device, country

### Google Search Console
- Uses Search Analytics API
- Metrics: impressions, clicks, CTR, position
- Dimensions: date, query, page, device, country

### Bing Webmaster Tools
- Uses Bing Webmaster API
- Similar metrics to Google Search Console

### Yandex Webmaster
- Uses Yandex Webmaster API
- Search performance metrics

## Security Features

- Row-Level Security (RLS) on all tables
- OAuth tokens encrypted at rest
- Secure token refresh mechanism
- User can only access their own data
- CORS protection on Edge Functions

## Performance Optimization

- Indexed database queries for fast retrieval
- Aggregated data storage to reduce API calls
- Caching layer for frequently accessed data
- Pagination support for large datasets
- Lazy loading of dashboard components

## Troubleshooting

### OAuth Connection Issues

1. **"Failed to connect"**:
   - Verify OAuth credentials are correct
   - Check redirect URI matches exactly
   - Ensure APIs are enabled in provider console

2. **"Token expired"**:
   - Token refresh should be automatic
   - If persistent, reconnect the platform

### Data Sync Issues

1. **"No data available"**:
   - Run manual sync
   - Check date range selection
   - Verify property has data for selected period

2. **"Sync failed"**:
   - Check Edge Function logs
   - Verify API quotas not exceeded
   - Ensure OAuth token is valid

### Display Issues

1. **Charts not showing**:
   - Clear browser cache
   - Check browser console for errors
   - Verify data exists in database

## Future Enhancements

- [ ] Automated alerts for significant metric changes
- [ ] Custom report builder
- [ ] Scheduled email reports
- [ ] AI-powered SEO recommendations
- [ ] Competitor tracking
- [ ] Backlink analysis integration
- [ ] Social media analytics integration
- [ ] Goal and conversion tracking
- [ ] Custom dashboard layouts
- [ ] Advanced filtering and segmentation

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review Edge Function logs in Supabase
3. Check browser console for frontend errors
4. Review database logs for query issues

## Contributing

When adding new features:
1. Update database schema if needed
2. Add new Edge Functions for API integrations
3. Create reusable React components
4. Update this documentation
5. Add tests for new functionality

## License

This feature is part of the Des Moines AI Pulse project.
