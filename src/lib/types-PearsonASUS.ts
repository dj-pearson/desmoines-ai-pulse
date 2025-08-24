// Shared type definitions for the Des Moines Insider app

export interface Event {
  id: string;
  title: string;
  originalDescription?: string;
  enhancedDescription?: string;
  date: string | Date; // Legacy field - use event_start_utc instead when available
  event_start_local?: string;
  event_timezone?: string;
  event_start_utc?: string;
  location: string;
  venue?: string;
  category: string;
  price?: string;
  image_url?: string;
  sourceUrl?: string;
  isEnhanced?: boolean;
  isFeatured?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface RestaurantOpening {
  id: string;
  name: string;
  description?: string;
  location?: string;
  cuisine?: string;
  openingDate?: string;
  openingTimeframe?: string;
  status: "opening_soon" | "newly_opened" | "announced";
  sourceUrl?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Restaurant {
  id: string;
  name: string;
  cuisine?: string;
  location?: string;
  rating?: number;
  priceRange?: string;
  description?: string;
  phone?: string;
  website?: string;
  image_url?: string;
  isFeatured?: boolean;
  openingDate?: string;
  openingTimeframe?: string;
  status?: "open" | "opening_soon" | "newly_opened" | "announced" | "closed";
  sourceUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Attraction {
  id: string;
  name: string;
  type: string;
  location?: string;
  description?: string;
  rating?: number;
  website?: string;
  image_url?: string;
  isFeatured?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Playground {
  id: string;
  name: string;
  location?: string;
  description?: string;
  ageRange?: string;
  amenities?: string[];
  rating?: number;
  image_url?: string;
  isFeatured?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Union type for admin content management
export type ContentItem =
  | Event
  | Restaurant
  | Attraction
  | Playground
  | RestaurantOpening;

export type ContentType =
  | "event"
  | "restaurant"
  | "attraction"
  | "playground"
  | "restaurant_opening";
