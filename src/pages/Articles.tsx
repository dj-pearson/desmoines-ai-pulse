import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useArticles } from '@/hooks/useArticles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Eye, Search, Filter } from 'lucide-react';
import { AccessibleLoadingSpinner } from '@/components/AccessibleLoadingSpinner';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';

const Articles: React.FC = () => {
  const { articles, loading, error, loadArticles } = useArticles();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('draft');

  // Get unique categories from articles
  const categories = Array.from(new Set(articles.map(article => article.category)));

  // Filter articles based on search, category, and status
  const filteredArticles = articles.filter(article => {
    const matchesStatus = selectedStatus === 'all' || article.status === selectedStatus;
    const matchesSearch = article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         article.excerpt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         article.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || !selectedCategory || article.category === selectedCategory;
    
    return matchesStatus && matchesSearch && matchesCategory;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  useEffect(() => {
    // For public Articles page, default to published unless explicitly changed
    loadArticles(selectedStatus === 'all' ? 'all' : selectedStatus);
  }, [selectedStatus]);

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-background">
          <div className="container mx-auto px-4 py-8">
            <AccessibleLoadingSpinner />
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
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-foreground mb-2">
              Articles & Insights
            </h1>
            <p className="text-muted-foreground text-lg mb-6">
              Discover comprehensive guides and insights about Des Moines
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <div className="flex-1">
              <Input
                type="text"
                placeholder="Search articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="all">All Status</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full sm:w-[200px]">
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

          <p className="text-sm text-muted-foreground mb-6">
            {filteredArticles.length} article{filteredArticles.length !== 1 ? 's' : ''} found
          </p>

          {filteredArticles.length === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-xl font-semibold mb-2">No articles found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || selectedCategory ? 
                  'Try adjusting your search criteria or browse all articles.' :
                  'No articles have been published yet.'
                }
              </p>
              {(searchQuery || (selectedCategory && selectedCategory !== 'all')) && (
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredArticles.map((article) => (
                <Card key={article.id} className="hover:shadow-lg transition-shadow">
                  <Link to={`/articles/${article.slug}`}>
                    {article.featured_image_url && (
                      <div className="aspect-video overflow-hidden rounded-t-lg">
                        <img
                          src={article.featured_image_url}
                          alt={article.title}
                          className="w-full h-full object-cover hover:scale-105 transition-transform"
                        />
                      </div>
                    )}
                    
                    <CardHeader>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="text-xs">
                          {article.category}
                        </Badge>
                        <Badge 
                          variant={article.status === 'published' ? 'default' : 'outline'} 
                          className="text-xs"
                        >
                          {article.status}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {article.view_count} views
                        </span>
                      </div>
                      
                      <CardTitle className="hover:text-primary transition-colors">
                        {article.title}
                      </CardTitle>
                      
                      {article.excerpt && (
                        <CardDescription className="line-clamp-3">
                          {article.excerpt}
                        </CardDescription>
                      )}
                    </CardHeader>

                    <CardContent>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 mr-1" />
                          {formatDate(article.published_at || article.created_at)}
                        </div>
                        
                        <div className="flex gap-1">
                          {article.tags.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {article.tags.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{article.tags.length - 2}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
};

export default Articles;