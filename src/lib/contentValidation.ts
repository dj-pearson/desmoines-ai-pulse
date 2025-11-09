/**
 * Content Validation Utilities
 * Validates content submissions and calculates confidence scores
 */

export interface ValidationResult {
  field: string;
  isValid: boolean;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestedValue?: any;
  autoFixable?: boolean;
}

export interface ContentValidationReport {
  isValid: boolean;
  confidenceScore: number;
  results: ValidationResult[];
  criticalErrors: number;
  warnings: number;
  autoApprovalRecommended: boolean;
}

/**
 * Validates a URL format
 */
export function isValidUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates phone number format
 */
export function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 11;
}

/**
 * Formats phone number to standard format
 */
export function formatPhone(phone: string): string {
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
 * Validates email format
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Checks if date is valid and not too far in past
 */
export function isValidEventDate(date: string | Date | null | undefined): boolean {
  if (!date) return false;
  try {
    const dateObj = new Date(date);
    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    // Valid if date is within last year or in future
    return dateObj > oneYearAgo && dateObj < new Date(now.getFullYear() + 2, 11, 31);
  } catch {
    return false;
  }
}

/**
 * Validates image URL (checks format and common extensions)
 */
export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (!isValidUrl(url)) return false;

  // Check for common image extensions or known image hosting domains
  const lowerUrl = url.toLowerCase();
  const hasImageExtension = /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(lowerUrl);
  const isKnownImageHost = lowerUrl.includes('cloudinary') ||
                          lowerUrl.includes('imgur') ||
                          lowerUrl.includes('unsplash') ||
                          lowerUrl.includes('pexels');

  return hasImageExtension || isKnownImageHost;
}

/**
 * Validates event content
 */
export function validateEvent(event: any): ContentValidationReport {
  const results: ValidationResult[] = [];
  let confidenceScore = 100;

  // Required fields
  if (!event.title || event.title.trim().length === 0) {
    results.push({
      field: 'title',
      isValid: false,
      severity: 'error',
      message: 'Title is required',
      autoFixable: false
    });
    confidenceScore -= 25;
  } else if (event.title.length < 5) {
    results.push({
      field: 'title',
      isValid: false,
      severity: 'warning',
      message: 'Title is too short (minimum 5 characters)',
      autoFixable: false
    });
    confidenceScore -= 10;
  }

  if (!event.venue) {
    results.push({
      field: 'venue',
      isValid: false,
      severity: 'error',
      message: 'Venue is required',
      autoFixable: false
    });
    confidenceScore -= 20;
  }

  if (!event.date) {
    results.push({
      field: 'date',
      isValid: false,
      severity: 'error',
      message: 'Date is required',
      autoFixable: false
    });
    confidenceScore -= 25;
  } else if (!isValidEventDate(event.date)) {
    results.push({
      field: 'date',
      isValid: false,
      severity: 'warning',
      message: 'Date seems invalid or too far in the past',
      autoFixable: false
    });
    confidenceScore -= 15;
  }

  if (!event.location) {
    results.push({
      field: 'location',
      isValid: false,
      severity: 'warning',
      message: 'Location is recommended',
      autoFixable: false
    });
    confidenceScore -= 10;
  }

  // Optional but recommended fields
  if (!event.category || event.category === 'Uncategorized') {
    results.push({
      field: 'category',
      isValid: false,
      severity: 'warning',
      message: 'Category should be specified',
      autoFixable: false
    });
    confidenceScore -= 5;
  }

  if (!event.image_url) {
    results.push({
      field: 'image_url',
      isValid: false,
      severity: 'info',
      message: 'Image URL is recommended for better engagement',
      autoFixable: false
    });
    confidenceScore -= 5;
  } else if (!isValidImageUrl(event.image_url)) {
    results.push({
      field: 'image_url',
      isValid: false,
      severity: 'warning',
      message: 'Image URL format appears invalid',
      autoFixable: false
    });
    confidenceScore -= 10;
  }

  if (event.source_url && !isValidUrl(event.source_url)) {
    results.push({
      field: 'source_url',
      isValid: false,
      severity: 'warning',
      message: 'Source URL format is invalid',
      autoFixable: false
    });
    confidenceScore -= 5;
  }

  if (!event.original_description && !event.enhanced_description) {
    results.push({
      field: 'description',
      isValid: false,
      severity: 'info',
      message: 'Description is recommended',
      autoFixable: false
    });
    confidenceScore -= 5;
  }

  // Check for duplicate indicator (if title is too generic)
  const genericWords = ['event', 'show', 'performance', 'concert'];
  if (event.title && genericWords.some(word =>
    event.title.toLowerCase().trim() === word
  )) {
    results.push({
      field: 'title',
      isValid: false,
      severity: 'warning',
      message: 'Title appears too generic, may be a duplicate',
      autoFixable: false
    });
    confidenceScore -= 10;
  }

  // Ensure confidence is in valid range
  confidenceScore = Math.max(0, Math.min(100, confidenceScore));

  const criticalErrors = results.filter(r => r.severity === 'error').length;
  const warnings = results.filter(r => r.severity === 'warning').length;

  return {
    isValid: criticalErrors === 0,
    confidenceScore,
    results,
    criticalErrors,
    warnings,
    autoApprovalRecommended: confidenceScore >= 90 && criticalErrors === 0
  };
}

