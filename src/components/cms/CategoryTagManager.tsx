import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  FolderTree,
  Tags,
  Plus,
  Edit,
  Trash2,
  Search,
  Palette,
  FileText,
  Star,
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  icon: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  article_count: number;
  created_at: string;
  updated_at: string;
}

interface Tag {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  usage_count: number;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

interface CategoryFormData {
  name: string;
  description: string;
  color: string;
  icon: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
}

interface TagFormData {
  name: string;
  description: string;
  color: string;
  is_featured: boolean;
}

const defaultCategoryForm: CategoryFormData = {
  name: '',
  description: '',
  color: '#6366f1',
  icon: 'folder',
  parent_id: null,
  sort_order: 0,
  is_active: true,
};

const defaultTagForm: TagFormData = {
  name: '',
  description: '',
  color: '#6366f1',
  is_featured: false,
};

const colorOptions = [
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#84cc16', label: 'Lime' },
  { value: '#10b981', label: 'Emerald' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#6366f1', label: 'Indigo' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#6b7280', label: 'Gray' },
];

const iconOptions = [
  'folder', 'newspaper', 'calendar', 'utensils', 'landmark', 'palette',
  'briefcase', 'plane', 'film', 'coffee', 'home', 'music', 'camera',
  'book', 'heart', 'star', 'award', 'globe', 'map', 'users',
];

export function CategoryTagManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('categories');

  // Category dialog state
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryFormData>(defaultCategoryForm);

  // Tag dialog state
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [tagForm, setTagForm] = useState<TagFormData>(defaultTagForm);

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [categoriesRes, tagsRes] = await Promise.all([
        supabase.from('article_categories').select('*').order('sort_order', { ascending: true }),
        supabase.from('article_tags').select('*').order('usage_count', { ascending: false }),
      ]);

      if (categoriesRes.error) throw categoriesRes.error;
      if (tagsRes.error) throw tagsRes.error;

      setCategories(categoriesRes.data || []);
      setTags(tagsRes.data || []);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast.error('Failed to load categories and tags');
    } finally {
      setLoading(false);
    }
  };

  // Category handlers
  const handleOpenCategoryDialog = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name,
        description: category.description || '',
        color: category.color,
        icon: category.icon,
        parent_id: category.parent_id,
        sort_order: category.sort_order,
        is_active: category.is_active,
      });
    } else {
      setEditingCategory(null);
      setCategoryForm(defaultCategoryForm);
    }
    setIsCategoryDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) {
      toast.error('Category name is required');
      return;
    }

    try {
      setIsSaving(true);

      if (editingCategory) {
        const { error } = await supabase
          .from('article_categories')
          .update({
            name: categoryForm.name,
            description: categoryForm.description || null,
            color: categoryForm.color,
            icon: categoryForm.icon,
            parent_id: categoryForm.parent_id,
            sort_order: categoryForm.sort_order,
            is_active: categoryForm.is_active,
          })
          .eq('id', editingCategory.id);

        if (error) throw error;
        toast.success('Category updated');
      } else {
        const { error } = await supabase.from('article_categories').insert({
          name: categoryForm.name,
          slug: '',
          description: categoryForm.description || null,
          color: categoryForm.color,
          icon: categoryForm.icon,
          parent_id: categoryForm.parent_id,
          sort_order: categoryForm.sort_order,
          is_active: categoryForm.is_active,
        });

        if (error) throw error;
        toast.success('Category created');
      }

      setIsCategoryDialogOpen(false);
      setEditingCategory(null);
      setCategoryForm(defaultCategoryForm);
      loadData();
    } catch (error: any) {
      console.error('Error saving category:', error);
      toast.error(error.message || 'Failed to save category');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    try {
      const { error } = await supabase
        .from('article_categories')
        .delete()
        .eq('id', category.id);

      if (error) throw error;
      toast.success(`Category "${category.name}" deleted`);
      loadData();
    } catch (error: any) {
      console.error('Error deleting category:', error);
      toast.error('Failed to delete category');
    }
  };

  // Tag handlers
  const handleOpenTagDialog = (tag?: Tag) => {
    if (tag) {
      setEditingTag(tag);
      setTagForm({
        name: tag.name,
        description: tag.description || '',
        color: tag.color,
        is_featured: tag.is_featured,
      });
    } else {
      setEditingTag(null);
      setTagForm(defaultTagForm);
    }
    setIsTagDialogOpen(true);
  };

  const handleSaveTag = async () => {
    if (!tagForm.name.trim()) {
      toast.error('Tag name is required');
      return;
    }

    try {
      setIsSaving(true);

      if (editingTag) {
        const { error } = await supabase
          .from('article_tags')
          .update({
            name: tagForm.name,
            description: tagForm.description || null,
            color: tagForm.color,
            is_featured: tagForm.is_featured,
          })
          .eq('id', editingTag.id);

        if (error) throw error;
        toast.success('Tag updated');
      } else {
        const { error } = await supabase.from('article_tags').insert({
          name: tagForm.name,
          slug: '',
          description: tagForm.description || null,
          color: tagForm.color,
          is_featured: tagForm.is_featured,
        });

        if (error) throw error;
        toast.success('Tag created');
      }

      setIsTagDialogOpen(false);
      setEditingTag(null);
      setTagForm(defaultTagForm);
      loadData();
    } catch (error: any) {
      console.error('Error saving tag:', error);
      toast.error(error.message || 'Failed to save tag');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTag = async (tag: Tag) => {
    try {
      const { error } = await supabase
        .from('article_tags')
        .delete()
        .eq('id', tag.id);

      if (error) throw error;
      toast.success(`Tag "${tag.name}" deleted`);
      loadData();
    } catch (error: any) {
      console.error('Error deleting tag:', error);
      toast.error('Failed to delete tag');
    }
  };

  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredTags = tags.filter((tag) =>
    tag.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderTree className="h-5 w-5" />
          Categories & Tags
        </CardTitle>
        <CardDescription>Manage article categories and tags</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search categories or tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="categories">
              <FolderTree className="h-4 w-4 mr-2" />
              Categories ({categories.length})
            </TabsTrigger>
            <TabsTrigger value="tags">
              <Tags className="h-4 w-4 mr-2" />
              Tags ({tags.length})
            </TabsTrigger>
          </TabsList>

          {/* Categories Tab */}
          <TabsContent value="categories" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => handleOpenCategoryDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCategories.map((category) => (
                <div
                  key={category.id}
                  className="border rounded-lg p-4 space-y-3"
                  style={{ borderLeftColor: category.color, borderLeftWidth: '4px' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{category.name}</span>
                      {!category.is_active && (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenCategoryDialog(category)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Category</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{category.name}"? Articles in this
                              category will not be deleted but will need to be recategorized.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteCategory(category)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  {category.description && (
                    <p className="text-sm text-muted-foreground">{category.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {category.article_count} articles
                    </span>
                    <span className="flex items-center gap-1">
                      <Palette className="h-3 w-3" />
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Tags Tab */}
          <TabsContent value="tags" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => handleOpenTagDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Tag
              </Button>
            </div>

            <div className="flex flex-wrap gap-3">
              {filteredTags.map((tag) => (
                <div
                  key={tag.id}
                  className="border rounded-lg px-4 py-2 flex items-center gap-3 group"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="font-medium">{tag.name}</span>
                    {tag.is_featured && (
                      <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {tag.usage_count} uses
                  </Badge>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => handleOpenTagDialog(tag)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Tag</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{tag.name}"? This will remove the tag
                            from all articles.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteTag(tag)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Category Dialog */}
        <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? 'Edit Category' : 'Create Category'}
              </DialogTitle>
              <DialogDescription>
                {editingCategory
                  ? 'Update the category details'
                  : 'Add a new category for organizing articles'}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="cat-name">Name *</Label>
                <Input
                  id="cat-name"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Category name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cat-description">Description</Label>
                <Textarea
                  id="cat-description"
                  value={categoryForm.description}
                  onChange={(e) =>
                    setCategoryForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Brief description..."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Color</Label>
                  <Select
                    value={categoryForm.color}
                    onValueChange={(value) =>
                      setCategoryForm((prev) => ({ ...prev, color: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: categoryForm.color }}
                          />
                          {colorOptions.find((c) => c.value === categoryForm.color)?.label ||
                            'Select'}
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {colorOptions.map((color) => (
                        <SelectItem key={color.value} value={color.value}>
                          <div className="flex items-center gap-2">
                            <span
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: color.value }}
                            />
                            {color.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    value={categoryForm.sort_order}
                    onChange={(e) =>
                      setCategoryForm((prev) => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Parent Category</Label>
                <Select
                  value={categoryForm.parent_id || 'none'}
                  onValueChange={(value) =>
                    setCategoryForm((prev) => ({
                      ...prev,
                      parent_id: value === 'none' ? null : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select parent category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No parent</SelectItem>
                    {categories
                      .filter((c) => c.id !== editingCategory?.id)
                      .map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="cat-active"
                  checked={categoryForm.is_active}
                  onCheckedChange={(checked) =>
                    setCategoryForm((prev) => ({ ...prev, is_active: checked }))
                  }
                />
                <Label htmlFor="cat-active">Active</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveCategory} disabled={isSaving}>
                {isSaving ? 'Saving...' : editingCategory ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Tag Dialog */}
        <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTag ? 'Edit Tag' : 'Create Tag'}</DialogTitle>
              <DialogDescription>
                {editingTag ? 'Update the tag details' : 'Add a new tag for article labeling'}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="tag-name">Name *</Label>
                <Input
                  id="tag-name"
                  value={tagForm.name}
                  onChange={(e) => setTagForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Tag name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tag-description">Description</Label>
                <Textarea
                  id="tag-description"
                  value={tagForm.description}
                  onChange={(e) => setTagForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Color</Label>
                <Select
                  value={tagForm.color}
                  onValueChange={(value) => setTagForm((prev) => ({ ...prev, color: value }))}
                >
                  <SelectTrigger>
                    <SelectValue>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: tagForm.color }}
                        />
                        {colorOptions.find((c) => c.value === tagForm.color)?.label || 'Select'}
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {colorOptions.map((color) => (
                      <SelectItem key={color.value} value={color.value}>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: color.value }}
                          />
                          {color.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="tag-featured"
                  checked={tagForm.is_featured}
                  onCheckedChange={(checked) =>
                    setTagForm((prev) => ({ ...prev, is_featured: checked }))
                  }
                />
                <Label htmlFor="tag-featured">Featured Tag</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTagDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveTag} disabled={isSaving}>
                {isSaving ? 'Saving...' : editingTag ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default CategoryTagManager;
