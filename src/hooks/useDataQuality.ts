/**
 * Data Quality Hook
 * Analyzes content for quality issues and provides auto-fix suggestions
 */

import { useMemo } from 'react';

export interface QualityIssue {
  id: string;
  contentId: string;
  contentType: 'event' | 'restaurant' | 'attraction' | 'playground';
  field: string;
  issue: string;
  severity: 'error' | 'warning' | 'info';
  autoFixable: boolean;
  currentValue?: any;
  suggestedValue?: any;
}

export interface QualitySummary {
  contentType: string;
  total: number;
  errors: number;
  warnings: number;
  infos: number;
  issues: QualityIssue[];
}

/**
 * Validates phone number format
 */
function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10;
}

/**
 * Validates URL format
 */
function isValidUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Formats phone number to standard format
 */
function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

/**
 * Validates if date is in the past
 */
function isDateInPast(date: string | Date | null | undefined): boolean {
  if (!date) return false;
  try {
    const dateObj = new Date(date);
    return dateObj < new Date();
  } catch {
    return false;
  }
}

/**
 * Hook to analyze data quality
 */
export function useDataQuality(
  contentType: 'event' | 'restaurant' | 'attraction' | 'playground',
  items: any[]
): QualitySummary {
  const issues = useMemo(() => {
    const foundIssues: QualityIssue[] = [];

    items.forEach((item) => {
      const issueIdPrefix = `${contentType}-${item.id}`;

      // Common checks for all types
      if (!item.name && !item.title) {
        foundIssues.push({
          id: `${issueIdPrefix}-missing-title`,
          contentId: item.id,
          contentType,
          field: 'title/name',
          issue: 'Missing title or name',
          severity: 'error',
          autoFixable: false,
          currentValue: null
        });
      }

      if (!item.image_url) {
        foundIssues.push({
          id: `${issueIdPrefix}-missing-image`,
          contentId: item.id,
          contentType,
          field: 'image_url',
          issue: 'Missing image',
          severity: 'info',
          autoFixable: false,
          currentValue: null
        });
      } else if (!isValidUrl(item.image_url)) {
        foundIssues.push({
          id: `${issueIdPrefix}-invalid-image-url`,
          contentId: item.id,
          contentType,
          field: 'image_url',
          issue: 'Invalid image URL',
          severity: 'warning',
          autoFixable: false,
          currentValue: item.image_url
        });
      }

      // Type-specific checks
      if (contentType === 'event') {
        if (!item.venue) {
          foundIssues.push({
            id: `${issueIdPrefix}-missing-venue`,
            contentId: item.id,
            contentType,
            field: 'venue',
            issue: 'Missing venue',
            severity: 'error',
            autoFixable: false,
            currentValue: null
          });
        }

        if (!item.date) {
          foundIssues.push({
            id: `${issueIdPrefix}-missing-date`,
            contentId: item.id,
            contentType,
            field: 'date',
            issue: 'Missing date',
            severity: 'error',
            autoFixable: false,
            currentValue: null
          });
        } else if (isDateInPast(item.date)) {
          foundIssues.push({
            id: `${issueIdPrefix}-date-in-past`,
            contentId: item.id,
            contentType,
            field: 'date',
            issue: 'Event date is in the past',
            severity: 'warning',
            autoFixable: false,
            currentValue: item.date
          });
        }

        if (!item.category || item.category === 'Uncategorized') {
          foundIssues.push({
            id: `${issueIdPrefix}-missing-category`,
            contentId: item.id,
            contentType,
            field: 'category',
            issue: 'Missing or uncategorized',
            severity: 'warning',
            autoFixable: false,
            currentValue: item.category
          });
        }

        if (item.source_url && !isValidUrl(item.source_url)) {
          foundIssues.push({
            id: `${issueIdPrefix}-invalid-source-url`,
            contentId: item.id,
            contentType,
            field: 'source_url',
            issue: 'Invalid source URL',
            severity: 'warning',
            autoFixable: false,
            currentValue: item.source_url
          });
        }

        if (!item.original_description && !item.enhanced_description) {
          foundIssues.push({
            id: `${issueIdPrefix}-missing-description`,
            contentId: item.id,
            contentType,
            field: 'description',
            issue: 'Missing description',
            severity: 'info',
            autoFixable: false,
            currentValue: null
          });
        }
      }

      if (contentType === 'restaurant') {
        if (!item.cuisine) {
          foundIssues.push({
            id: `${issueIdPrefix}-missing-cuisine`,
            contentId: item.id,
            contentType,
            field: 'cuisine',
            issue: 'Missing cuisine type',
            severity: 'warning',
            autoFixable: false,
            currentValue: null
          });
        }

        if (!item.location) {
          foundIssues.push({
            id: `${issueIdPrefix}-missing-location`,
            contentId: item.id,
            contentType,
            field: 'location',
            issue: 'Missing location',
            severity: 'error',
            autoFixable: false,
            currentValue: null
          });
        }

        if (item.phone && !isValidPhone(item.phone)) {
          foundIssues.push({
            id: `${issueIdPrefix}-invalid-phone`,
            contentId: item.id,
            contentType,
            field: 'phone',
            issue: 'Invalid phone number format',
            severity: 'error',
            autoFixable: true,
            currentValue: item.phone,
            suggestedValue: formatPhone(item.phone)
          });
        }

        if (item.website && !isValidUrl(item.website)) {
          foundIssues.push({
            id: `${issueIdPrefix}-invalid-website`,
            contentId: item.id,
            contentType,
            field: 'website',
            issue: 'Invalid website URL',
            severity: 'warning',
            autoFixable: false,
            currentValue: item.website
          });
        }

        if (!item.description) {
          foundIssues.push({
            id: `${issueIdPrefix}-missing-description`,
            contentId: item.id,
            contentType,
            field: 'description',
            issue: 'Missing description',
            severity: 'info',
            autoFixable: false,
            currentValue: null
          });
        }
      }

      if (contentType === 'attraction') {
        if (!item.type) {
          foundIssues.push({
            id: `${issueIdPrefix}-missing-type`,
            contentId: item.id,
            contentType,
            field: 'type',
            issue: 'Missing attraction type',
            severity: 'warning',
            autoFixable: false,
            currentValue: null
          });
        }

        if (!item.location) {
          foundIssues.push({
            id: `${issueIdPrefix}-missing-location`,
            contentId: item.id,
            contentType,
            field: 'location',
            issue: 'Missing location',
            severity: 'error',
            autoFixable: false,
            currentValue: null
          });
        }

        if (item.website && !isValidUrl(item.website)) {
          foundIssues.push({
            id: `${issueIdPrefix}-invalid-website`,
            contentId: item.id,
            contentType,
            field: 'website',
            issue: 'Invalid website URL',
            severity: 'warning',
            autoFixable: false,
            currentValue: item.website
          });
        }
      }

      if (contentType === 'playground') {
        if (!item.location) {
          foundIssues.push({
            id: `${issueIdPrefix}-missing-location`,
            contentId: item.id,
            contentType,
            field: 'location',
            issue: 'Missing location',
            severity: 'error',
            autoFixable: false,
            currentValue: null
          });
        }

        if (!item.amenities || item.amenities.length === 0) {
          foundIssues.push({
            id: `${issueIdPrefix}-missing-amenities`,
            contentId: item.id,
            contentType,
            field: 'amenities',
            issue: 'No amenities listed',
            severity: 'info',
            autoFixable: false,
            currentValue: null
          });
        }
      }
    });

    return foundIssues;
  }, [contentType, items]);

  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  const infos = issues.filter(i => i.severity === 'info').length;

  return {
    contentType,
    total: items.length,
    errors,
    warnings,
    infos,
    issues
  };
}

/**
 * Get aggregated quality summary across all content types
 */
export function useAggregatedDataQuality(data: {
  events?: any[];
  restaurants?: any[];
  attractions?: any[];
  playgrounds?: any[];
}): QualitySummary[] {
  const eventQuality = useDataQuality('event', data.events || []);
  const restaurantQuality = useDataQuality('restaurant', data.restaurants || []);
  const attractionQuality = useDataQuality('attraction', data.attractions || []);
  const playgroundQuality = useDataQuality('playground', data.playgrounds || []);

  return [eventQuality, restaurantQuality, attractionQuality, playgroundQuality];
}