/**
 * Validates restaurant content
 */
export function validateRestaurant(restaurant: any): ContentValidationReport {
  const results: ValidationResult[] = [];
  let confidenceScore = 100;

  // Required fields
  if (!restaurant.name || restaurant.name.trim().length === 0) {
    results.push({
      field: 'name',
      isValid: false,
      severity: 'error',
      message: 'Name is required',
      autoFixable: false
    });
    confidenceScore -= 25;
  }

  if (!restaurant.location) {
    results.push({
      field: 'location',
      isValid: false,
      severity: 'error',
      message: 'Location is required',
      autoFixable: false
    });
    confidenceScore -= 20;
  }

  // Recommended fields
  if (!restaurant.cuisine) {
    results.push({
      field: 'cuisine',
      isValid: false,
      severity: 'warning',
      message: 'Cuisine type is recommended',
      autoFixable: false
    });
    confidenceScore -= 10;
  }

  if (restaurant.phone && !isValidPhone(restaurant.phone)) {
    results.push({
      field: 'phone',
      isValid: false,
      severity: 'error',
      message: 'Phone number format is invalid',
      suggestedValue: formatPhone(restaurant.phone),
      autoFixable: true
    });
    confidenceScore -= 15;
  }

  if (restaurant.website && !isValidUrl(restaurant.website)) {
    results.push({
      field: 'website',
      isValid: false,
      severity: 'warning',
      message: 'Website URL format is invalid',
      autoFixable: false
    });
    confidenceScore -= 10;
  }

  if (!restaurant.description) {
    results.push({
      field: 'description',
      isValid: false,
      severity: 'info',
      message: 'Description is recommended',
      autoFixable: false
    });
    confidenceScore -= 5;
  }

  if (!restaurant.image_url) {
    results.push({
      field: 'image_url',
      isValid: false,
      severity: 'info',
      message: 'Image is recommended',
      autoFixable: false
    });
    confidenceScore -= 5;
  }

  confidenceScore = Math.max(0, Math.min(100, confidenceScore));

  const criticalErrors = results.filter(r => r.severity === 'error').length;
  const warnings = results.filter(r => r.severity === 'warning').length;

  return {
    isValid: criticalErrors === 0,
    confidenceScore,
    results,
    criticalErrors,
    warnings,
    autoApprovalRecommended: confidenceScore >= 90 && criticalErrors === 0
  };
}

/**
 * Validates attraction content
 */
