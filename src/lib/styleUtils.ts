/**
 * Des Moines Insider - Enhanced Style Utilities
 * Consistent styling patterns for maximum visual appeal and SEO optimization
 */

export const themeColors = {
  primary: {
    gradient: "from-amber-600 via-orange-500 to-red-500",
    gradientSubtle: "from-amber-50 to-orange-100",
    text: "text-amber-600",
    bg: "bg-amber-600",
    hover: "hover:bg-amber-700",
    border: "border-amber-200"
  },
  secondary: {
    gradient: "from-blue-600 via-purple-500 to-pink-500",
    gradientSubtle: "from-blue-50 to-purple-100",
    text: "text-blue-600",
    bg: "bg-blue-600",
    hover: "hover:bg-blue-700",
    border: "border-blue-200"
  },
  success: {
    gradient: "from-green-600 via-emerald-500 to-teal-500",
    gradientSubtle: "from-green-50 to-emerald-100",
    text: "text-green-600",
    bg: "bg-green-600",
    hover: "hover:bg-green-700",
    border: "border-green-200"
  }
};

export const cardStyles = {
  // Premium card with subtle backdrop blur and shadows
  premium: "bg-white/95 backdrop-blur-sm shadow-2xl rounded-3xl overflow-hidden border-0",
  
  // Standard card with modern styling
  standard: "bg-white shadow-lg rounded-2xl overflow-hidden border border-gray-100",
  
  // Minimal card for content sections
  minimal: "bg-white/80 backdrop-blur-sm rounded-xl border border-gray-100",
  
  // Interactive card with hover effects
  interactive: "bg-white shadow-lg rounded-2xl overflow-hidden border border-gray-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
};

export const heroSections = {
  // Restaurant hero with warm gradient
  restaurant: {
    container: "relative h-80 bg-gradient-to-r from-amber-600 via-orange-500 to-red-500 overflow-hidden",
    overlay: "absolute inset-0 bg-black/20",
    content: "absolute inset-0 flex items-center justify-center",
    title: "text-5xl font-bold mb-2 tracking-tight text-white"
  },
  
  // Event hero with dynamic gradient
  event: {
    container: "relative h-80 bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 overflow-hidden",
    overlay: "absolute inset-0 bg-black/20",
    content: "absolute inset-0 flex items-center justify-center",
    title: "text-5xl font-bold mb-2 tracking-tight text-white"
  },
  
  // Attraction hero with natural gradient
  attraction: {
    container: "relative h-80 bg-gradient-to-r from-green-600 via-emerald-500 to-teal-500 overflow-hidden",
    overlay: "absolute inset-0 bg-black/20",
    content: "absolute inset-0 flex items-center justify-center",
    title: "text-5xl font-bold mb-2 tracking-tight text-white"
  }
};

export const statsCards = {
  // Colorful stats card with icon
  colorful: (color: keyof typeof themeColors) => 
    `bg-gradient-to-br ${themeColors[color].gradientSubtle} border ${themeColors[color].border} rounded-xl p-6 text-center`,
  
  // Clean stats card
  clean: "bg-white border border-gray-200 rounded-xl p-6 text-center shadow-sm"
};

export const buttonStyles = {
  // Primary action button
  primary: `bg-gradient-to-r ${themeColors.primary.gradient} text-white px-6 py-3 rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5`,
  
  // Secondary button
  secondary: "bg-white/80 backdrop-blur-sm border border-gray-200 hover:bg-gray-50 px-6 py-3 rounded-lg font-medium transition-all duration-300",
  
  // Outline button
  outline: "border-2 border-current bg-transparent hover:bg-current hover:text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
};

export const textStyles = {
  // Hero text
  hero: "text-4xl md:text-5xl lg:text-6xl font-bold leading-tight",
  
  // Section title
  sectionTitle: "text-2xl md:text-3xl font-bold mb-6",
  
  // Card title
  cardTitle: "text-xl font-semibold mb-2",
  
  // Description
  description: "text-gray-600 leading-relaxed",
  
  // Caption
  caption: "text-sm text-gray-500"
};

export const layoutUtils = {
  // Container with max width and centering
  container: "container mx-auto px-4 max-w-6xl",
  
  // Mobile-first padding
  mobilePadding: "px-4 md:px-6 lg:px-8",
  
  // Section spacing
  sectionSpacing: "py-8 md:py-12 lg:py-16",
  
  // Grid layouts
  gridResponsive: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
  gridFeatured: "grid grid-cols-1 lg:grid-cols-2 gap-8"
};

export const animationUtils = {
  // Fade in animation
  fadeIn: "animate-in fade-in duration-700",
  
  // Slide up animation
  slideUp: "animate-in slide-in-from-bottom-4 duration-700",
  
  // Scale animation
  scale: "animate-in zoom-in-95 duration-500",
  
  // Hover effects
  hoverLift: "transition-transform duration-300 hover:-translate-y-1",
  hoverScale: "transition-transform duration-300 hover:scale-105"
};

// Utility function to generate consistent card component
export const createDetailCard = (type: 'restaurant' | 'event' | 'attraction') => {
  const hero = heroSections[type];
  
  return {
    container: cardStyles.premium,
    hero: hero.container,
    heroOverlay: hero.overlay,
    heroContent: hero.content,
    heroTitle: hero.title,
    statsGrid: "grid grid-cols-2 md:grid-cols-4 gap-4 mb-8",
    statsCard: statsCards.colorful('primary'),
    contentSection: "p-8 space-y-6"
  };
};

// SEO-optimized image utility
export const createSEOImage = (src: string, alt: string, title: string) => ({
  src,
  alt,
  title,
  loading: "lazy" as const,
  className: "w-full h-full object-cover",
  // Add structured data attributes
  itemProp: "image"
});

// Accessibility utilities
export const a11yUtils = {
  skipLink: "sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-primary text-white px-4 py-2 rounded-lg z-50",
  visuallyHidden: "sr-only",
  focusRing: "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
  highContrast: "text-gray-900 dark:text-gray-100"
};

export default {
  themeColors,
  cardStyles,
  heroSections,
  statsCards,
  buttonStyles,
  textStyles,
  layoutUtils,
  animationUtils,
  createDetailCard,
  createSEOImage,
  a11yUtils
};
