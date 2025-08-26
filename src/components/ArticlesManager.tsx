import React, { useState, useEffect } from "react";
import { useArticles } from "@/hooks/useArticles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { FileText, Plus, Edit, Trash2, Eye, Calendar, User, Search } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function ArticlesManager() {
  const { articles, loading, error, deleteArticle, publishArticle, loadArticles } = useArticles();
  const [searchTerm, setSearchTerm] = useState("");

  // Load all articles (including drafts) for admin management
  useEffect(() => {
    loadArticles('all'); // Load all articles regardless of status
  }, []);

  const filteredArticles = articles.filter(article => 
    article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    article.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    article.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = async (id: string, title: string) => {
    try {
      await deleteArticle(id);
      toast.success(`Article "${title}" deleted successfully`);
    } catch (error) {
      console.error('Error deleting article:', error);
      toast.error("Failed to delete article");
    }
  };

  const handlePublish = async (id: string, title: string) => {
    try {
      await publishArticle(id);
      toast.success(`Article "${title}" published successfully`);
    } catch (error) {
      console.error('Error publishing article:', error);
      toast.error("Failed to publish article");
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "secondary",
      published: "default",
      archived: "outline"
    };
    return (
      <Badge variant={variants[status] || "secondary"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-destructive">
          Error loading articles: {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Articles Management
            </CardTitle>
            <CardDescription>
              Manage blog articles and content posts
            </CardDescription>
          </div>
          <Button asChild>
            <a href="/admin/articles/new" target="_blank" rel="noopener noreferrer">
              <Plus className="h-4 w-4 mr-2" />
              Create New Article
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search articles by title, category, or status..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-muted/50 p-4 rounded-lg">
            <div className="text-2xl font-bold">{articles.length}</div>
            <div className="text-sm text-muted-foreground">Total Articles</div>
          </div>
          <div className="bg-muted/50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {articles.filter(a => a.status === 'published').length}
            </div>
            <div className="text-sm text-muted-foreground">Published</div>
          </div>
          <div className="bg-muted/50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {articles.filter(a => a.status === 'draft').length}
            </div>
            <div className="text-sm text-muted-foreground">Drafts</div>
          </div>
          <div className="bg-muted/50 p-4 rounded-lg">
            <div className="text-2xl font-bold">
              {articles.reduce((sum, a) => sum + (a.view_count || 0), 0)}
            </div>
            <div className="text-sm text-muted-foreground">Total Views</div>
          </div>
        </div>

        {/* Articles Table */}
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Views</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredArticles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {searchTerm ? "No articles match your search" : "No articles found"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredArticles.map((article) => (
                  <TableRow key={article.id}>
                    <TableCell>
                      <div className="max-w-xs">
                        <div className="font-medium truncate">{article.title}</div>
                        {article.excerpt && (
                          <div className="text-sm text-muted-foreground truncate">
                            {article.excerpt}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{article.category}</Badge>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(article.status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {article.view_count || 0}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {formatDate(article.created_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {article.published_at ? (
                        <div className="text-sm text-muted-foreground">
                          {formatDate(article.published_at)}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button asChild variant="ghost" size="sm">
                          <a href={`/admin/articles/edit/${article.id}`} target="_blank" rel="noopener noreferrer">
                            <Edit className="h-3 w-3" />
                          </a>
                        </Button>
                        
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/articles/${article.slug}`}>
                            <Eye className="h-3 w-3" />
                          </Link>
                        </Button>
                        
                        {article.status === 'draft' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePublish(article.id, article.title)}
                          >
                            Publish
                          </Button>
                        )}
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Article</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{article.title}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(article.id, article.title)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}