import { format, parseISO } from "date-fns";
import { BRAND } from "./brandConfig";

export interface SEOData {
  title: string;
  description: string;
  keywords: string[];
  openGraph: {
    title: string;
    description: string;
    image?: string;
    type: 'article' | 'website' | 'place' | 'event';
    url: string;
  };
  structuredData: object;
  canonical: string;
  geoOptimization: {
    h1: string;
    summary: string;
    keyFacts: string[];
    locationContext: string;
    faqSection?: Array<{
      question: string;
      answer: string;
    }>;
  };
}

export interface EventSEOInput {
  id: string;
  title: string;
  description?: string;
  venue?: string;
  location: string;
  date: string;
  price?: string;
  category: string;
  image_url?: string;
  ai_writeup?: string;
}

export interface RestaurantSEOInput {
  id: string;
  name: string;
  description?: string;
  cuisine: string;
  location: string;
  price_range?: string;
  rating?: number;
  phone?: string;
  website?: string;
  image_url?: string;
  ai_writeup?: string;
  opening_date?: string;
  status?: string;
}

export class SEOGenerator {
  private static readonly BASE_URL = BRAND.baseUrl;
  private static readonly SITE_NAME = BRAND.name;
  private static readonly CITY = BRAND.city;
  private static readonly STATE = BRAND.state;
  private static readonly REGION = BRAND.region;

  static generateEventSEO(event: EventSEOInput): SEOData {
    const eventDate = event.date ? format(parseISO(event.date), 'MMMM d, yyyy') : '';
    const eventDateTime = event.date ? parseISO(event.date).toISOString() : '';
    
    // Primary keyword strategy: Event name + location + date
    const primaryKeyword = `${event.title} ${this.CITY}`;
    const locationKeyword = `${event.venue || 'events'} ${this.CITY}`;
    
    const title = `${event.title} - ${eventDate} | ${event.venue || this.CITY} Events`;
    const description = event.ai_writeup 
      ? this.extractSummary(event.ai_writeup, 155)
      : `Join ${event.title} on ${eventDate} at ${event.venue || event.location} in ${this.CITY}. ${event.description || 'Discover local events and activities in Des Moines, Iowa.'} Get tickets and event details.`;

    const keywords = [
      primaryKeyword,
      locationKeyword,
      `${event.category} events ${this.CITY}`,
      `${this.CITY} ${event.category}`,
      `events in ${this.CITY}`,
      `${this.CITY} events ${eventDate}`,
      `things to do ${this.CITY}`,
      event.venue ? `${event.venue} events` : `${this.CITY} venues`,
      `${this.STATE} events`,
      `${this.REGION} events`
    ].filter(Boolean);

    const canonical = `${this.BASE_URL}/events/${event.id}`;
    
    // GEO-optimized content for AI engines
    const h1 = `${event.title} in ${this.CITY} - ${eventDate}`;
    const summary = event.ai_writeup 
      ? this.extractSummary(event.ai_writeup, 300)
      : `${event.title} is a ${event.category.toLowerCase()} event taking place on ${eventDate} at ${event.venue || event.location} in ${this.CITY}, Iowa. ${event.description || 'This local Des Moines event offers entertainment and community engagement for residents and visitors.'}`;

    const keyFacts = [
      `Event: ${event.title}`,
      `Date: ${eventDate}`,
      `Location: ${event.venue || event.location}`,
      `City: ${this.CITY}, ${this.STATE}`,
      `Category: ${event.category}`,
      event.price ? `Price: ${event.price}` : 'Pricing: See event details'
    ].filter(Boolean);

    const locationContext = `Located in ${this.CITY}, ${this.STATE}, in the heart of the ${this.REGION}. ${event.venue ? `${event.venue} is a popular venue for ${event.category.toLowerCase()} events` : 'This event location'} serves the Des Moines metro area including West Des Moines, Ankeny, Urbandale, and surrounding communities.`;

    // FAQ for better AI engine optimization
    const faqSection = [
      {
        question: `When is ${event.title}?`,
        answer: `${event.title} takes place on ${eventDate}.`
      },
      {
        question: `Where is ${event.title} located?`,
        answer: `This event is held at ${event.venue || event.location} in ${this.CITY}, Iowa.`
      },
      {
        question: `What type of event is ${event.title}?`,
        answer: `${event.title} is a ${event.category.toLowerCase()} event in ${this.CITY}.`
      },
      event.price ? {
        question: `How much does ${event.title} cost?`,
        answer: `Tickets for ${event.title} are ${event.price}.`
      } : null
    ].filter(Boolean) as Array<{question: string; answer: string}>;

    // Structured Data (JSON-LD) for search engines and AI
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: event.title,
      description: description,
      startDate: eventDateTime,
      location: {
        '@type': 'Place',
        name: event.venue || event.location,
        address: {
          '@type': 'PostalAddress',
          addressLocality: this.CITY,
          addressRegion: this.STATE,
          addressCountry: 'US'
        }
      },
      organizer: {
        '@type': 'Organization',
        name: this.SITE_NAME,
        url: this.BASE_URL
      },
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      offers: event.price ? {
        '@type': 'Offer',
        price: event.price,
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock'
      } : undefined,
      image: event.image_url || `${this.BASE_URL}/DMI-Logo.png`
    };

