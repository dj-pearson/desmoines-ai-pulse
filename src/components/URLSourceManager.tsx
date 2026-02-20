import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Edit,
  Trash2,
  Globe,
  Calendar,
  MapPin,
  Utensils,
  Play,
  Camera,
  Building,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { createLogger } from '@/lib/logger';

const log = createLogger('URLSourceManager');

interface URLSource {
  id: string;
  name: string;
  url: string;
  category: string;
  description?: string;
  is_active: boolean;
  last_crawled?: string;
  crawl_frequency: string;
  success_rate: number;
  total_crawls: number;
  created_at: string;
  updated_at: string;
}

interface URLSourceManagerProps {
  onSelectSource?: (source: URLSource) => void;
  selectedCategory?: string;
}

const URLSourceManager: React.FC<URLSourceManagerProps> = ({
  onSelectSource,
  selectedCategory,
}) => {
  const [sources, setSources] = useState<URLSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<URLSource | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    url: "",
    category: "",
    description: "",
    is_active: true,
    crawl_frequency: "manual",
  });

  const categories = [
    { value: "events", label: "Events", icon: Calendar },
    { value: "restaurants", label: "Restaurants", icon: Utensils },
    { value: "restaurant_openings", label: "Restaurant Openings", icon: Building },
    { value: "playgrounds", label: "Playgrounds", icon: Play },
    { value: "attractions", label: "Attractions", icon: Camera },
  ];

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      const { data, error } = await supabase
        .from("url_sources")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSources(data || []);
    } catch (error) {
      log.error('fetchSources', 'Error fetching URL sources', { data: error });
      toast({
        title: "Error",
        description: "Failed to load URL sources",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingSource) {
        const { error } = await supabase
          .from("url_sources")
          .update(formData)
          .eq("id", editingSource.id);
        
        if (error) throw error;
        
        toast({
          title: "Success",
          description: "URL source updated successfully",
        });
      } else {
        const { error } = await supabase
          .from("url_sources")
          .insert([formData]);
        
        if (error) throw error;
        
        toast({
          title: "Success", 
          description: "URL source added successfully",
        });
      }
      
      resetForm();
      setIsDialogOpen(false);
      fetchSources();
    } catch (error) {
      log.error('saveSource', 'Error saving URL source', { data: error });
      toast({
        title: "Error",
        description: "Failed to save URL source",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this URL source?")) return;
    
    try {
      const { error } = await supabase
        .from("url_sources")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "URL source deleted successfully",
      });
      
      fetchSources();
    } catch (error) {
      log.error('deleteSource', 'Error deleting URL source', { data: error });
      toast({
        title: "Error",
        description: "Failed to delete URL source",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      url: "",
      category: "",
      description: "",
      is_active: true,
      crawl_frequency: "manual",
    });
    setEditingSource(null);
  };

  const openEditDialog = (source: URLSource) => {
    setEditingSource(source);
    setFormData({
      name: source.name,
      url: source.url,
      category: source.category,
      description: source.description || "",
      is_active: source.is_active,
      crawl_frequency: source.crawl_frequency,
    });
    setIsDialogOpen(true);
  };

  const getCategoryIcon = (category: string) => {
    const cat = categories.find(c => c.value === category);
    if (!cat) return Globe;
    return cat.icon;
  };

  const filteredSources = sources.filter(source => {
    const matchesSearch = source.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         source.url.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || source.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              URL Source Bank
            </CardTitle>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Source
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {editingSource ? "Edit URL Source" : "Add URL Source"}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="e.g., Des Moines Events"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="url">URL</Label>
                    <Input
                      id="url"
                      type="url"
                      value={formData.url}
                      onChange={(e) => setFormData({...formData, url: e.target.value})}
                      placeholder="https://example.com"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select 
                      value={formData.category} 
                      onValueChange={(value) => setFormData({...formData, category: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(cat => {
                          const Icon = cat.icon;
                          return (
                            <SelectItem key={cat.value} value={cat.value}>
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4" />
                                {cat.label}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      placeholder="Optional description of this source"
                      rows={2}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="active">Active</Label>
                    <Switch
                      id="active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
                    />
                  </div>

                  <div className="flex justify-end space-x-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">
                      {editingSource ? "Update" : "Add"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Input
              placeholder="Search sources..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Crawled</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-4">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : filteredSources.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-4">
                        No URL sources found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSources.map((source) => {
                      const Icon = getCategoryIcon(source.category);
                      return (
                        <TableRow key={source.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{source.name}</span>
                              {source.description && (
                                <span className="text-xs text-muted-foreground">
                                  {source.description}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                              <Icon className="h-3 w-3" />
                              {categories.find(c => c.value === source.category)?.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <a 
                              href={source.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-sm truncate block max-w-[200px]"
                            >
                              {source.url}
                            </a>
                          </TableCell>
                          <TableCell>
                            <Badge variant={source.is_active ? "default" : "secondary"}>
                              {source.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {source.last_crawled ? (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {new Date(source.last_crawled).toLocaleDateString()}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Never</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {onSelectSource && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onSelectSource(source)}
                                >
                                  Use
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditDialog(source)}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDelete(source.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default URLSourceManager;