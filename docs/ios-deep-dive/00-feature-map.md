# iOS app feature map

Source of truth for the per-feature deep dive (2026-09-27). Paths are relative to `ios/`.
Each group below gets its own report in this folder once audited.

## Tabs

`DesMoinesInsider/Views/MainTabView.swift`: Home, Dining, Search, Map, Saved, Profile on iPhone.
iPad adds Discover, Trip Planner and Dashboard to the sidebar.

| # | Group | Entry | Report |
|---|---|---|---|
| 1 | Events: Home feed, rails, event detail, filters | Home tab | `01-events.md` |
| 2 | Restaurants: Dining tab, restaurant detail | Dining tab | `02-restaurants.md` |
| 3 | Saved / Favorites, Dashboard | Saved tab, Profile | `03-saved.md` |
| 4 | Auth, Profile, Settings, Onboarding, Consent | Profile tab, launch | `04-account.md` |
| 5 | Search, Saved Searches, Siri intents | Search tab | `05-search.md` |
| 6 | Monetization: subscription, paywall, ads, sponsored | everywhere | `06-monetization.md` |
| 7 | Discover: swipe, group session, Surprise Me, Ask Pulse | Home, Dining | `07-discover.md` |
| 8 | Map | Map tab | `08-map.md` |
| 9 | Trip Planner | Home card, hub | `09-trip-planner.md` |
| 10 | Weekend, Attractions, Neighborhoods, Content Hubs | Discover hub | `10-browse.md` |
| 11 | Hotels, Deals, Articles, Best Of, Reviews | Discover hub, details | `11-guides.md` |
| 12 | Platform: shell, deep links, networking, security | app-wide | `12-platform.md` |

## Backend calls by service

| Service | Tables | RPCs | Edge functions |
|---|---|---|---|
| EventsService | events | fuzzy_search_events, search_events_near_location | |
| ForYouService | swipe_interactions | get_personalized_recommendations, get_trending_events | |
| RestaurantsService | restaurants | get_rotated_restaurants, restaurants_within_radius, fuzzy_search_restaurants | |
| FilterValues | | filter_values | |
| AttractionsService | attractions | attractions_within_radius | |
| FavoritesService | user_{event,restaurant,attraction,article}_interactions + content tables | | |
| SavedSearchService | saved_searches | | |
| SwipeInteractionService | swipe_interactions | | |
| SwipeSessionService | swipe_sessions, swipe_session_participants | generate_swipe_session_code, get_swipe_session_matches | |
| SurpriseMeService | surprise_pick_outcomes | get_surprise_pick | |
| AskPulseService | | | discover-chat |
| SponsoredPickService | | | get-sponsored-pick |
| TripPlannerService | trip_plans, trip_plan_items | get_trip_itinerary | |
| HotelsService | hotels | filter_values | |
| DealsService | deals | increment_deal_redemption | |
| ArticlesService | articles | filter_values | |
| VotingService | voting_categories, votes, restaurants, attractions | voting_category_tallies, voting_results, voting_winners | |
| RatingsService | user_ratings, content_rating_aggregates, rating_abuse_reports | | |
| AuthService | profiles, user_roles | | |
| AccountDeletionService | | | delete-user-account |
| StoreKitService | user_subscriptions | | validate-ios-receipt |
| AdTrackingService | ad_impressions, ad_clicks | | |
| CampaignAdService | | get_active_ads | |
| PushNotificationService | | | register-device-token |
| VersionCheckService | | | version-check |
| ErrorSink / CrashUploader | | | log-error |
| WeatherService | | | api.open-meteo.com |
