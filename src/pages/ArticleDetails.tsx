import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useArticles } from '@/hooks/useArticles';
import { Article } from '@/hooks/useArticles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Eye, ArrowLeft, Share2 } from 'lucide-react';
import { AccessibleLoadingSpinner } from '@/components/AccessibleLoadingSpinner';
import SEOHead from '@/components/SEOHead';
import ShareDialog from '@/components/ShareDialog';

const ArticleDetails: React.FC = () => {
  const { slug } = useParams();
  const { getArticleBySlug } = useArticles();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadArticle = async () => {
      if (!slug) return;
      
      setLoading(true);
      const fetchedArticle = await getArticleBySlug(slug);
      setArticle(fetchedArticle);
      setLoading(false);
    };

    loadArticle();
  }, [slug, getArticleBySlug]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <AccessibleLoadingSpinner />
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold mb-4">Article Not Found</h1>
            <p className="text-muted-foreground mb-6">
              The article you're looking for doesn't exist or has been removed.
            </p>
            <Link to="/articles">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Articles
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEOHead 
        title={article.seo_title || article.title}
        description={article.seo_description || article.excerpt || `Read about ${article.title} on Des Moines Insider`}
        keywords={article.seo_keywords || article.tags}
      />

      <article className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Navigation */}
        <div className="mb-8">
          <Link to="/articles">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Articles
            </Button>
          </Link>
        </div>

        {/* Featured Image */}
        {article.featured_image_url && (
          <div className="aspect-video overflow-hidden rounded-lg mb-8">
            <img
              src={article.featured_image_url}
              alt={article.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Article Header */}
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Badge variant="secondary">
              {article.category}
            </Badge>
            <div className="flex items-center text-sm text-muted-foreground">
              <Calendar className="h-4 w-4 mr-1" />
              {formatDate(article.published_at || article.created_at)}
            </div>
            <div className="flex items-center text-sm text-muted-foreground">
              <Eye className="h-4 w-4 mr-1" />
              {article.view_count} views
            </div>
          </div>

          <h1 className="text-4xl font-bold text-foreground mb-4">
            {article.title}
          </h1>

          {article.excerpt && (
            <p className="text-xl text-muted-foreground leading-relaxed mb-6">
              {article.excerpt}
            </p>
          )}

          <div className="flex items-center justify-between border-b border-border pb-6">
            <div className="flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>

            <ShareDialog 
              title={article.title}
              description={article.excerpt || article.title}
              url={window.location.href}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </Button>
              }
            />
          </div>
        </header>

        {/* Article Content */}
        <div 
          className="prose prose-gray dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: article.content }}
        />

        {/* Article Footer */}
        <footer className="mt-12 pt-8 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Last updated: {formatDate(article.updated_at)}
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {article.view_count} views
              </span>
              <ShareDialog 
                title={article.title}
                description={article.excerpt || article.title}
                url={window.location.href}
                trigger={
                  <Button variant="outline" size="sm">
                    <Share2 className="h-4 w-4 mr-2" />
                    Share Article
                  </Button>
                }
              />
            </div>
          </div>
        </footer>

        {/* Related Articles or Call to Action */}
        <div className="mt-12 text-center">
          <h3 className="text-lg font-semibold mb-4">Discover More</h3>
          <p className="text-muted-foreground mb-6">
            Explore more articles about Des Moines events, attractions, and local insights.
          </p>
          <Link to="/articles">
            <Button variant="outline">
              Browse All Articles
            </Button>
          </Link>
        </div>
      </article>

      {/* Share Dialog */}
      <ShareDialog 
        title={article.title}
        description={article.excerpt || article.title}
        url={window.location.href}
      />
    </div>
  );
};

export default ArticleDetails;