export function validateAttraction(attraction: any): ContentValidationReport {
  const results: ValidationResult[] = [];
  let confidenceScore = 100;

  if (!attraction.name || attraction.name.trim().length === 0) {
    results.push({
      field: 'name',
      isValid: false,
      severity: 'error',
      message: 'Name is required',
      autoFixable: false
    });
    confidenceScore -= 25;
  }

  if (!attraction.type) {
    results.push({
      field: 'type',
      isValid: false,
      severity: 'warning',
      message: 'Attraction type is recommended',
      autoFixable: false
    });
    confidenceScore -= 15;
  }

  if (!attraction.location) {
    results.push({
      field: 'location',
      isValid: false,
      severity: 'error',
      message: 'Location is required',
      autoFixable: false
    });
    confidenceScore -= 20;
  }

  if (attraction.website && !isValidUrl(attraction.website)) {
    results.push({
      field: 'website',
      isValid: false,
      severity: 'warning',
      message: 'Website URL format is invalid',
      autoFixable: false
    });
    confidenceScore -= 10;
  }

  confidenceScore = Math.max(0, Math.min(100, confidenceScore));

  const criticalErrors = results.filter(r => r.severity === 'error').length;
  const warnings = results.filter(r => r.severity === 'warning').length;

  return {
    isValid: criticalErrors === 0,
    confidenceScore,
    results,
    criticalErrors,
    warnings,
    autoApprovalRecommended: confidenceScore >= 90 && criticalErrors === 0
  };
}

/**
 * Validates playground content
 */
export function validatePlayground(playground: any): ContentValidationReport {
  const results: ValidationResult[] = [];
  let confidenceScore = 100;

  if (!playground.name || playground.name.trim().length === 0) {
    results.push({
      field: 'name',
      isValid: false,
      severity: 'error',
      message: 'Name is required',
      autoFixable: false
    });
    confidenceScore -= 25;
  }

  if (!playground.location) {
    results.push({
      field: 'location',
      isValid: false,
      severity: 'error',
      message: 'Location is required',
      autoFixable: false
    });
    confidenceScore -= 20;
  }

  if (!playground.amenities || playground.amenities.length === 0) {
    results.push({
      field: 'amenities',
      isValid: false,
      severity: 'info',
      message: 'Amenities list is recommended',
      autoFixable: false
    });
    confidenceScore -= 10;
  }

  confidenceScore = Math.max(0, Math.min(100, confidenceScore));

  const criticalErrors = results.filter(r => r.severity === 'error').length;
  const warnings = results.filter(r => r.severity === 'warning').length;

  return {
    isValid: criticalErrors === 0,
    confidenceScore,
    results,
    criticalErrors,
    warnings,
    autoApprovalRecommended: confidenceScore >= 90 && criticalErrors === 0
  };
}

/**
 * Main validation function - routes to appropriate validator
 */
export function validateContent(
  contentType: 'event' | 'restaurant' | 'attraction' | 'playground',
  content: any
): ContentValidationReport {
  switch (contentType) {
    case 'event':
      return validateEvent(content);
    case 'restaurant':
      return validateRestaurant(content);
    case 'attraction':
      return validateAttraction(content);
    case 'playground':
      return validatePlayground(content);
    default:
      return {
        isValid: false,
        confidenceScore: 0,
        results: [{
          field: 'content_type',
          isValid: false,
          severity: 'error',
          message: 'Unknown content type',
          autoFixable: false
        }],
        criticalErrors: 1,
        warnings: 0,
        autoApprovalRecommended: false
      };
  }
}

/**
 * Auto-fixes content based on validation results
 */
export function autoFixContent(content: any, validationResults: ValidationResult[]): any {
  const fixed = { ...content };

  validationResults.forEach(result => {
    if (result.autoFixable && result.suggestedValue !== undefined) {
      fixed[result.field] = result.suggestedValue;
    }
  });

  return fixed;
}
