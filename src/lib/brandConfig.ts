/**
 * Centralized Brand Configuration
 *
 * This file contains all brand-related constants used throughout the application.
 * Update these values when branding changes to ensure consistency across all SEO,
 * meta tags, sitemaps, and user-facing content.
 */

export const BRAND = {
  // Primary brand name - used in titles, meta tags, and content
  name: 'Des Moines AI Pulse',

  // Short name - used where space is limited
  shortName: 'DM AI Pulse',

  // Production URL - used for canonical URLs, sitemaps, and structured data
  // Update this when deploying to a new domain
  baseUrl: 'https://desmoinesaipulse.com',

  // Social media handles
  twitter: '@desmoinespulse',

  // Geographic targeting
  city: 'Des Moines',
  state: 'Iowa',
  stateAbbr: 'IA',
  region: 'Greater Des Moines Area',
  country: 'US',

  // Default descriptions
  tagline: 'Your AI-powered guide to Des Moines events, restaurants, and local discoveries',
  description: 'Discover events, restaurants, and attractions in Des Moines, Iowa. AI-powered local guide with real-time updates, personalized recommendations, and comprehensive coverage of the Greater Des Moines area.',

  // Default images
  logo: '/DMI-Logo.png',
  ogImage: '/og-image.png',

  // Theme colors
  themeColor: '#3B82F6',
  backgroundColor: '#ffffff',

  // Contact
  email: 'hello@desmoinesaipulse.com',
} as const;

// Helper functions for common SEO patterns
export function getCanonicalUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BRAND.baseUrl}${cleanPath}`;
}

export function getPageTitle(title: string, includeBrand = true): string {
  if (!includeBrand) return title;
  return `${title} | ${BRAND.name}`;
}

export function getLocalizedLocation(neighborhood?: string): string {
  if (neighborhood) {
    return `${neighborhood}, ${BRAND.city}, ${BRAND.state}`;
  }
  return `${BRAND.city}, ${BRAND.state}`;
}

// Export individual constants for backward compatibility
export const SITE_NAME = BRAND.name;
export const BASE_URL = BRAND.baseUrl;
export const CITY = BRAND.city;
export const STATE = BRAND.state;
export const REGION = BRAND.region;
