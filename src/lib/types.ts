// Shared type definitions for the Des Moines Insider app

export interface Event {
  id: string;
  title: string;
  original_description?: string;
  enhanced_description?: string;
  date: string | Date;
  location: string;
  venue?: string;
  category: string;
  price?: string;
  image_url?: string;
  source_url?: string;
  is_enhanced?: boolean;
  is_featured?: boolean;
  created_at?: string;
  updated_at?: string;
  // New timezone fields
  event_start_utc?: string;
  event_start_local?: string;
  event_timezone?: string;
  // Additional fields from database
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  ai_writeup?: string | null;
  writeup_generated_at?: string | null;
  writeup_prompt_used?: string | null;
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

export interface Hotel {
  id: string;
  name: string;
  slug: string;
  description?: string;
  short_description?: string;
  address: string;
  city: string;
  state: string;
  zip?: string;
  area?: string;
  phone?: string;
  email?: string;
  website?: string;
  affiliate_url?: string;
  affiliate_provider?: string;
  image_url?: string;
  star_rating?: number;
  price_range?: string;
  avg_nightly_rate?: number;
  amenities?: string[];
  hotel_type?: string;
  chain_name?: string;
  brand_parent?: string;
  is_featured?: boolean;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

// Union type for admin content management
export type ContentItem =
  | Event
  | Restaurant
  | Attraction
  | Playground
  | RestaurantOpening
  | Hotel;

export type ContentType =
  | "event"
  | "restaurant"
  | "attraction"
  | "playground"
  | "restaurant_opening"
  | "hotel";
