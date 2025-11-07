import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useArticles } from '@/hooks/useArticles';
import { Article } from '@/hooks/useArticles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Calendar, 
  Eye, 
  ArrowLeft, 
  Share2, 
  Clock, 
  User, 
  Tag, 
  BookOpen,
  ThumbsUp,
  MessageCircle,
  Bookmark
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-skeleton';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import ShareDialog from '@/components/ShareDialog';
import { Helmet } from 'react-helmet-async';

const ArticleDetails: React.FC = () => {
  const { slug } = useParams();
  const { getArticleBySlug } = useArticles({ autoLoad: false });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

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

  if (!article) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-background">
          <div className="container mx-auto px-4 py-16 text-center">
            <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h1 className="text-2xl font-semibold mb-2">Article Not Found</h1>
            <p className="text-muted-foreground mb-8">
              The article you're looking for doesn't exist or has been removed.
            </p>
            <Button asChild>
              <Link to="/articles">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Articles
              </Link>
            </Button>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  // Article Schema for SEO
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": article.title,
    "description": article.excerpt || article.seo_description || '',
    "image": article.featured_image_url || "https://desmoinesinsider.com/DMI-Logo.png",
    "datePublished": article.published_at || article.created_at,
    "dateModified": article.updated_at || article.published_at || article.created_at,
    "author": {
      "@type": "Organization",
      "name": "Des Moines Insider",
      "url": "https://desmoinesinsider.com"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Des Moines Insider",
      "logo": {
        "@type": "ImageObject",
        "url": "https://desmoinesinsider.com/DMI-Logo.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://desmoinesinsider.com/articles/${article.slug}`
    },
    "articleSection": article.category || "Local News",
    "keywords": Array.isArray(article.tags) ? article.tags.join(', ') : article.tags || '',
    "wordCount": article.content ? article.content.split(/\s+/).length : 0,
    "inLanguage": "en-US",
    "about": {
      "@type": "Place",
      "name": "Des Moines, Iowa"
    }
  };

  return (
    <>
      <SEOHead
        title={article.seo_title || article.title}
        description={article.seo_description || article.excerpt || `Read ${article.title} on Des Moines Insider`}
        keywords={article.seo_keywords || article.tags || []}
        type="article"
        canonicalUrl={`https://desmoinesinsider.com/articles/${article.slug}`}
      />
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(articleSchema)}
        </script>
      </Helmet>
      <Header />
      
      <div className="min-h-screen bg-background">
        {/* Hero Section */}
        <div className="relative">
          {/* Featured Image */}
          {article.featured_image_url && (
            <div className="relative h-64 md:h-96 lg:h-[500px] overflow-hidden">
              <img
                src={article.featured_image_url}
                alt={article.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/30" />
              
              {/* Back Button Overlay */}
              <div className="absolute top-4 left-4 z-10">
                <Button asChild variant="secondary" size="sm" className="backdrop-blur-sm">
                  <Link to="/articles">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Articles
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {/* Article Header */}
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className={`py-8 ${!article.featured_image_url ? 'pt-16' : ''}`}>
                {!article.featured_image_url && (
                  <Button asChild variant="ghost" size="sm" className="mb-6">
                    <Link to="/articles">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Articles
                    </Link>
                  </Button>
                )}

                {/* Article Meta */}
                <div className="flex flex-wrap items-center gap-3 mb-6">
                  <Badge variant="secondary" className="text-sm">
                    {article.category}
                  </Badge>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {formatDate(article.published_at || article.created_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {formatReadTime(article.content)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-4 w-4" />
                      {article.view_count || 0} views
                    </span>
                  </div>
                </div>

                {/* Title */}
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6 leading-tight">
                  {article.title}
                </h1>

                {/* Excerpt */}
                {article.excerpt && (
                  <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                    {article.excerpt}
                  </p>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 mb-8">
                  <ShareDialog 
                    title={article.title}
                    description={article.excerpt || article.title}
                    url={window.location.href}
                    trigger={
                      <Button variant="outline" size="sm" className="gap-2">
                        <Share2 className="h-4 w-4" />
                        Share
                      </Button>
                    }
                  />
                  <Button variant="outline" size="sm" className="gap-2">
                    <Bookmark className="h-4 w-4" />
                    Save
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2">
                    <ThumbsUp className="h-4 w-4" />
                    Like
                  </Button>
                </div>

                {/* Tags */}
                {article.tags && article.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-8">
                    {article.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-sm gap-1">
                        <Tag className="h-3 w-3" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Article Content */}
        <div className="container mx-auto px-4 pb-16">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Main Content */}
              <article className="lg:col-span-8">
                <Card className="p-6 md:p-8">
                  <div className="prose prose-lg max-w-none dark:prose-invert 
                               prose-headings:font-bold prose-headings:text-foreground
                               prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4
                               prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3
                               prose-p:leading-relaxed prose-p:mb-4 prose-p:text-foreground/90
                               prose-ul:my-4 prose-ul:list-disc prose-ul:pl-6
                               prose-ol:my-4 prose-ol:list-decimal prose-ol:pl-6
                               prose-li:mb-2 prose-li:text-foreground/90
                               prose-strong:text-foreground prose-strong:font-semibold
                               prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                               prose-img:rounded-lg prose-img:shadow-md
                               prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic
                               prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {article.content}
                    </ReactMarkdown>
                  </div>
                </Card>

                {/* Article Footer */}
                <div className="mt-8 p-6 bg-muted/30 rounded-lg border">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold mb-2">Found this helpful?</h3>
                      <div className="flex items-center gap-3">
                        <Button variant="outline" size="sm" className="gap-2">
                          <ThumbsUp className="h-4 w-4" />
                          Yes
                        </Button>
                        <Button variant="outline" size="sm" className="gap-2">
                          <MessageCircle className="h-4 w-4" />
                          Feedback
                        </Button>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground mb-2">
                        Published {formatDate(article.published_at || article.created_at)}
                      </p>
                      <ShareDialog 
                        title={article.title}
                        description={article.excerpt || article.title}
                        url={window.location.href}
                        trigger={
                          <Button variant="default" size="sm" className="gap-2">
                            <Share2 className="h-4 w-4" />
                            Share Article
                          </Button>
                        }
                      />
                    </div>
                  </div>
                </div>
              </article>

              {/* Sidebar */}
              <aside className="lg:col-span-4">
                <div className="sticky top-8 space-y-6">
                  {/* Table of Contents (placeholder) */}
                  <Card className="p-6">
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      In This Article
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="text-muted-foreground">
                        Table of contents will be generated based on article headings
                      </div>
                    </div>
                  </Card>

                  {/* Related Articles */}
                  <Card className="p-6">
                    <h3 className="font-semibold mb-4">Related Articles</h3>
                    <div className="text-muted-foreground text-sm">
                      Related articles will be shown here
                    </div>
                  </Card>

                  {/* Newsletter Signup */}
                  <Card className="p-6 bg-primary/5 border-primary/20">
                    <h3 className="font-semibold mb-2">Stay Updated</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Get the latest Des Moines insights delivered to your inbox
                    </p>
                    <Button className="w-full" size="sm">
                      Subscribe to Newsletter
                    </Button>
                  </Card>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>

      <Footer />

      {/* Share Dialog */}
      <ShareDialog 
        title={article.title}
        description={article.excerpt || article.title}
        url={window.location.href}
      />
    </>
  );
};

export default ArticleDetails;