/**
 * Content Templates for Quick Creation
 *
 * Pre-configured templates to streamline content creation for common event
 * and article types with smart defaults and helpful guidance.
 */

export interface ContentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'event' | 'article';
  defaultValues: Record<string, any>;
  tips?: string[];
}

/**
 * Event Templates
 */
export const eventTemplates: ContentTemplate[] = [
  {
    id: 'concert-live-music',
    name: 'Concert / Live Music',
    description: 'Live music performances, concerts, and shows',
    icon: '🎵',
    category: 'event',
    defaultValues: {
      category: 'Music',
      price: '$15-30',
      is_featured: false,
      is_enhanced: false,
    },
    tips: [
      'Include the artist or band name in the title',
      'Specify the music genre in the description',
      'Add ticket purchase links to the source URL',
      'Mention if all ages or 21+',
    ],
  },
  {
    id: 'festival',
    name: 'Festival / Fair',
    description: 'Community festivals, fairs, and celebrations',
    icon: '🎪',
    category: 'event',
    defaultValues: {
      category: 'Entertainment',
      price: 'Free or varies',
      is_featured: true,
      is_enhanced: false,
    },
    tips: [
      'Include festival dates if multi-day event',
      'List main attractions or activities',
      'Mention parking and accessibility info',
      'Note if pet-friendly or family-friendly',
    ],
  },
  {
    id: 'sports-game',
    name: 'Sports Game / Match',
    description: 'Sporting events, games, and competitions',
    icon: '⚽',
    category: 'event',
    defaultValues: {
      category: 'Sports',
      price: '$10-50',
      is_featured: false,
      is_enhanced: false,
    },
    tips: [
      'Include both team names',
      'Add league or tournament info',
      'Specify seating options if available',
      'Mention pre-game or post-game activities',
    ],
  },
  {
    id: 'kids-family',
    name: 'Kids & Family Event',
    description: 'Family-friendly activities and children\'s events',
    icon: '👨‍👩‍👧‍👦',
    category: 'event',
    defaultValues: {
      category: 'Family',
      price: 'Free or low-cost',
      is_featured: false,
      is_enhanced: false,
    },
    tips: [
      'Specify age range (e.g., "Ages 5-12")',
      'Mention if strollers are allowed',
      'Include any special activities or entertainment',
      'Note if registration is required',
    ],
  },
  {
    id: 'food-dining',
    name: 'Food & Dining Event',
    description: 'Food festivals, tastings, and culinary experiences',
    icon: '🍽️',
    category: 'event',
    defaultValues: {
      category: 'Food',
      price: 'Varies',
      is_featured: false,
      is_enhanced: false,
    },
    tips: [
      'List featured restaurants or chefs',
      'Mention dietary options (vegan, gluten-free, etc.)',
      'Include drink options if applicable',
      'Specify if reservations are needed',
    ],
  },
  {
    id: 'art-culture',
    name: 'Art & Cultural Event',
    description: 'Art exhibitions, gallery openings, and cultural events',
    icon: '🎨',
    category: 'event',
    defaultValues: {
      category: 'Art',
      price: 'Free or by donation',
      is_featured: false,
      is_enhanced: false,
    },
    tips: [
      'Include artist names or exhibition title',
      'Mention opening reception details',
      'Specify gallery hours',
      'Note if guided tours are available',
    ],
  },
  {
    id: 'fitness-wellness',
    name: 'Fitness & Wellness',
    description: 'Yoga, fitness classes, runs, and wellness events',
    icon: '🧘',
    category: 'event',
    defaultValues: {
      category: 'General',
      price: 'Free or $5-20',
      is_featured: false,
      is_enhanced: false,
    },
    tips: [
      'Specify fitness level (beginner, intermediate, advanced)',
      'List what to bring (yoga mat, water, etc.)',
      'Mention instructor credentials',
      'Include registration deadline if applicable',
    ],
  },
  {
    id: 'nightlife',
    name: 'Nightlife Event',
    description: 'Bars, clubs, DJ nights, and evening entertainment',
    icon: '🌙',
    category: 'event',
    defaultValues: {
      category: 'Entertainment',
      price: '$5-15 cover',
      is_featured: false,
      is_enhanced: false,
    },
    tips: [
      'Specify dress code if applicable',
      'Mention age restrictions (18+, 21+)',
      'Include DJ or performer names',
      'Note drink specials or happy hour info',
    ],
  },
  {
    id: 'workshop-class',
    name: 'Workshop / Class',
    description: 'Educational workshops, classes, and learning events',
    icon: '📚',
    category: 'event',
    defaultValues: {
      category: 'General',
      price: '$15-50',
      is_featured: false,
      is_enhanced: false,
    },
    tips: [
      'List materials needed or provided',
      'Specify skill level required',
      'Include instructor bio or credentials',
      'Mention class size limit',
    ],
  },
  {
    id: 'community',
    name: 'Community Event',
    description: 'Community gatherings, fundraisers, and local meetups',
    icon: '🤝',
    category: 'event',
    defaultValues: {
      category: 'General',
      price: 'Free',
      is_featured: false,
      is_enhanced: false,
    },
    tips: [
      'Explain the event purpose or cause',
      'Mention volunteer opportunities',
      'Include contact info for questions',
      'Note if donations are accepted',
    ],
  },
];

