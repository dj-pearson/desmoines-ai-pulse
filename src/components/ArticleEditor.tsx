import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useArticles } from "@/hooks/useArticles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { FileText, Save, Eye, Trash2, ArrowLeft, Plus, X, Globe, Search, Tag } from "lucide-react";
import { toast } from "sonner";
import { createLogger } from '@/lib/logger';

const log = createLogger('ArticleEditor');

interface ArticleData {
  title: string;
  content: string;
  excerpt: string;
  category: string;
  tags: string[];
  featured_image_url: string;
  seo_title: string;
  seo_description: string;
  seo_keywords: string[];
  status: 'draft' | 'published' | 'scheduled' | 'archived';
}

export default function ArticleEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { articles, loading, createArticle, updateArticle, deleteArticle, publishArticle } = useArticles();
  
  const [isNewArticle, setIsNewArticle] = useState(!id);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [newTag, setNewTag] = useState("");
  
  const [articleData, setArticleData] = useState<ArticleData>({
    title: "",
    content: "",
    excerpt: "",
    category: "General",
    tags: [],
    featured_image_url: "",
    seo_title: "",
    seo_description: "",
    seo_keywords: [],
    status: 'draft'
  });

  const existingArticle = articles.find(a => a.id === id);

  useEffect(() => {
    if (id && existingArticle) {
      setArticleData({
        title: existingArticle.title || "",
        content: existingArticle.content || "",
        excerpt: existingArticle.excerpt || "",
        category: existingArticle.category || "General",
        tags: existingArticle.tags || [],
        featured_image_url: existingArticle.featured_image_url || "",
        seo_title: existingArticle.seo_title || "",
        seo_description: existingArticle.seo_description || "",
        seo_keywords: existingArticle.seo_keywords || [],
        status: existingArticle.status as 'draft' | 'published' | 'scheduled' | 'archived'
      });
      setIsNewArticle(false);
    }
  }, [id, existingArticle]);

  const handleInputChange = (field: keyof ArticleData, value: any) => {
    setArticleData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAddTag = () => {
    if (newTag.trim() && !articleData.tags.includes(newTag.trim())) {
      handleInputChange('tags', [...articleData.tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    handleInputChange('tags', articleData.tags.filter(tag => tag !== tagToRemove));
  };

  const handleAddKeyword = () => {
    if (newTag.trim() && !articleData.seo_keywords.includes(newTag.trim())) {
      handleInputChange('seo_keywords', [...articleData.seo_keywords, newTag.trim()]);
      setNewTag("");
    }
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    handleInputChange('seo_keywords', articleData.seo_keywords.filter(keyword => keyword !== keywordToRemove));
  };

  const generateSEOFromContent = () => {
    // Auto-generate SEO title if empty
    if (!articleData.seo_title && articleData.title) {
      handleInputChange('seo_title', articleData.title);
    }
    
    // Auto-generate SEO description from excerpt or content
    if (!articleData.seo_description) {
      const description = articleData.excerpt || 
        articleData.content.substring(0, 150).replace(/<[^>]*>/g, '').trim() + "...";
      handleInputChange('seo_description', description);
    }
  };

  const handleSave = async (shouldPublish = false) => {
    if (!articleData.title.trim() || !articleData.content.trim()) {
      toast.error("Title and content are required");
      return;
    }

    try {
      if (shouldPublish) {
        setIsPublishing(true);
      } else {
        setIsSaving(true);
      }

      const dataToSave = {
        ...articleData,
        status: shouldPublish ? 'published' : articleData.status
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
      log.error('save', 'Error saving article', { data: error });
      toast.error("Failed to save article");
    } finally {
      setIsSaving(false);
      setIsPublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    
    try {
      await deleteArticle(id);
      toast.success("Article deleted successfully");
      navigate("/admin/articles");
    } catch (error) {
      log.error('delete', 'Error deleting article', { data: error });
      toast.error("Failed to delete article");
    }
  };

  const categories = [
    "General", "Events", "Restaurants", "Attractions", "Culture", 
    "Business", "Tourism", "Entertainment", "Food & Drink", "Lifestyle"
  ];

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
          <Button variant="outline" onClick={() => navigate("/admin/articles")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Articles
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {isNewArticle ? "Create New Article" : "Edit Article"}
            </h1>
            <p className="text-muted-foreground">
              {isNewArticle ? "Write and publish a new article" : "Edit your article content and settings"}
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
            {isSaving ? "Saving..." : "Save Draft"}
          </Button>
          
          <Button
            onClick={() => handleSave(true)}
            disabled={isSaving || isPublishing}
          >
            <Globe className="h-4 w-4 mr-2" />
            {isPublishing ? "Publishing..." : "Publish"}
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
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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

              <div>
                <Label htmlFor="content">Content *</Label>
                <Textarea
                  id="content"
                  value={articleData.content}
                  onChange={(e) => handleInputChange('content', e.target.value)}
                  placeholder="Write your article content here..."
                  rows={20}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  You can use Markdown formatting or HTML
                </p>
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
              <CardDescription>
                Optimize your article for search engines
              </CardDescription>
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
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
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

              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={articleData.category} onValueChange={(value) => handleInputChange('category', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  alt={`Featured image for ${articleData.title || 'article'}`}
                  className="w-full h-32 object-cover rounded"
                  loading="lazy"
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