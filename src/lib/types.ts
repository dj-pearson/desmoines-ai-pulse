// Shared type definitions for the Des Moines Insider app

export interface Event {
  id: string;
  title: string;
  originalDescription?: string;
  enhancedDescription?: string;
  date: string | Date;
  location: string;
  venue?: string;
  category: string;
  price?: string;
  imageUrl?: string;
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
  status: 'opening_soon' | 'newly_opened' | 'announced';
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
  imageUrl?: string;
  isFeatured?: boolean;
  openingDate?: string;
  openingTimeframe?: string;
  status?: 'open' | 'opening_soon' | 'newly_opened' | 'announced' | 'closed';
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
  imageUrl?: string;
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
  imageUrl?: string;
  isFeatured?: boolean;
  createdAt?: string;
  updatedAt?: string;
}