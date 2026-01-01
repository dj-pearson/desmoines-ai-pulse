# Hooks Registry

**Last Updated**: 2026-01-01
**Total Hooks**: 101
**Location**: `src/hooks/`

This registry documents all custom React hooks in the Des Moines AI Pulse platform, organized by category with usage examples.

---

## Table of Contents

1. [Data Fetching & Queries](#data-fetching--queries)
2. [Authentication & Security](#authentication--security)
3. [User Preferences & Profile](#user-preferences--profile)
4. [Search & Discovery](#search--discovery)
5. [AI & Recommendations](#ai--recommendations)
6. [Events Management](#events-management)
7. [Restaurant & Attractions](#restaurant--attractions)
8. [Payments & Subscriptions](#payments--subscriptions)
9. [Analytics & Tracking](#analytics--tracking)
10. [Admin & CRM](#admin--crm)
11. [Mobile & Touch Interactions](#mobile--touch-interactions)
12. [UI & Accessibility](#ui--accessibility)
13. [Social Features](#social-features)
14. [Media & Content](#media--content)
15. [System & Utilities](#system--utilities)

---

## Data Fetching & Queries

Core hooks for fetching and managing data from Supabase.

| Hook | Description | Returns |
|------|-------------|---------|
| `useSupabase` | Provides Supabase client instance | `{ supabase }` |
| `useEvents` | Fetches events with filtering and pagination | `{ data, isLoading, error }` |
| `useRestaurants` | Fetches restaurants with filtering | `{ data, isLoading, error }` |
| `useAttractions` | Fetches attractions with filtering | `{ data, isLoading, error }` |
| `usePlaygrounds` | Fetches playground/park data | `{ data, isLoading, error }` |
| `useArticles` | Fetches blog articles | `{ data, isLoading, error }` |
| `useTrending` | Fetches trending content across categories | `{ data, isLoading }` |
| `useTrendingContent` | Enhanced trending content with scoring | `{ data, isLoading }` |

### Usage Example

```typescript
import { useEvents } from '@/hooks/useEvents';

function EventList() {
  const { data: events, isLoading, error } = useEvents({
    category: 'Music',
    dateRange: 'this-week'
  });

  if (isLoading) return <Skeleton />;
  if (error) return <Error message={error.message} />;

  return <EventGrid events={events} />;
}
```

---

## Authentication & Security

Hooks for authentication, authorization, and security features.

| Hook | Description | Returns |
|------|-------------|---------|
| `useAuth` | Main authentication hook (login, logout, user state) | `{ user, isAuthenticated, login, logout }` |
| `useAdminAuth` | Admin-specific authentication and role checking | `{ isAdmin, adminPermissions }` |
| `useAuthSecurity` | Security features for auth (lockout, attempts) | `{ checkLockout, recordAttempt }` |
| `useAccountLockout` | Account lockout management after failed attempts | `{ isLocked, lockoutEndTime }` |
| `usePasswordPolicy` | Password strength and policy validation | `{ validatePassword, requirements }` |
| `useMFA` | Multi-factor authentication setup and verification | `{ enable2FA, verify2FA, isEnabled }` |
| `useMagicLink` | Magic link authentication | `{ sendMagicLink, isLoading }` |
| `useLoginActivity` | Tracks login history and suspicious activity | `{ loginHistory, suspiciousLogins }` |
| `useSessionManager` | Session management and validation | `{ session, refreshSession }` |
| `useSessionTimeout` | Auto-logout on session timeout | `{ timeRemaining, extendSession }` |
| `useAdminSecurity` | Admin security auditing and monitoring | `{ securityLogs, auditTrail }` |
| `useSecurityAudit` | Security audit trail and logging | `{ logEvent, getAuditLogs }` |
| `useUserRole` | User role checking and permissions | `{ role, hasPermission }` |
| `useSecureProfile` | Secure profile data access | `{ profile, updateSecure }` |
| `useApiKeys` | API key management for developers | `{ keys, createKey, revokeKey }` |

### Usage Example

```typescript
import { useAuth } from '@/hooks/useAuth';

function ProtectedComponent() {
  const { user, isAuthenticated, isAdmin } = useAuth();

  if (!isAuthenticated) {
    return <LoginPrompt />;
  }

  return (
    <div>
      <p>Welcome, {user.email}</p>
      {isAdmin && <AdminPanel />}
    </div>
  );
}
```

---

## User Preferences & Profile

Hooks for managing user preferences and profile data.

| Hook | Description | Returns |
|------|-------------|---------|
| `useProfile` | User profile data and updates | `{ profile, updateProfile }` |
| `useUserPreferences` | User preference management (themes, notifications) | `{ preferences, updatePreference }` |
| `use-user-preferences` | Alternative preferences hook with local storage | `{ prefs, setPrefs }` |
| `useEmailPreferences` | Email notification preferences | `{ emailPrefs, updateEmailPrefs }` |
| `useFavorites` | User's favorite events/restaurants | `{ favorites, addFavorite, removeFavorite }` |
| `useRecentlyViewed` | Recently viewed items tracking | `{ recentItems, addViewed }` |

### Usage Example

```typescript
import { useFavorites } from '@/hooks/useFavorites';

function FavoriteButton({ eventId }) {
  const { favorites, addFavorite, removeFavorite } = useFavorites();
  const isFavorite = favorites.includes(eventId);

  return (
    <Button onClick={() => isFavorite ? removeFavorite(eventId) : addFavorite(eventId)}>
      {isFavorite ? 'Remove' : 'Add to Favorites'}
    </Button>
  );
}
```

---

## Search & Discovery

Hooks powering search functionality and content discovery.

| Hook | Description | Returns |
|------|-------------|---------|
| `useAdvancedSearch` | Advanced search with multiple filters | `{ results, search, filters }` |
| `useEnhancedSearch` | Enhanced search with scoring and ranking | `{ results, suggestions }` |
| `useNLPSearch` | Natural language search using AI | `{ results, parseQuery }` |
| `useProximitySearch` | Location-based proximity search | `{ nearbyResults, distance }` |
| `useSearchInsights` | Search analytics and popular queries | `{ popularSearches, trends }` |
| `useFilterKeyboardShortcuts` | Keyboard shortcuts for search filters | `{ shortcuts }` |

### Usage Example

```typescript
import { useNLPSearch } from '@/hooks/useNLPSearch';

function SmartSearch() {
  const { results, parseQuery, isLoading } = useNLPSearch();

  const handleSearch = async (query: string) => {
    // "family friendly events this weekend near downtown"
    await parseQuery(query);
  };

  return (
    <SearchInput onSearch={handleSearch} />
  );
}
```

---

## AI & Recommendations

Hooks for AI-powered features and recommendations.

| Hook | Description | Returns |
|------|-------------|---------|
| `useAIConfiguration` | AI model configuration and settings | `{ config, updateConfig }` |
| `useAIModels` | AI model selection and management | `{ models, activeModel }` |
| `useTripPlanner` | AI-powered trip planning | `{ createItinerary, itinerary }` |
| `usePersonalizedRecommendations` | Personalized content recommendations | `{ recommendations }` |
| `useEnhancedRecommendations` | Enhanced recommendations with ML | `{ topPicks, forYou }` |
| `useEventRecommendations` | Event-specific recommendations | `{ similar, recommended }` |
| `useSmartRecommendations` | Smart recommendations engine | `{ getRecommendations }` |
| `useSimplePersonalization` | Lightweight personalization | `{ preferences, suggest }` |
| `useSmartCalendar` | AI-powered calendar suggestions | `{ suggestions, conflicts }` |
| `useWriteupGenerator` | AI content/writeup generation | `{ generate, isGenerating }` |

### Usage Example

```typescript
import { useTripPlanner } from '@/hooks/useTripPlanner';

function TripPlannerPage() {
  const { createItinerary, itinerary, isLoading } = useTripPlanner();

  const handlePlan = async () => {
    await createItinerary({
      dates: { start: '2026-01-15', end: '2026-01-17' },
      interests: ['food', 'art', 'family'],
      budget: 'moderate'
    });
  };

  return (
    <div>
      <Button onClick={handlePlan}>Create Itinerary</Button>
      {itinerary && <ItineraryDisplay itinerary={itinerary} />}
    </div>
  );
}
```

---

## Events Management

Hooks for event-specific operations.

| Hook | Description | Returns |
|------|-------------|---------|
| `useEventClone` | Clone/duplicate events | `{ cloneEvent }` |
| `useEventReminders` | Event reminder scheduling | `{ setReminder, reminders }` |
| `useEventSocial` | Social sharing for events | `{ shareEvent, socialLinks }` |
| `useEventSocialConnections` | Social connections for events | `{ connections, connect }` |
| `useBatchEventSocial` | Batch social operations for events | `{ batchShare }` |
| `useClearEventCache` | Clear event cache | `{ clearCache }` |
| `useUserSubmittedEvents` | User-submitted event management | `{ submissions, submit }` |

---

## Restaurant & Attractions

Hooks for restaurant and attraction management.

| Hook | Description | Returns |
|------|-------------|---------|
| `useRestaurantOpenings` | Track new restaurant openings | `{ newOpenings, upcoming }` |
| `useBulkRestaurantUpdate` | Bulk update restaurant data | `{ bulkUpdate }` |
| `useRatings` | Ratings and reviews system | `{ ratings, submitRating }` |

---

## Payments & Subscriptions

Hooks for payment processing and subscription management.

| Hook | Description | Returns |
|------|-------------|---------|
| `useSubscription` | Subscription tier and premium checks | `{ tier, isPremium, hasFeature }` |
| `useCampaigns` | Advertising campaign management | `{ campaigns, createCampaign }` |
| `useAdminCampaigns` | Admin campaign management | `{ allCampaigns, approve }` |
| `useCampaignAnalytics` | Campaign performance analytics | `{ metrics, roi }` |
| `useCampaignRenewal` | Campaign renewal management | `{ renewCampaign, expiringCampaigns }` |

### Usage Example

```typescript
import { useSubscription } from '@/hooks/useSubscription';

function PremiumFeature() {
  const { tier, isPremium, hasFeature } = useSubscription();

  if (!hasFeature('advanced_search')) {
    return <UpgradePrompt feature="Advanced Search" />;
  }

  return <AdvancedSearchPanel />;
}
```

---

## Analytics & Tracking

Hooks for analytics, tracking, and monitoring.

| Hook | Description | Returns |
|------|-------------|---------|
| `useAnalytics` | General analytics tracking | `{ trackEvent, pageView }` |
| `useAdvancedAnalytics` | Advanced analytics with segmentation | `{ metrics, segments }` |
| `useViewTracking` | Page/content view tracking | `{ trackView, viewCount }` |
| `useAdTracking` | Advertisement tracking | `{ trackImpression, trackClick }` |
| `useActiveAds` | Active advertisement management | `{ activeAds, impressions }` |
| `useWebVitals` | Core Web Vitals monitoring | `{ lcp, fid, cls }` |
| `useSystemMonitoring` | System health monitoring | `{ status, alerts }` |

---

## Admin & CRM

Hooks for admin dashboard and CRM functionality.

| Hook | Description | Returns |
|------|-------------|---------|
| `useCrmActivities` | CRM activity tracking | `{ activities, logActivity }` |
| `useCrmCommunications` | CRM communications management | `{ messages, sendMessage }` |
| `useCrmContacts` | CRM contact management | `{ contacts, addContact }` |
| `useCrmDashboard` | CRM dashboard data | `{ stats, pipeline }` |
| `useCrmDeals` | CRM deal/opportunity management | `{ deals, updateDeal }` |
| `useCrmNotes` | CRM notes and comments | `{ notes, addNote }` |
| `useCrmSegments` | CRM customer segmentation | `{ segments, createSegment }` |
| `useCrmTasks` | CRM task management | `{ tasks, assignTask }` |
| `useTeamManagement` | Team/user management | `{ team, addMember }` |
| `useContentQueue` | Content moderation queue | `{ queue, approve, reject }` |
| `useDataExport` | Data export functionality | `{ exportData, formats }` |
| `useDataQuality` | Data quality scoring | `{ qualityScore, issues }` |
| `useScraping` | Web scraping management | `{ scrapeStatus, startScrape }` |
| `useCompetitorAnalysis` | Competitor analysis tools | `{ competitors, analyze }` |
| `useDomainHighlights` | Domain/SEO highlights | `{ highlights, ranking }` |

---

## Mobile & Touch Interactions

Hooks optimized for mobile and touch interactions.

| Hook | Description | Returns |
|------|-------------|---------|
| `use-mobile` | Mobile device detection | `{ isMobile, isTablet }` |
| `use-media-query` | CSS media query matching | `{ matches }` |
| `use-swipe` | Swipe gesture handling | `{ direction, distance }` |
| `use-long-press` | Long press gesture detection | `{ isPressed, duration }` |
| `use-touch-ripple` | Touch ripple effect | `{ ripple, trigger }` |
| `use-pull-to-refresh` | Pull to refresh functionality | `{ isRefreshing, onRefresh }` |
| `use-native-share` | Native share API integration | `{ share, canShare }` |
| `useLocationTracking` | GPS location tracking | `{ location, tracking }` |
| `useGeofencing` | Geofence entry/exit detection | `{ inZone, nearbyZones }` |

### Usage Example

```typescript
import { useSwipe } from '@/hooks/use-swipe';

function SwipeableCard() {
  const { ref, direction } = useSwipe({
    onSwipeLeft: () => dismissCard(),
    onSwipeRight: () => saveCard(),
  });

  return <div ref={ref}>Swipe me!</div>;
}
```

---

## UI & Accessibility

Hooks for UI interactions and accessibility features.

| Hook | Description | Returns |
|------|-------------|---------|
| `use-toast` | Toast notification management | `{ toast, dismiss }` |
| `use-keyboard-shortcuts` | Global keyboard shortcut handling | `{ registerShortcut }` |
| `use-calendar-export` | Calendar export (ICS, Google) | `{ exportToICS, exportToGoogle }` |
| `useAccessibility` | Accessibility features and preferences | `{ settings, announce }` |
| `useScrollPreservation` | Scroll position preservation | `{ preserveScroll }` |

### Usage Example

```typescript
import { useToast } from '@/hooks/use-toast';

function SaveButton() {
  const { toast } = useToast();

  const handleSave = async () => {
    await saveData();
    toast({
      title: 'Saved!',
      description: 'Your changes have been saved.',
    });
  };

  return <Button onClick={handleSave}>Save</Button>;
}
```

---

## Social Features

Hooks for social and community features.

| Hook | Description | Returns |
|------|-------------|---------|
| `useSocialFeatures` | Social interactions (likes, shares) | `{ like, share, comment }` |
| `useSocialMediaManager` | Social media management | `{ post, schedule }` |
| `useCommunityFeatures` | Community engagement features | `{ discussions, join }` |
| `useFeedback` | User feedback collection | `{ submitFeedback }` |
| `useGamification` | Gamification points and badges | `{ points, badges, earn }` |
| `useContactForm` | Contact form handling | `{ submit, isSubmitting }` |
| `useNewsletterSubscription` | Newsletter subscription | `{ subscribe, isSubscribed }` |
| `useBusinessPartnership` | Business partnership requests | `{ submitPartnership }` |

---

## Media & Content

Hooks for media handling and content management.

| Hook | Description | Returns |
|------|-------------|---------|
| `useMediaLibrary` | Media library browsing | `{ media, upload }` |
| `useMediaUpload` | File upload handling | `{ upload, progress }` |

---

## System & Utilities

Utility hooks for system-level functionality.

| Hook | Description | Returns |
|------|-------------|---------|
| `useAuth-PearsonASUS` | Legacy auth hook (deprecated) | - |
| `useUserRole-PearsonASUS` | Legacy role hook (deprecated) | - |

---

## Best Practices

### 1. Always Destructure Returns

```typescript
// Good
const { data, isLoading, error } = useEvents();

// Avoid
const result = useEvents();
```

### 2. Handle Loading and Error States

```typescript
const { data, isLoading, error } = useRestaurants();

if (isLoading) return <Skeleton />;
if (error) return <ErrorMessage error={error} />;
return <RestaurantList data={data} />;
```

### 3. Memoize Callbacks

```typescript
const { addFavorite } = useFavorites();

const handleFavorite = useCallback((id: string) => {
  addFavorite(id);
}, [addFavorite]);
```

### 4. Use Proper Dependencies

```typescript
const { search } = useAdvancedSearch();

useEffect(() => {
  search(query);
}, [query, search]);
```

---

## Creating New Hooks

When creating new hooks, follow these patterns:

### File Naming
- Use kebab-case for UI hooks: `use-toast.ts`
- Use camelCase for feature hooks: `useEvents.ts`

### Structure

```typescript
import { useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface UseExampleOptions {
  initialValue?: string;
}

interface UseExampleReturn {
  data: ExampleData | null;
  isLoading: boolean;
  error: Error | null;
  doSomething: (value: string) => Promise<void>;
}

export function useExample(options?: UseExampleOptions): UseExampleReturn {
  const { data, isLoading, error } = useQuery({
    queryKey: ['example'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('example')
        .select('*');

      if (error) throw error;
      return data;
    },
  });

  const doSomething = useCallback(async (value: string) => {
    // Implementation
  }, []);

  return {
    data,
    isLoading,
    error,
    doSomething,
  };
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-01 | Initial registry with 101 hooks documented |
