import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useArticles } from '@/hooks/useArticles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Eye, Search, Filter, Clock, User, Tag, BookOpen, TrendingUp, Grid, List } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-skeleton';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import { FAQSection } from '@/components/FAQSection';

const Articles: React.FC = () => {
  const { articles, loading, error, loadArticles } = useArticles();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useState('grid');
  const [showFilters, setShowFilters] = useState(true); // Show filters by default

  // Get unique categories from published articles
  const categories = Array.from(new Set(articles.filter(article => article.status === 'published').map(article => article.category)));

  // Filter and sort articles - only show published articles
  const filteredAndSortedArticles = articles
    .filter(article => {
      if (article.status !== 'published') return false;
      
      const matchesSearch = article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           article.excerpt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (article.tags && article.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())));
      const matchesCategory = selectedCategory === 'all' || article.category === selectedCategory;
      
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.published_at || b.created_at).getTime() - new Date(a.published_at || a.created_at).getTime();
        case 'oldest':
          return new Date(a.published_at || a.created_at).getTime() - new Date(b.published_at || b.created_at).getTime();
        case 'popular':
          return (b.view_count || 0) - (a.view_count || 0);
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatReadTime = (content: string) => {
    const wordsPerMinute = 200;
    const wordCount = content.split(/\s+/).length;
    const readTime = Math.max(1, Math.ceil(wordCount / wordsPerMinute));
    return `${readTime} min read`;
  };

  useEffect(() => {
    // Load all articles but we'll filter to published in the component
    loadArticles('all');
  }, []);

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-background">
          <div className="container mx-auto px-4 py-8">
            <div className="flex items-center justify-center min-h-[400px]">
              <LoadingSpinner />
            </div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <SEOHead 
        title="Articles & Insights | Des Moines Insider"
        description="Discover comprehensive articles and insights about Des Moines events, attractions, dining, and local experiences. Stay informed with our latest content."
        keywords={['Des Moines articles', 'local insights', 'events guide', 'attractions', 'dining']}
      />
      <Header />
      <div className="min-h-screen bg-background">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-primary/5 via-primary/10 to-background border-b">
          <div className="container mx-auto px-4 py-12 md:py-16">
            <div className="max-w-4xl mx-auto text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <BookOpen className="h-8 w-8 text-primary" />
                <Badge variant="secondary" className="px-3 py-1">
                  Latest Articles
                </Badge>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 animate-fade-in">
                Des Moines Stories & Insights
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                Discover the best of Des Moines through in-depth guides, local stories, and insider tips from our community
              </p>
              
              {/* Featured Stats */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-card/50 backdrop-blur-sm rounded-lg p-4 border">
                  <div className="text-2xl font-bold text-primary">{filteredAndSortedArticles.length}</div>
                  <div className="text-sm text-muted-foreground">Articles</div>
                </div>
                <div className="bg-card/50 backdrop-blur-sm rounded-lg p-4 border">
                  <div className="text-2xl font-bold text-primary">{categories.length}</div>
                  <div className="text-sm text-muted-foreground">Categories</div>
                </div>
                <div className="bg-card/50 backdrop-blur-sm rounded-lg p-4 border col-span-2 md:col-span-1">
                  <div className="text-2xl font-bold text-primary">
                    {Math.round(filteredAndSortedArticles.reduce((acc, article) => acc + (article.view_count || 0), 0) / filteredAndSortedArticles.length) || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Avg. Views</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          {/* Search and Filter Controls */}
          <div className="mb-8">
            <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
              {/* Search Bar */}
              <div className="relative flex-1 max-w-2xl">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search articles, tags, or topics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12 text-base"
                  aria-label="Search articles"
                  role="searchbox"
                />
              </div>

              {/* Controls */}
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  className="gap-2"
                >
                  <Filter className="h-4 w-4" />
                  Filters
                </Button>

                {/* View Mode Toggle */}
                <div className="flex border rounded-md">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                    className="rounded-r-none"
                    aria-label="Switch to grid view"
                    title="Switch to grid view"
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="rounded-l-none"
                    aria-label="Switch to list view"
                    title="Switch to list view"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Expandable Filters */}
            {showFilters && (
              <div className="mt-4 p-4 bg-muted/30 rounded-lg border animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Category</label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Sort By</label>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newest">Newest First</SelectItem>
                        <SelectItem value="oldest">Oldest First</SelectItem>
                        <SelectItem value="popular">Most Popular</SelectItem>
                        <SelectItem value="title">Alphabetical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedCategory('all');
                        setSortBy('newest');
                      }}
                      className="w-full"
                    >
                      Clear Filters
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Results Info */}
          <div className="mb-6 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {searchQuery || selectedCategory !== 'all' 
                ? `Found ${filteredAndSortedArticles.length} article${filteredAndSortedArticles.length !== 1 ? 's' : ''}${searchQuery ? ` for "${searchQuery}"` : ''}`
                : `${filteredAndSortedArticles.length} article${filteredAndSortedArticles.length !== 1 ? 's' : ''} published`
              }
            </span>
            {selectedCategory !== 'all' && (
              <Badge variant="outline" className="gap-1">
                <Tag className="h-3 w-3" />
                {selectedCategory}
              </Badge>
            )}
          </div>

          {/* Articles Grid/List */}
          {filteredAndSortedArticles.length === 0 ? (
            <div className="text-center py-16">
              <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-semibold mb-2">No articles found</h3>
              <p className="text-muted-foreground mb-6">
                {searchQuery || selectedCategory !== 'all' 
                  ? 'Try adjusting your search criteria or browse all articles.'
                  : 'No articles have been published yet. Check back soon!'
                }
              </p>
              {(searchQuery || selectedCategory !== 'all') && (
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <div className={
              viewMode === 'grid' 
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" 
                : "space-y-6"
            }>
              {filteredAndSortedArticles.map((article, index) => (
                <Card 
                  key={article.id} 
                  className={`group hover:shadow-lg transition-all duration-300 hover-scale animate-fade-in ${
                    viewMode === 'list' ? 'flex flex-col md:flex-row overflow-hidden' : 'overflow-hidden'
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <Link to={`/articles/${article.slug}`} className="block h-full">
                    {article.featured_image_url && (
                      <div className={`overflow-hidden ${
                        viewMode === 'list' ? 'md:w-64 md:flex-shrink-0' : 'aspect-video'
                      }`}>
                        <img
                          src={article.featured_image_url}
                          alt={article.title}
                          className={`w-full object-cover transition-transform duration-300 group-hover:scale-105 ${
                            viewMode === 'list' ? 'h-48 md:h-full' : 'h-full'
                          }`}
                        />
                      </div>
                    )}
                    
                    <div className="p-6 flex-1">
                      {/* Category and Read Time */}
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="secondary" className="text-xs">
                          {article.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatReadTime(article.content)}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {article.view_count || 0}
                        </span>
                      </div>
                      
                      {/* Title */}
                      <CardTitle className="hover:text-primary transition-colors mb-3 line-clamp-2">
                        {article.title}
                      </CardTitle>
                      
                      {/* Excerpt */}
                      {article.excerpt && (
                        <CardDescription className="line-clamp-3 mb-4">
                          {article.excerpt}
                        </CardDescription>
                      )}

                      {/* Tags */}
                      {article.tags && article.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-4">
                          {article.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {article.tags.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{article.tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(article.published_at || article.created_at)}
                        </div>
                        
                        <span className="text-primary font-medium group-hover:underline">
                          Read more →
                        </span>
                      </div>
                    </div>
                  </Link>
                </Card>
              ))}
            </div>
          )}

          {/* Load More Button (if we implement pagination later) */}
          {filteredAndSortedArticles.length > 0 && (
            <div className="text-center mt-12">
              <Button variant="outline" size="lg" className="gap-2">
                <TrendingUp className="h-4 w-4" />
                Explore More Topics
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* FAQ Section for SEO and Featured Snippets */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <FAQSection
            title="Des Moines Articles & Blog - Frequently Asked Questions"
            description="Common questions about Des Moines Insider articles, local news, and community content."
            faqs={[
              {
                question: "What topics do Des Moines Insider articles cover?",
                answer: "Des Moines Insider publishes articles covering local events previews and recaps, restaurant reviews and new opening announcements, attraction guides and recommendations, neighborhood spotlights and community features, family activity ideas and seasonal guides, business news and economic development, cultural events and arts scene coverage, sports and entertainment updates, and local lifestyle and living tips. All content focuses exclusively on the Des Moines metropolitan area to provide relevant, hyperlocal information for residents and visitors."
              },
              {
                question: "How often are new articles published?",
                answer: "Des Moines Insider publishes new articles weekly with increased frequency during peak seasons like summer festivals and Iowa State Fair. Major event previews publish 1-2 weeks in advance, restaurant reviews post within days of new openings, breaking local news updates publish as events occur, and seasonal guides release at the start of each season. Subscribe to our newsletter or follow our social media channels for notifications when new articles publish. All articles undergo editorial review and AI enhancement for clarity and local relevance."
              },
              {
                question: "Can I submit article ideas or contribute content?",
                answer: "Yes! Des Moines Insider welcomes community contributions and article suggestions. Submit ideas for local business features, event coverage suggestions, neighborhood stories, restaurant recommendations, hidden gems in Des Moines, and community interest pieces. Contact us through the Business Partnership application or reach out via our contact form with 'Article Submission' in the subject line. Include detailed information about your proposed topic and why it would interest Des Moines residents. We prioritize authentic local stories with community value over promotional content."
              },
              {
                question: "Are Des Moines Insider articles free to read?",
                answer: "Yes! All Des Moines Insider articles are completely free to read without subscriptions, paywalls, or registration requirements. Our mission is providing accessible local information to the entire Des Moines community. We generate revenue through business partnerships, advertising, and premium services for venues and event organizers rather than charging readers. Simply visit our Articles page to browse and read all published content. Create a free account for personalized article recommendations based on your interests, but it's not required for reading."
              },
              {
                question: "How do I find articles about specific neighborhoods or topics?",
                answer: "Navigate articles by category using filters on the Articles page including Events, Restaurants, Attractions, Neighborhoods, Family, Business, and more. Use the search bar to find articles by keyword, neighborhood name, venue, or topic. Browse by neighborhood through our Neighborhoods section for area-specific content. Sort articles by newest, most popular, or alphabetically. Each article includes relevant tags for easy discovery of related content. Our AI-powered recommendations also suggest related articles based on what you're currently reading."
              },
              {
                question: "Do Des Moines Insider articles include photos and multimedia?",
                answer: "Yes! Most Des Moines Insider articles feature high-quality photography including featured images showcasing subjects, venue and event photos, neighborhood imagery, food photography for restaurant reviews, and attraction visuals. Some articles include embedded maps for location context, embedded videos when relevant, image galleries for comprehensive coverage, and interactive elements for enhanced engagement. All images are optimized for fast loading on mobile and desktop devices. Photo credits are provided when images are sourced from venues or photographers."
              },
              {
                question: "Can businesses be featured in Des Moines Insider articles?",
                answer: "Absolutely! Des Moines Insider regularly features local businesses through new restaurant opening announcements, business spotlight articles, event venue profiles, neighborhood business roundups, seasonal business features (holiday shopping, summer activities, etc.), and partnership content opportunities. Businesses interested in editorial coverage should contact us through the Business Partnership application. We prioritize authentic, newsworthy stories over pure promotion. Features focus on what makes businesses unique, their community impact, and value to Des Moines residents. Premium partnership opportunities are available for enhanced visibility."
              },
              {
                question: "How accurate and current is information in articles?",
                answer: "Des Moines Insider maintains high editorial standards for accuracy. All articles undergo fact-checking and verification before publication. Information sources include direct venue contact, official announcements, municipal sources, and firsthand visits. Articles display publication dates and last update timestamps. Time-sensitive information (event dates, business hours, prices) is verified at publication time but may change after publishing. We update articles when significant changes occur and encourage readers to verify critical details directly with venues. Report inaccuracies through our contact form for prompt correction. Our AI enhancement system improves clarity while preserving factual accuracy."
              }
            ]}
            showSchema={true}
            className="border-0 shadow-lg"
          />
        </div>
      </section>

      <Footer />
    </>
  );
};

export default Articles;