/**
 * User Preference Types for Personalization Engine
 *
 * These types define the structure for storing and managing user preferences
 * to power personalized recommendations and content filtering.
 */

export interface UserInterests {
  // Event categories user is interested in
  categories: EventCategory[];

  // Specific tags/themes
  tags: string[];

  // Activity preferences
  activityLevel: 'relaxed' | 'moderate' | 'active';

  // Indoor vs Outdoor preference
  environmentPreference: 'indoor' | 'outdoor' | 'both';

  // Social preference
  socialPreference: 'solo' | 'couples' | 'groups' | 'families' | 'flexible';
}

export type EventCategory =
  | 'music'
  | 'food'
  | 'arts'
  | 'sports'
  | 'nightlife'
  | 'family'
  | 'culture'
  | 'education'
  | 'outdoor'
  | 'wellness'
  | 'community'
  | 'business';

export interface CuisinePreferences {
  // Favorite cuisines
  favorites: string[];

  // Dietary restrictions
  dietary: DietaryRestriction[];

  // Price range preference
  priceRange: '$' | '$$' | '$$$' | '$$$$' | 'any';

  // Atmosphere preference
  atmosphere: 'casual' | 'upscale' | 'family-friendly' | 'romantic' | 'any';
}

export type DietaryRestriction =
  | 'vegetarian'
  | 'vegan'
  | 'gluten-free'
  | 'dairy-free'
  | 'nut-free'
  | 'halal'
  | 'kosher';

export interface LocationPreferences {
  // Preferred neighborhoods
  neighborhoods: string[];

  // Maximum distance willing to travel (miles)
  maxDistance: number;

  // Prefer walkable areas
  preferWalkable: boolean;

  // Has transportation
  hasTransportation: boolean;
}

export interface TimePreferences {
  // Preferred days of week
  preferredDays: number[]; // 0-6 (Sunday-Saturday)

  // Preferred time of day
  preferredTimes: ('morning' | 'afternoon' | 'evening' | 'late-night')[];

  // How far in advance to plan
  planningHorizon: 'spontaneous' | 'week-ahead' | 'month-ahead';

  // Frequency of new experiences
  explorationFrequency: 'conservative' | 'balanced' | 'adventurous';
}

export interface NotificationPreferences {
  // Email notifications
  emailDigest: 'daily' | 'weekly' | 'never';

  // Push notifications
  pushEnabled: boolean;
  pushTypes: {
    newEvents: boolean;
    nearbyEvents: boolean;
    favoriteVenues: boolean;
    friendActivity: boolean;
    recommendations: boolean;
  };

  // Notification quiet hours
  quietHours: {
    enabled: boolean;
    start: string; // HH:mm format
    end: string;   // HH:mm format
  };
}

export interface UserPreferences {
  // User ID
  userId: string;

  // Core preferences
  interests: UserInterests;
  cuisine: CuisinePreferences;
  location: LocationPreferences;
  time: TimePreferences;
  notifications: NotificationPreferences;

  // Metadata
  onboardingCompleted: boolean;
  lastUpdated: string;
  version: number; // For schema migrations
}

/**
 * Default preferences for new users
 */
export const defaultPreferences: Omit<UserPreferences, 'userId'> = {
  interests: {
    categories: [],
    tags: [],
    activityLevel: 'moderate',
    environmentPreference: 'both',
    socialPreference: 'flexible',
  },
  cuisine: {
    favorites: [],
    dietary: [],
    priceRange: 'any',
    atmosphere: 'any',
  },
  location: {
    neighborhoods: [],
    maxDistance: 15, // 15 miles default
    preferWalkable: false,
    hasTransportation: true,
  },
  time: {
    preferredDays: [0, 1, 2, 3, 4, 5, 6], // All days
    preferredTimes: ['afternoon', 'evening'],
    planningHorizon: 'week-ahead',
    explorationFrequency: 'balanced',
  },
  notifications: {
    emailDigest: 'weekly',
    pushEnabled: false,
    pushTypes: {
      newEvents: false,
      nearbyEvents: false,
      favoriteVenues: false,
      friendActivity: false,
      recommendations: false,
    },
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00',
    },
  },
  onboardingCompleted: false,
  lastUpdated: new Date().toISOString(),
  version: 1,
};

/**
 * Onboarding steps configuration
 */
export const onboardingSteps = [
  {
    id: 'welcome',
    title: 'Welcome to Des Moines AI Pulse',
    description: 'Let\'s personalize your experience',
  },
  {
    id: 'interests',
    title: 'What are you interested in?',
    description: 'Select all that apply',
  },
  {
    id: 'cuisine',
    title: 'Food preferences',
    description: 'Help us recommend great dining',
  },
  {
    id: 'location',
    title: 'Where do you like to go?',
    description: 'Tell us about your favorite areas',
  },
  {
    id: 'calendar',
    title: 'Connect your calendar',
    description: 'Get smart event suggestions based on your schedule',
  },
  {
    id: 'notifications',
    title: 'Stay updated',
    description: 'Choose how you want to hear from us',
  },
  {
    id: 'complete',
    title: 'All set!',
    description: 'Your personalized experience awaits',
  },
] as const;

/**
 * Interest categories with icons and descriptions
 */
export const interestCategories: Array<{
  id: EventCategory;
  label: string;
  icon: string;
  description: string;
  color: string;
}> = [
  {
    id: 'music',
    label: 'Music & Concerts',
    icon: '🎵',
    description: 'Live music, concerts, and performances',
    color: 'bg-purple-500',
  },
  {
    id: 'food',
    label: 'Food & Dining',
    icon: '🍽️',
    description: 'Restaurants, food festivals, and culinary events',
    color: 'bg-orange-500',
  },
  {
    id: 'arts',
    label: 'Arts & Culture',
    icon: '🎨',
    description: 'Museums, galleries, and cultural events',
    color: 'bg-pink-500',
  },
  {
    id: 'sports',
    label: 'Sports & Fitness',
    icon: '⚽',
    description: 'Sporting events, fitness classes, and recreation',
    color: 'bg-green-500',
  },
  {
    id: 'nightlife',
    label: 'Nightlife',
    icon: '🌙',
    description: 'Bars, clubs, and evening entertainment',
    color: 'bg-indigo-500',
  },
  {
    id: 'family',
    label: 'Family Activities',
    icon: '👨‍👩‍👧‍👦',
    description: 'Kid-friendly events and family outings',
    color: 'bg-blue-500',
  },
  {
    id: 'culture',
    label: 'Cultural Events',
    icon: '🏛️',
    description: 'Theater, dance, and cultural celebrations',
    color: 'bg-red-500',
  },
  {
    id: 'education',
    label: 'Learning & Education',
    icon: '📚',
    description: 'Workshops, classes, and educational events',
    color: 'bg-yellow-500',
  },
  {
    id: 'outdoor',
    label: 'Outdoor Adventures',
    icon: '🏕️',
    description: 'Parks, trails, and outdoor activities',
    color: 'bg-teal-500',
  },
  {
    id: 'wellness',
    label: 'Health & Wellness',
    icon: '🧘',
    description: 'Yoga, meditation, and wellness events',
    color: 'bg-emerald-500',
  },
  {
    id: 'community',
    label: 'Community',
    icon: '🤝',
    description: 'Local gatherings and community events',
    color: 'bg-cyan-500',
  },
  {
    id: 'business',
    label: 'Business & Networking',
    icon: '💼',
    description: 'Professional events and networking',
    color: 'bg-gray-500',
  },
];
