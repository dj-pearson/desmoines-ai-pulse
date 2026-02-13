/**
 * Single source of truth for advertising placement specifications.
 * Used by both the Advertise page (informational) and CreativeUploader (validation).
 */

export type PlacementType = 'top_banner' | 'featured_spot' | 'below_fold';

export interface PlacementDimension {
  width: number;
  height: number;
  label: string;
}

export interface PlacementSpec {
  type: PlacementType;
  name: string;
  description: string;
  dailyCost: number;
  dimensions: PlacementDimension[];
  maxSize: number; // bytes
  maxSizeLabel: string;
  aspectRatio: string;
  formats: string[];
  animationType: string;
  features: string[];
  specifications: string[];
}

export const PLACEMENT_SPECS: Record<PlacementType, PlacementSpec> = {
  top_banner: {
    type: 'top_banner',
    name: 'Top Banner',
    description: 'Premium placement at the top of every page',
    dailyCost: 10,
    dimensions: [
      { width: 970, height: 90, label: '970x90 (Desktop Leaderboard)' },
      { width: 728, height: 90, label: '728x90 (Standard Leaderboard)' },
      { width: 320, height: 50, label: '320x50 (Mobile Banner)' },
    ],
    maxSize: 512000, // 500KB
    maxSizeLabel: '500KB',
    aspectRatio: '~10.8:1',
    formats: ['JPG', 'PNG', 'WebP'],
    animationType: 'Static images only',
    features: ['Maximum visibility', 'Mobile & desktop', 'All pages'],
    specifications: [
      'High-resolution images (300 DPI recommended)',
      'Clear, readable text even at small sizes',
      'Strong call-to-action button',
      'Brand logo prominently displayed',
    ],
  },
  featured_spot: {
    type: 'featured_spot',
    name: 'Featured Spot',
    description: 'Highlighted placement in search results and event listings',
    dailyCost: 5,
    dimensions: [
      { width: 300, height: 250, label: '300x250 (Medium Rectangle)' },
      { width: 336, height: 280, label: '336x280 (Large Rectangle)' },
    ],
    maxSize: 307200, // 300KB
    maxSizeLabel: '300KB',
    aspectRatio: '1:1 or 6:5',
    formats: ['JPG', 'PNG', 'WebP', 'GIF'],
    animationType: 'Static or subtle animation (GIF up to 5 seconds)',
    features: ['1st or 2nd position', 'Event listings', 'High engagement'],
    specifications: [
      'Eye-catching visuals with local appeal',
      'Clear business name and offering',
      'High contrast for mobile readability',
      'Include location or Des Moines reference',
    ],
  },
  below_fold: {
    type: 'below_fold',
    name: 'Below the Fold',
    description: 'Cost-effective placement integrated within content areas',
    dailyCost: 5,
    dimensions: [
      { width: 728, height: 90, label: '728x90 (Leaderboard)' },
      { width: 320, height: 50, label: '320x50 (Mobile Banner)' },
    ],
    maxSize: 409600, // 400KB
    maxSizeLabel: '400KB',
    aspectRatio: '8:1',
    formats: ['JPG', 'PNG', 'WebP'],
    animationType: 'Static images preferred',
    features: ['Content integration', 'Targeted audience', 'Great value'],
    specifications: [
      'Native advertising style preferred',
      'Blend with editorial content design',
      'Focus on value proposition',
      'Local Des Moines imagery encouraged',
    ],
  },
};

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
