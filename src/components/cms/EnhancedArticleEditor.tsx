import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useArticles } from '@/hooks/useArticles';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import {
  FileText,
  Save,
  Eye,
  Trash2,
  ArrowLeft,
  Plus,
  X,
  Globe,
  Search,
  Tag,
  User,
  Calendar as CalendarIcon,
  Clock,
  Send,
  Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Lazy load the rich text editor
const RichTextEditor = lazy(() => import('./RichTextEditor'));

interface AuthorProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface ArticleCategory {
  id: string;
  name: string;
  slug: string;
  color: string;
}

interface ArticleTag {
  id: string;
  name: string;
  slug: string;
  color: string;
}

interface ArticleData {
  title: string;
  content: string;
  excerpt: string;
  category: string;
  category_id: string | null;
  tags: string[];
  featured_image_url: string;
  seo_title: string;
  seo_description: string;
  seo_keywords: string[];
  status: 'draft' | 'published' | 'scheduled' | 'archived';
  author_profile_id: string | null;
  scheduled_at: Date | null;
  is_featured: boolean;
  priority: number;
}

export default function EnhancedArticleEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { articles, loading, createArticle, updateArticle, deleteArticle, publishArticle } = useArticles();

  const [isNewArticle, setIsNewArticle] = useState(!id);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSubmittingForReview, setIsSubmittingForReview] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [useWysiwyg, setUseWysiwyg] = useState(true);

  // Data for dropdowns
  const [authors, setAuthors] = useState<AuthorProfile[]>([]);
  const [categories, setCategories] = useState<ArticleCategory[]>([]);
  const [availableTags, setAvailableTags] = useState<ArticleTag[]>([]);

  const [articleData, setArticleData] = useState<ArticleData>({
    title: '',
    content: '',
    excerpt: '',
    category: 'General',
    category_id: null,
    tags: [],
    featured_image_url: '',
    seo_title: '',
    seo_description: '',
    seo_keywords: [],
    status: 'draft',
    author_profile_id: null,
    scheduled_at: null,
    is_featured: false,
    priority: 5,
  });

  const existingArticle = articles.find((a) => a.id === id);

  // Load authors, categories, and tags
  useEffect(() => {
    const loadData = async () => {
      const [authorsRes, categoriesRes, tagsRes] = await Promise.all([
        supabase.from('author_profiles').select('id, display_name, avatar_url').eq('is_active', true),
        supabase.from('article_categories').select('id, name, slug, color').eq('is_active', true).order('sort_order'),
        supabase.from('article_tags').select('id, name, slug, color').order('usage_count', { ascending: false }),
      ]);

      if (authorsRes.data) setAuthors(authorsRes.data);
      if (categoriesRes.data) setCategories(categoriesRes.data);
      if (tagsRes.data) setAvailableTags(tagsRes.data);
    };

    loadData();
  }, []);

  useEffect(() => {
    if (id && existingArticle) {
      setArticleData({
        title: existingArticle.title || '',
        content: existingArticle.content || '',
        excerpt: existingArticle.excerpt || '',
        category: existingArticle.category || 'General',
        category_id: (existingArticle as any).category_id || null,
        tags: existingArticle.tags || [],
        featured_image_url: existingArticle.featured_image_url || '',
        seo_title: existingArticle.seo_title || '',
        seo_description: existingArticle.seo_description || '',
        seo_keywords: existingArticle.seo_keywords || [],
        status: existingArticle.status as 'draft' | 'published' | 'scheduled' | 'archived',
        author_profile_id: (existingArticle as any).author_profile_id || null,
        scheduled_at: (existingArticle as any).scheduled_at ? new Date((existingArticle as any).scheduled_at) : null,
        is_featured: (existingArticle as any).is_featured || false,
        priority: (existingArticle as any).priority || 5,
      });
      setIsNewArticle(false);
    }
  }, [id, existingArticle]);

  const handleInputChange = (field: keyof ArticleData, value: any) => {
    setArticleData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAddTag = () => {
    if (newTag.trim() && !articleData.tags.includes(newTag.trim())) {
      handleInputChange('tags', [...articleData.tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    handleInputChange('tags', articleData.tags.filter((tag) => tag !== tagToRemove));
  };

  const handleAddKeyword = () => {
    if (newKeyword.trim() && !articleData.seo_keywords.includes(newKeyword.trim())) {
      handleInputChange('seo_keywords', [...articleData.seo_keywords, newKeyword.trim()]);
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    handleInputChange('seo_keywords', articleData.seo_keywords.filter((kw) => kw !== keywordToRemove));
  };

  const generateSEOFromContent = () => {
    if (!articleData.seo_title && articleData.title) {
      handleInputChange('seo_title', articleData.title);
    }
    if (!articleData.seo_description) {
      const description =
        articleData.excerpt ||
        articleData.content.substring(0, 150).replace(/<[^>]*>/g, '').trim() + '...';
      handleInputChange('seo_description', description);
    }
  };

  const handleSave = async (shouldPublish = false) => {
    if (!articleData.title.trim() || !articleData.content.trim()) {
      toast.error('Title and content are required');
      return;
    }

    try {
      if (shouldPublish) {
        setIsPublishing(true);
      } else {
        setIsSaving(true);
      }

      const dataToSave: any = {
        title: articleData.title,
        content: articleData.content,
        excerpt: articleData.excerpt,
        category: articleData.category,
        tags: articleData.tags,
        featured_image_url: articleData.featured_image_url,
        seo_title: articleData.seo_title,
        seo_description: articleData.seo_description,
        seo_keywords: articleData.seo_keywords,
        status: shouldPublish ? 'published' : articleData.status,
        author_profile_id: articleData.author_profile_id,
        category_id: articleData.category_id,
        is_featured: articleData.is_featured,
        priority: articleData.priority,
        scheduled_at: articleData.status === 'scheduled' ? articleData.scheduled_at?.toISOString() : null,
      };

      if (isNewArticle) {
        const newArticle = await createArticle(dataToSave);
        if (newArticle) {
          toast.success(`Article ${shouldPublish ? 'published' : 'saved'} successfully!`);
          navigate(`/admin/articles/edit/${newArticle.id}`);
        }
      } else {
        await updateArticle({ id: id!, ...dataToSave });
        if (shouldPublish && articleData.status !== 'published') {
          await publishArticle(id!);
        }
        toast.success(`Article ${shouldPublish ? 'published' : 'updated'} successfully!`);
      }
    } catch (error) {
      console.error('Error saving article:', error);
      toast.error('Failed to save article');
    } finally {
      setIsSaving(false);
      setIsPublishing(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!articleData.title.trim() || !articleData.content.trim()) {
      toast.error('Title and content are required');
      return;
    }

    try {
      setIsSubmittingForReview(true);

      // First save the article
      let articleId = id;
      if (isNewArticle) {
        const newArticle = await createArticle({
          title: articleData.title,
          content: articleData.content,
          excerpt: articleData.excerpt,
          category: articleData.category,
          tags: articleData.tags,
          featured_image_url: articleData.featured_image_url,
          seo_title: articleData.seo_title,
          seo_description: articleData.seo_description,
          seo_keywords: articleData.seo_keywords,
          status: 'draft',
        });
        if (!newArticle) throw new Error('Failed to create article');
        articleId = newArticle.id;
      } else {
        await handleSave(false);
      }

      // Update article review status
      await supabase
        .from('articles')
        .update({ review_status: 'pending_review' })
        .eq('id', articleId);

      // Add to content queue
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('content_queue').insert({
        article_id: articleId,
        submitted_by: user?.id,
        status: 'pending',
        priority: articleData.priority,
      });

      if (error) throw error;

      toast.success('Article submitted for review!');
      navigate('/admin/cms?tab=queue');
    } catch (error) {
      console.error('Error submitting for review:', error);
      toast.error('Failed to submit for review');
    } finally {
      setIsSubmittingForReview(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;

    try {
      await deleteArticle(id);
      toast.success('Article deleted successfully');
      navigate('/admin/cms');
    } catch (error) {
      console.error('Error deleting article:', error);
      toast.error('Failed to delete article');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate('/admin/cms')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to CMS
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {isNewArticle ? 'Create New Article' : 'Edit Article'}
            </h1>
            <p className="text-muted-foreground">
              {isNewArticle ? 'Write and publish a new article' : 'Edit your article content and settings'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isNewArticle && (
            <Button variant="outline" asChild>
              <a href={`/articles/${existingArticle?.slug}`} target="_blank" rel="noopener noreferrer">
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </a>
            </Button>
          )}

          <Button
            onClick={() => handleSave(false)}
            disabled={isSaving || isPublishing}
            variant="outline"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Draft'}
          </Button>

          <Button
            onClick={handleSubmitForReview}
            disabled={isSaving || isPublishing || isSubmittingForReview}
            variant="secondary"
          >
            <Send className="h-4 w-4 mr-2" />
            {isSubmittingForReview ? 'Submitting...' : 'Submit for Review'}
          </Button>

          <Button onClick={() => handleSave(true)} disabled={isSaving || isPublishing}>
            <Globe className="h-4 w-4 mr-2" />
            {isPublishing ? 'Publishing...' : 'Publish'}
          </Button>

          {!isNewArticle && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Article</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this article? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Article Content
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={articleData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="Enter article title..."
                  className="text-lg font-semibold"
                />
              </div>

              <div>
                <Label htmlFor="excerpt">Excerpt</Label>
                <Textarea
                  id="excerpt"
                  value={articleData.excerpt}
                  onChange={(e) => handleInputChange('excerpt', e.target.value)}
                  placeholder="Brief summary of the article..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="content">Content *</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">WYSIWYG Editor</span>
                    <Switch checked={useWysiwyg} onCheckedChange={setUseWysiwyg} />
                  </div>
                </div>

                {useWysiwyg ? (
                  <Suspense
                    fallback={
                      <div className="h-[400px] border rounded-lg flex items-center justify-center">
                        Loading editor...
                      </div>
                    }
                  >
                    <RichTextEditor
                      content={articleData.content}
                      onChange={(content) => handleInputChange('content', content)}
                      placeholder="Write your article content here..."
                      minHeight="400px"
                    />
                  </Suspense>
                ) : (
                  <>
                    <Textarea
                      id="content"
                      value={articleData.content}
                      onChange={(e) => handleInputChange('content', e.target.value)}
                      placeholder="Write your article content here..."
                      rows={20}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      You can use Markdown formatting or HTML
                    </p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* SEO Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  SEO Settings
                </CardTitle>
                <Button variant="outline" size="sm" onClick={generateSEOFromContent}>
                  Auto-Generate
                </Button>
              </div>
              <CardDescription>Optimize your article for search engines</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="seo-title">SEO Title</Label>
                <Input
                  id="seo-title"
                  value={articleData.seo_title}
                  onChange={(e) => handleInputChange('seo_title', e.target.value)}
                  placeholder="SEO optimized title (60 characters max)"
                  maxLength={60}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {articleData.seo_title.length}/60 characters
                </p>
              </div>

              <div>
                <Label htmlFor="seo-description">SEO Description</Label>
                <Textarea
                  id="seo-description"
                  value={articleData.seo_description}
                  onChange={(e) => handleInputChange('seo_description', e.target.value)}
                  placeholder="SEO meta description (160 characters max)"
                  rows={3}
                  maxLength={160}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {articleData.seo_description.length}/160 characters
                </p>
              </div>

              <div>
                <Label>SEO Keywords</Label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder="Add SEO keyword..."
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddKeyword())}
                  />
                  <Button onClick={handleAddKeyword} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {articleData.seo_keywords.map((keyword) => (
                    <Badge key={keyword} variant="secondary" className="gap-1">
                      {keyword}
                      <button onClick={() => handleRemoveKeyword(keyword)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Article Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={articleData.status} onValueChange={(value) => handleInputChange('status', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {articleData.status === 'scheduled' && (
                <div>
                  <Label>Scheduled Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !articleData.scheduled_at && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {articleData.scheduled_at
                          ? format(articleData.scheduled_at, 'PPP')
                          : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={articleData.scheduled_at || undefined}
                        onSelect={(date) => handleInputChange('scheduled_at', date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              <div>
                <Label>Author</Label>
                <Select
                  value={articleData.author_profile_id || 'none'}
                  onValueChange={(value) =>
                    handleInputChange('author_profile_id', value === 'none' ? null : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select author" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No author</SelectItem>
                    {authors.map((author) => (
                      <SelectItem key={author.id} value={author.id}>
                        {author.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Select
                  value={articleData.category}
                  onValueChange={(value) => {
                    const cat = categories.find((c) => c.name === value);
                    handleInputChange('category', value);
                    handleInputChange('category_id', cat?.id || null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.name}>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                          {category.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Priority</Label>
                <Select
                  value={articleData.priority.toString()}
                  onValueChange={(value) => handleInputChange('priority', parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Low (1)</SelectItem>
                    <SelectItem value="3">Normal (3)</SelectItem>
                    <SelectItem value="5">Normal (5)</SelectItem>
                    <SelectItem value="7">High (7)</SelectItem>
                    <SelectItem value="9">Urgent (9)</SelectItem>
                    <SelectItem value="10">Critical (10)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is-featured"
                  checked={articleData.is_featured}
                  onCheckedChange={(checked) => handleInputChange('is_featured', checked)}
                />
                <Label htmlFor="is-featured" className="flex items-center gap-1">
                  <Star className="h-4 w-4 text-yellow-500" />
                  Featured Article
                </Label>
              </div>

              <div>
                <Label htmlFor="featured-image">Featured Image URL</Label>
                <Input
                  id="featured-image"
                  value={articleData.featured_image_url}
                  onChange={(e) => handleInputChange('featured_image_url', e.target.value)}
                  placeholder="https://example.com/image.jpg"
                />
              </div>
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Tags
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add tag..."
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                />
                <Button onClick={handleAddTag} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Suggested tags from available tags */}
              {availableTags.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Suggested Tags</Label>
                  <div className="flex flex-wrap gap-1">
                    {availableTags
                      .filter((t) => !articleData.tags.includes(t.name))
                      .slice(0, 10)
                      .map((tag) => (
                        <Button
                          key={tag.id}
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() =>
                            handleInputChange('tags', [...articleData.tags, tag.name])
                          }
                        >
                          + {tag.name}
                        </Button>
                      ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {articleData.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="gap-1">
                    {tag}
                    <button onClick={() => handleRemoveTag(tag)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Article Preview */}
          {articleData.featured_image_url && (
            <Card>
              <CardHeader>
                <CardTitle>Featured Image</CardTitle>
              </CardHeader>
              <CardContent>
                <img
                  src={articleData.featured_image_url}
                  alt="Featured"
                  className="w-full h-32 object-cover rounded"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