/**
 * Article Templates
 */
export const articleTemplates: ContentTemplate[] = [
  {
    id: 'restaurant-review',
    name: 'Restaurant Review',
    description: 'In-depth restaurant reviews and dining guides',
    icon: '🍽️',
    category: 'article',
    defaultValues: {
      category: 'dining',
      status: 'draft',
      featured: false,
    },
    tips: [
      'Include menu highlights and signature dishes',
      'Describe the atmosphere and ambiance',
      'Mention price range and value',
      'Add details about service quality',
      'Include hours and reservation info',
      'Note parking and accessibility',
    ],
  },
  {
    id: 'event-guide',
    name: 'Event Guide',
    description: 'Comprehensive guides for upcoming events and festivals',
    icon: '📅',
    category: 'article',
    defaultValues: {
      category: 'events',
      status: 'draft',
      featured: false,
    },
    tips: [
      'Create a timeline of activities',
      'Include parking and transportation tips',
      'List must-see attractions or performances',
      'Add insider tips and recommendations',
      'Mention weather considerations',
      'Include map or venue layout if available',
    ],
  },
  {
    id: 'neighborhood-guide',
    name: 'Neighborhood Guide',
    description: 'Explore Des Moines neighborhoods and districts',
    icon: '🏘️',
    category: 'article',
    defaultValues: {
      category: 'explore',
      status: 'draft',
      featured: true,
    },
    tips: [
      'Highlight unique character and history',
      'Feature local businesses and restaurants',
      'Include cultural attractions and parks',
      'Mention best times to visit',
      'Add safety and parking information',
      'Include quotes from local residents',
    ],
  },
  {
    id: 'seasonal-guide',
    name: 'Seasonal Activities Guide',
    description: 'What to do this season in Des Moines',
    icon: '🍂',
    category: 'article',
    defaultValues: {
      category: 'seasonal',
      status: 'draft',
      featured: true,
    },
    tips: [
      'Group activities by category (outdoor, indoor, family, etc.)',
      'Include both free and paid options',
      'Add weather-appropriate suggestions',
      'Mention recurring seasonal events',
      'Include booking/reservation timelines',
      'Add photos representing the season',
    ],
  },
  {
    id: 'weekend-itinerary',
    name: 'Weekend Itinerary',
    description: 'Perfect weekend plans and day trips',
    icon: '🗓️',
    category: 'article',
    defaultValues: {
      category: 'guides',
      status: 'draft',
      featured: true,
    },
    tips: [
      'Create hour-by-hour schedule',
      'Include breakfast, lunch, dinner options',
      'Add driving/walking times between locations',
      'Suggest alternative options for bad weather',
      'Include estimated total costs',
      'Add booking links for reservations',
    ],
  },
  {
    id: 'top-10-list',
    name: 'Top 10 List',
    description: 'Curated lists of best places and experiences',
    icon: '🔟',
    category: 'article',
    defaultValues: {
      category: 'lists',
      status: 'draft',
      featured: true,
    },
    tips: [
      'Use engaging, specific titles (e.g., "10 Hidden Gems")',
      'Include variety in your selections',
      'Add brief description for each item (2-3 sentences)',
      'Include photos for each entry',
      'Mention price range and location',
      'Add personal recommendations or quotes',
    ],
  },
  {
    id: 'new-opening',
    name: 'New Opening Announcement',
    description: 'Coverage of new restaurants, venues, or attractions',
    icon: '✨',
    category: 'article',
    defaultValues: {
      category: 'news',
      status: 'draft',
      featured: true,
    },
    tips: [
      'Include opening date and soft opening details',
      'Feature owner/chef background',
      'Describe concept and unique offerings',
      'Add photos of interior/exterior',
      'Mention hours and location',
      'Include contact and social media',
    ],
  },
  {
    id: 'behind-scenes',
    name: 'Behind the Scenes',
    description: 'In-depth stories about local businesses and people',
    icon: '🎬',
    category: 'article',
    defaultValues: {
      category: 'features',
      status: 'draft',
      featured: true,
    },
    tips: [
      'Include interview quotes from key people',
      'Tell the story behind the business',
      'Add historical context if relevant',
      'Include candid photos',
      'Highlight challenges overcome',
      'End with future plans or vision',
    ],
  },
];

/**
 * Get all templates
 */
export const getAllTemplates = (): ContentTemplate[] => {
  return [...eventTemplates, ...articleTemplates];
};

/**
 * Get templates by category
 */
export const getTemplatesByCategory = (category: 'event' | 'article'): ContentTemplate[] => {
  return category === 'event' ? eventTemplates : articleTemplates;
};

/**
 * Get template by ID
 */
export const getTemplateById = (id: string): ContentTemplate | undefined => {
  return getAllTemplates().find(template => template.id === id);
};