    return {
      title: title.length > 60 ? `${event.title} - ${eventDate} | ${this.CITY}` : title,
      description,
      keywords,
      openGraph: {
        title: `${event.title} - ${eventDate}`,
        description,
        image: event.image_url || `${this.BASE_URL}/DMI-Logo.png`,
        type: 'event',
        url: canonical
      },
      structuredData,
      canonical,
      geoOptimization: {
        h1,
        summary,
        keyFacts,
        locationContext,
        faqSection
      }
    };
  }

  static generateRestaurantSEO(restaurant: RestaurantSEOInput): SEOData {
    // Primary keyword strategy: Restaurant name + location + cuisine
    const primaryKeyword = `${restaurant.name} ${this.CITY}`;
    const cuisineKeyword = `${restaurant.cuisine} restaurant ${this.CITY}`;
    
    const title = `${restaurant.name} - ${restaurant.cuisine} Restaurant in ${this.CITY} | Des Moines Dining`;
    const description = restaurant.ai_writeup 
      ? this.extractSummary(restaurant.ai_writeup, 155)
      : `${restaurant.name} offers ${restaurant.cuisine.toLowerCase()} cuisine in ${this.CITY}, Iowa. ${restaurant.description || 'Experience exceptional dining in Des Moines.'} ${restaurant.price_range ? `Price range: ${restaurant.price_range}.` : ''} View menu, hours, and reviews.`;

    const keywords = [
      primaryKeyword,
      cuisineKeyword,
      `${restaurant.cuisine} ${this.CITY}`,
      `restaurants ${this.CITY}`,
      `dining ${this.CITY}`,
      `${this.CITY} restaurants`,
      `best ${restaurant.cuisine.toLowerCase()} ${this.CITY}`,
      restaurant.price_range ? `${restaurant.price_range} restaurants ${this.CITY}` : null,
      `${this.CITY} dining guide`,
      `${this.STATE} restaurants`,
      `${this.REGION} dining`
    ].filter(Boolean) as string[];

    const canonical = `${this.BASE_URL}/restaurants/${restaurant.id}`;
    
    // GEO-optimized content for AI engines
    const statusText = restaurant.status === 'open' ? 'now open' : 
                      restaurant.status === 'opening_soon' ? 'opening soon' :
                      restaurant.status === 'newly_opened' ? 'recently opened' : '';
    
    const h1 = `${restaurant.name} - ${restaurant.cuisine} Restaurant in ${this.CITY}`;
    const summary = restaurant.ai_writeup 
      ? this.extractSummary(restaurant.ai_writeup, 300)
      : `${restaurant.name} is a ${restaurant.cuisine.toLowerCase()} restaurant ${statusText} in ${this.CITY}, Iowa. Located at ${restaurant.location}, this dining establishment ${restaurant.description || 'offers quality cuisine and service to the Des Moines community'}. ${restaurant.price_range ? `Price range: ${restaurant.price_range}.` : ''}`;

    const keyFacts = [
      `Restaurant: ${restaurant.name}`,
      `Cuisine: ${restaurant.cuisine}`,
      `Location: ${restaurant.location}`,
      `City: ${this.CITY}, ${this.STATE}`,
      restaurant.price_range ? `Price Range: ${restaurant.price_range}` : null,
      restaurant.rating ? `Rating: ${restaurant.rating}/5 stars` : null,
      restaurant.phone ? `Phone: ${restaurant.phone}` : null,
      restaurant.status ? `Status: ${statusText}` : null,
      restaurant.opening_date ? `Opening Date: ${format(parseISO(restaurant.opening_date), 'MMMM d, yyyy')}` : null
    ].filter(Boolean) as string[];

    const locationContext = `Located in ${this.CITY}, ${this.STATE}, serving the ${this.REGION}. This ${restaurant.cuisine.toLowerCase()} restaurant is part of Des Moines' diverse dining scene, serving residents and visitors in the metro area including West Des Moines, Ankeny, Urbandale, and surrounding communities.`;

    // FAQ for better AI engine optimization
    const faqSection = [
      {
        question: `What type of cuisine does ${restaurant.name} serve?`,
        answer: `${restaurant.name} specializes in ${restaurant.cuisine.toLowerCase()} cuisine.`
      },
      {
        question: `Where is ${restaurant.name} located?`,
        answer: `${restaurant.name} is located at ${restaurant.location} in ${this.CITY}, Iowa.`
      },
      restaurant.price_range ? {
        question: `What is the price range at ${restaurant.name}?`,
        answer: `${restaurant.name} is in the ${restaurant.price_range} price range.`
      } : null,
      restaurant.phone ? {
        question: `What is the phone number for ${restaurant.name}?`,
        answer: `You can reach ${restaurant.name} at ${restaurant.phone}.`
      } : null,
      {
        question: `Is ${restaurant.name} currently open?`,
        answer: restaurant.status === 'open' ? `Yes, ${restaurant.name} is currently open for business.` :
                restaurant.status === 'opening_soon' ? `${restaurant.name} is opening soon in ${this.CITY}.` :
                restaurant.status === 'newly_opened' ? `${restaurant.name} recently opened in ${this.CITY}.` :
                `Please check current status for ${restaurant.name}.`
      }
    ].filter(Boolean) as Array<{question: string; answer: string}>;

    // Structured Data (JSON-LD)
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: restaurant.name,
      description: description,
      servesCuisine: restaurant.cuisine,
      address: {
        '@type': 'PostalAddress',
        streetAddress: restaurant.location,
        addressLocality: this.CITY,
        addressRegion: this.STATE,
        addressCountry: 'US'
      },
      telephone: restaurant.phone || undefined,
      url: restaurant.website || canonical,
      image: restaurant.image_url || `${this.BASE_URL}/DMI-Logo.png`,
      priceRange: restaurant.price_range || undefined,
      aggregateRating: restaurant.rating ? {
        '@type': 'AggregateRating',
        ratingValue: restaurant.rating,
        bestRating: 5
      } : undefined
    };

    return {
      title: title.length > 60 ? `${restaurant.name} - ${restaurant.cuisine} in ${this.CITY}` : title,
      description,
      keywords,
      openGraph: {
        title: `${restaurant.name} - ${restaurant.cuisine} Restaurant`,
        description,
        image: restaurant.image_url || `${this.BASE_URL}/DMI-Logo.png`,
        type: 'place',
        url: canonical
      },
      structuredData,
      canonical,
      geoOptimization: {
        h1,
        summary,
        keyFacts,
        locationContext,
        faqSection
      }
    };
  }

  private static extractSummary(text: string, maxLength: number): string {
    if (!text) return '';
    
    // Remove HTML tags and extra whitespace
    const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    if (cleanText.length <= maxLength) return cleanText;
    
    // Find the last complete sentence within the limit
    const truncated = cleanText.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastExclamation = truncated.lastIndexOf('!');
    const lastQuestion = truncated.lastIndexOf('?');
    
    const lastSentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion);
    
    if (lastSentenceEnd > maxLength * 0.7) {
      return truncated.substring(0, lastSentenceEnd + 1);
    }
    
    // If no good sentence break, truncate at word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    return truncated.substring(0, lastSpace) + '...';
  }

  static generateBulkSEOPrompt(type: 'event' | 'restaurant', items: any[]): string {
    const itemType = type === 'event' ? 'events' : 'restaurants';
    
    return `Generate comprehensive SEO metadata for ${items.length} ${itemType} in Des Moines, Iowa. For each item, create:

1. SEO-optimized title (under 60 chars)
2. Meta description (150-155 chars) with local keywords
3. H1 tag that matches primary search intent
4. 5-7 relevant keywords including local terms
5. Summary for AI engines (2-3 sentences)
6. 3-5 key facts in bullet format
7. FAQ section (3-4 questions) optimized for voice search

Focus on:
- Local SEO for Des Moines/Iowa
- GEO optimization for AI search engines
- Natural language that AI can easily parse and cite
- Location-specific information
- User intent matching

Items to process:
${JSON.stringify(items.map(item => ({
  id: item.id,
  name: item.name || item.title,
  description: item.description || item.original_description,
  location: item.location,
  ...(type === 'event' ? {
    date: item.date,
    venue: item.venue,
    category: item.category
  } : {
    cuisine: item.cuisine,
    price_range: item.price_range,
    status: item.status
  })
})), null, 2)}`;
  }
}