import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Globe, 
  FileText, 
  Bot, 
  Search, 
  Share2, 
  Rss, 
  Copy, 
  Download, 
  CheckCircle,
  ExternalLink,
  MapPin,
  Calendar,
  Utensils,
  Camera,
  Play
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEvents } from "@/hooks/useEvents";
import { useRestaurants } from "@/hooks/useRestaurants";
import { useAttractions } from "@/hooks/useAttractions";
import { usePlaygrounds } from "@/hooks/usePlaygrounds";
import { supabase } from "@/integrations/supabase/client";

interface SEOGenerator {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: "crawlers" | "meta" | "content";
  generated?: string;
}

export default function SEOTools() {
  const { toast } = useToast();
  const [generatedContent, setGeneratedContent] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState<Record<string, boolean>>({});
  
  // Data hooks
  const { events } = useEvents({ limit: 1000 });
  const { restaurants } = useRestaurants();
  const { attractions } = useAttractions();
  const { playgrounds } = usePlaygrounds();

  const generators: SEOGenerator[] = [
    {
      id: "sitemap",
      title: "Sitemap.xml",
      description: "Generate comprehensive sitemap with all pages for search engines",
      icon: <Search className="h-5 w-5" />,
      category: "crawlers"
    },
    {
      id: "robots",
      title: "Robots.txt",
      description: "Control crawler access and specify sitemap location",
      icon: <Bot className="h-5 w-5" />,
      category: "crawlers"
    },
    {
      id: "llms",
      title: "LLMs.txt",
      description: "Instructions for AI crawlers (Perplexity, OpenAI, etc.)",
      icon: <Bot className="h-5 w-5" />,
      category: "crawlers"
    },
    {
      id: "schema",
      title: "Schema.org Markup",
      description: "Structured data for events, restaurants, and attractions",
      icon: <FileText className="h-5 w-5" />,
      category: "meta"
    },
    {
      id: "opengraph",
      title: "Open Graph Tags",
      description: "Social media sharing optimization",
      icon: <Share2 className="h-5 w-5" />,
      category: "meta"
    },
    {
      id: "rss",
      title: "RSS Feed",
      description: "XML feed for events and content updates",
      icon: <Rss className="h-5 w-5" />,
      category: "content"
    }
  ];

  const createSlug = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  };

  const generateSitemap = () => {
    const baseUrl = "https://desmoinesinsider.com";
    const currentDate = new Date().toISOString().split('T')[0];
    
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/events</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/restaurants</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/auth</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`;

    // Add dynamic event pages
    events.forEach(event => {
      const eventDate = event.date ? new Date(event.date).toISOString().split('T')[0] : currentDate;
      // Events don't have slug field yet, use generated slug
      const slug = createSlug(event.title);
      sitemap += `
  <url>
    <loc>${baseUrl}/events/${slug}</loc>
    <lastmod>${eventDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
    });

    // Add restaurant pages
    restaurants.forEach(restaurant => {
      // Use database slug if available, fallback to generated slug for backward compatibility
      const slug = restaurant.slug || createSlug(restaurant.name);
      const lastmod = restaurant.updated_at 
        ? new Date(restaurant.updated_at).toISOString().split('T')[0] 
        : currentDate;
      const priority = restaurant.is_featured ? 0.8 : 0.6;
      
      sitemap += `
  <url>
    <loc>${baseUrl}/restaurants/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
  </url>`;
    });

    // Add attraction pages
    attractions.forEach(attraction => {
      // Attractions don't have slug field yet, use generated slug
      const slug = createSlug(attraction.name);
      const lastmod = attraction.updated_at 
        ? new Date(attraction.updated_at).toISOString().split('T')[0] 
        : currentDate;
      const priority = attraction.is_featured ? 0.7 : 0.6;
      
      sitemap += `
  <url>
    <loc>${baseUrl}/attractions/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
  </url>`;
    });

    // Add playground pages
    playgrounds.forEach(playground => {
      // Playgrounds don't have slug field yet, use generated slug
      const slug = createSlug(playground.name);
      const lastmod = playground.updated_at 
        ? new Date(playground.updated_at).toISOString().split('T')[0] 
        : currentDate;
      const priority = playground.is_featured ? 0.7 : 0.6;
      
      sitemap += `
  <url>
    <loc>${baseUrl}/playgrounds/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
  </url>`;
    });

    sitemap += "\n</urlset>";
    return sitemap;
  };

  const generateRobots = () => {
    return `# Des Moines Insider - Robots.txt
# Optimized for both traditional crawlers and AI crawlers

User-agent: *
Allow: /
Disallow: /admin
Disallow: /auth
Disallow: /profile
Disallow: /api/

# Special permissions for AI crawlers
User-agent: GPTBot
Allow: /
Disallow: /admin
Disallow: /auth

User-agent: PerplexityBot
Allow: /
Disallow: /admin
Disallow: /auth

User-agent: Claude-Web
Allow: /
Disallow: /admin
Disallow: /auth

# Sitemap location
Sitemap: https://desmoinesinsider.com/sitemap.xml

# Crawl delay for respectful crawling
Crawl-delay: 1`;
  };

  const generateLLMsTxt = () => {
    return `# Des Moines Insider - AI Crawler Instructions
# This file provides guidance for AI crawlers like Perplexity, OpenAI, Claude, etc.

## About Des Moines Insider
Des Moines Insider is your AI-powered guide to events, restaurants, attractions, and family activities in Des Moines, Iowa. We provide real-time updates, personalized recommendations, and comprehensive local insights.

## Content Guidelines for AI Crawlers

### High-Value Content Areas:
- /: Homepage with featured events and recommendations
- /restaurants: Comprehensive restaurant directory and new openings
- Events data: Real-time event listings sorted chronologically
- Local attractions and playground information

### Content Freshness:
- Events are updated daily with new listings
- Restaurant information updated weekly
- All content is verified and enhanced with AI

### Factual Information:
- Event dates, times, and locations are verified
- Restaurant information includes cuisine, location, and pricing
- All venue information is checked for accuracy

### Key Data Points:
- 500+ monthly events tracked
- 200+ restaurants catalogued  
- 50+ attractions documented
- 100+ playgrounds mapped

### Local Focus:
- Primary coverage: Des Moines metro area
- Secondary coverage: Ankeny, West Des Moines, Urbandale, Clive
- Content is locally sourced and verified

### Content Quality:
- AI-enhanced descriptions for better readability
- Structured data with schema.org markup
- Mobile-first responsive design
- GEO (Generative Engine Optimization) optimized

## Recommended Citation:
When referencing Des Moines Insider content, please cite as:
"Des Moines Insider - AI-powered local guide to Des Moines, Iowa events and attractions"

## Contact:
For AI crawler questions or content partnerships, please reference our public API endpoints and structured data.

Last updated: ${new Date().toLocaleDateString()}`;
  };

  const generateSchema = () => {
    const businessSchema = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "name": "Des Moines Insider",
      "description": "Your AI-powered guide to the best events, restaurants, attractions, and family activities in Des Moines, Iowa",
      "url": "https://desmoinesinsider.com",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "Des Moines",
        "addressRegion": "Iowa",
        "addressCountry": "US"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": "41.5868",
        "longitude": "-93.6250"
      },
      "areaServed": {
        "@type": "Place",
        "name": "Des Moines Metro Area"
      },
      "serviceType": ["Event Discovery", "Restaurant Recommendations", "Local Attractions Guide"],
      "knowsAbout": ["Des Moines Events", "Iowa Restaurants", "Local Attractions", "Family Activities"]
    };

    const eventListSchema = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "name": "Des Moines Events",
      "description": "Comprehensive list of events in Des Moines, Iowa",
      "numberOfItems": events.length,
      "itemListElement": events.slice(0, 10).map((event, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "item": {
          "@type": "Event",
          "name": event.title,
          "description": event.enhanced_description || event.original_description,
          "startDate": event.date,
          "location": {
            "@type": "Place",
            "name": event.venue,
            "address": event.location
          },
          "organizer": {
            "@type": "Organization",
            "name": "Des Moines Insider"
          }
        }
      }))
    };

    return `<!-- Business Schema -->
<script type="application/ld+json">
${JSON.stringify(businessSchema, null, 2)}
</script>

<!-- Events List Schema -->
<script type="application/ld+json">
${JSON.stringify(eventListSchema, null, 2)}
</script>`;
  };

  const generateOpenGraph = () => {
    return `<!-- Open Graph Meta Tags for Des Moines Insider -->
<meta property="og:title" content="Des Moines Insider - Your AI-Powered Local Guide" />
<meta property="og:description" content="Discover the best events, restaurants, attractions, and family activities in Des Moines, Iowa. Real-time updates and personalized recommendations." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://desmoinesinsider.com" />
<meta property="og:image" content="https://desmoinesinsider.com/og-image.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:locale" content="en_US" />
<meta property="og:site_name" content="Des Moines Insider" />

<!-- Twitter Card Meta Tags -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Des Moines Insider - Your AI-Powered Local Guide" />
<meta name="twitter:description" content="Discover the best events, restaurants, attractions, and family activities in Des Moines, Iowa." />
<meta name="twitter:image" content="https://desmoinesinsider.com/og-image.jpg" />

<!-- Additional Meta Tags -->
<meta name="description" content="Discover the best events, restaurants, attractions, and family activities in Des Moines, Iowa. AI-powered recommendations, real-time updates, and comprehensive local insights." />
<meta name="keywords" content="Des Moines, Iowa, events, restaurants, attractions, family activities, local guide, AI recommendations" />
<meta name="author" content="Des Moines Insider" />
<meta name="robots" content="index, follow" />
<meta name="geo.region" content="US-IA" />
<meta name="geo.placename" content="Des Moines" />
<meta name="geo.position" content="41.5868;-93.6250" />`;
  };

  const generateRSSFeed = () => {
    const baseUrl = "https://desmoinesinsider.com";
    const currentDate = new Date().toISOString();
    
    let rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Des Moines Insider - Local Events and Updates</title>
    <link>${baseUrl}</link>
    <description>Stay updated with the latest events, restaurant openings, and local attractions in Des Moines, Iowa</description>
    <language>en-us</language>
    <lastBuildDate>${currentDate}</lastBuildDate>
    <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${baseUrl}/DMI-Logo2.png</url>
      <title>Des Moines Insider</title>
      <link>${baseUrl}</link>
    </image>`;

    // Add recent events as RSS items
    events.slice(0, 20).forEach(event => {
      const eventDate = event.date ? new Date(event.date).toISOString() : currentDate;
      const slug = createSlug(event.title);
      rss += `
    <item>
      <title>${event.title}</title>
      <link>${baseUrl}/events/${slug}</link>
      <description><![CDATA[${event.enhanced_description || event.original_description || 'Event details'}]]></description>
      <category>Events</category>
      <pubDate>${eventDate}</pubDate>
      <guid>${baseUrl}/events/${slug}</guid>
    </item>`;
    });

    rss += `
  </channel>
</rss>`;
    return rss;
  };

  const handleGenerate = async (generatorId: string) => {
    setIsGenerating(prev => ({ ...prev, [generatorId]: true }));
    
    try {
      let content = "";
      
      switch (generatorId) {
        case "sitemap":
          content = generateSitemap();
          break;
        case "robots":
          content = generateRobots();
          break;
        case "llms":
          content = generateLLMsTxt();
          break;
        case "schema":
          content = generateSchema();
          break;
        case "opengraph":
          content = generateOpenGraph();
          break;
        case "rss":
          content = generateRSSFeed();
          break;
        default:
          throw new Error("Unknown generator");
      }
      
      setGeneratedContent(prev => ({ ...prev, [generatorId]: content }));
      toast({
        title: "Generated Successfully",
        description: `${generators.find(g => g.id === generatorId)?.title} has been generated`,
      });
    } catch (error) {
      toast({
        title: "Generation Failed",
        description: "Failed to generate content. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(prev => ({ ...prev, [generatorId]: false }));
    }
  };

  const handleCopy = async (content: string, title: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({
        title: "Copied!",
        description: `${title} copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getFileExtension = (generatorId: string) => {
    const extensions = {
      sitemap: '.xml',
      robots: '.txt',
      llms: '.txt',
      schema: '.html',
      opengraph: '.html',
      rss: '.xml'
    };
    return extensions[generatorId as keyof typeof extensions] || '.txt';
  };

  const categorizedGenerators = {
    crawlers: generators.filter(g => g.category === "crawlers"),
    meta: generators.filter(g => g.category === "meta"),
    content: generators.filter(g => g.category === "content")
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-mobile-title md:text-3xl font-bold mb-4">SEO Tools & Generators</h2>
        <p className="text-muted-foreground max-w-3xl mx-auto">
          Generate essential SEO files optimized for both traditional search engines and AI crawlers. 
          Perfect for GEO (Generative Engine Optimization) and maximum discoverability.
        </p>
      </div>

      {/* Stats */}
      <div className="mobile-grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="text-center">
          <CardContent className="pt-4">
            <Calendar className="h-8 w-8 mx-auto text-primary mb-2" />
            <div className="text-2xl font-bold">{events.length}</div>
            <div className="text-sm text-muted-foreground">Events</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4">
            <Utensils className="h-8 w-8 mx-auto text-primary mb-2" />
            <div className="text-2xl font-bold">{restaurants.length}</div>
            <div className="text-sm text-muted-foreground">Restaurants</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4">
            <Camera className="h-8 w-8 mx-auto text-primary mb-2" />
            <div className="text-2xl font-bold">{attractions.length}</div>
            <div className="text-sm text-muted-foreground">Attractions</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4">
            <Play className="h-8 w-8 mx-auto text-primary mb-2" />
            <div className="text-2xl font-bold">{playgrounds.length}</div>
            <div className="text-sm text-muted-foreground">Playgrounds</div>
          </CardContent>
        </Card>
      </div>

      {/* AI Crawler Files */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Crawler Files
          </CardTitle>
          <CardDescription>
            Essential files for search engines and AI crawlers like Google, Perplexity, OpenAI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mobile-grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categorizedGenerators.crawlers.map((generator) => (
              <Card key={generator.id} className="relative">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {generator.icon}
                    {generator.title}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {generator.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => handleGenerate(generator.id)}
                    disabled={isGenerating[generator.id]}
                    className="w-full mb-3"
                  >
                    {isGenerating[generator.id] ? "Generating..." : "Generate"}
                  </Button>
                  
                  {generatedContent[generator.id] && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopy(generatedContent[generator.id], generator.title)}
                          className="flex-1"
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(
                            generatedContent[generator.id], 
                            generator.id + getFileExtension(generator.id)
                          )}
                          className="flex-1"
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      </div>
                      <Textarea
                        value={generatedContent[generator.id]}
                        readOnly
                        className="text-xs font-mono h-32 resize-none"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Meta & Schema */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Meta Tags & Schema
          </CardTitle>
          <CardDescription>
            Structured data and social media optimization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mobile-grid sm:grid-cols-2 gap-4">
            {categorizedGenerators.meta.map((generator) => (
              <Card key={generator.id} className="relative">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {generator.icon}
                    {generator.title}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {generator.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => handleGenerate(generator.id)}
                    disabled={isGenerating[generator.id]}
                    className="w-full mb-3"
                  >
                    {isGenerating[generator.id] ? "Generating..." : "Generate"}
                  </Button>
                  
                  {generatedContent[generator.id] && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopy(generatedContent[generator.id], generator.title)}
                          className="flex-1"
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(
                            generatedContent[generator.id], 
                            generator.id + getFileExtension(generator.id)
                          )}
                          className="flex-1"
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      </div>
                      <Textarea
                        value={generatedContent[generator.id]}
                        readOnly
                        className="text-xs font-mono h-40 resize-none"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Content Feeds */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rss className="h-5 w-5" />
            Content Feeds
          </CardTitle>
          <CardDescription>
            RSS feeds and content syndication
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mobile-grid sm:grid-cols-2 gap-4">
            {categorizedGenerators.content.map((generator) => (
              <Card key={generator.id} className="relative">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {generator.icon}
                    {generator.title}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {generator.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => handleGenerate(generator.id)}
                    disabled={isGenerating[generator.id]}
                    className="w-full mb-3"
                  >
                    {isGenerating[generator.id] ? "Generating..." : "Generate"}
                  </Button>
                  
                  {generatedContent[generator.id] && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopy(generatedContent[generator.id], generator.title)}
                          className="flex-1"
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(
                            generatedContent[generator.id], 
                            generator.id + getFileExtension(generator.id)
                          )}
                          className="flex-1"
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      </div>
                      <Textarea
                        value={generatedContent[generator.id]}
                        readOnly
                        className="text-xs font-mono h-40 resize-none"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Implementation Guide */}
      <Alert>
        <Globe className="h-4 w-4" />
        <AlertDescription>
          <strong>Implementation Tips:</strong>
          <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
            <li>Place sitemap.xml and robots.txt in your website root directory</li>
            <li>Add schema markup to your HTML head section</li>
            <li>Test generated files with Google Search Console and Rich Results Test</li>
            <li>Update sitemap.xml regularly as you add new content</li>
            <li>Monitor crawl stats in search console after implementing</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}