import React, { useState, useCallback } from "react";
import { useMediaLibrary, useDeleteMediaAsset, useUpdateMediaAsset, useMediaStats, type MediaAsset, type MediaFilters } from "@/hooks/useMediaLibrary";
import { useMediaUpload } from "@/hooks/useMediaUpload";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  Search,
  Grid,
  List,
  MoreVertical,
  Trash2,
  Edit,
  Download,
  Copy,
  Image as ImageIcon,
  Video,
  FileAudio,
  File,
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  HardDrive,
  Layers,
} from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import { cn } from "@/lib/utils";

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Helper function to format date
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Get icon for file type
function getFileIcon(mimeType: string): React.ReactNode {
  if (mimeType.startsWith("image/")) {
    return <ImageIcon className="h-4 w-4" />;
  }
  if (mimeType.startsWith("video/")) {
    return <Video className="h-4 w-4" />;
  }
  if (mimeType.startsWith("audio/")) {
    return <FileAudio className="h-4 w-4" />;
  }
  return <File className="h-4 w-4" />;
}

// Get status badge
function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          Optimized
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
          Processing
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive">
          <AlertCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
  }
}

interface MediaLibraryProps {
  onSelect?: (asset: MediaAsset) => void;
  selectionMode?: "single" | "multiple" | "none";
  filterBucket?: string;
  filterContentType?: string;
  className?: string;
}

export function MediaLibrary({
  onSelect,
  selectionMode = "none",
  filterBucket,
  filterContentType,
  className,
}: MediaLibraryProps) {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [editingAsset, setEditingAsset] = useState<MediaAsset | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<string | null>(null);

  // Filters state
  const [filters, setFilters] = useState<MediaFilters>({
    bucket: filterBucket,
    contentType: filterContentType,
    page: 1,
    pageSize: 20,
    sortBy: "created_at",
    sortOrder: "desc",
  });
  const [searchQuery, setSearchQuery] = useState("");

  // Hooks
  const { data, isLoading, error, refetch } = useMediaLibrary({
    ...filters,
    searchQuery: searchQuery || undefined,
  });
  const { data: stats } = useMediaStats();
  const deleteAsset = useDeleteMediaAsset();
  const updateAsset = useUpdateMediaAsset();
  const { upload, isUploading } = useMediaUpload();

  const totalPages = data ? Math.ceil(data.total / (filters.pageSize || 20)) : 0;

  // Handle file upload
  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files) return;

      for (const file of Array.from(files)) {
        try {
          await upload(file, {
            bucket: filterBucket === "videos" ? "videos" : "media",
            contentType: filterContentType || "general",
          });
          toast({
            title: "Upload successful",
            description: `${file.name} has been uploaded`,
          });
        } catch (err) {
          toast({
            title: "Upload failed",
            description: `Failed to upload ${file.name}`,
            variant: "destructive",
          });
        }
      }
      refetch();
    },
    [upload, filterBucket, filterContentType, toast, refetch]
  );

  // Handle selection
  const handleSelect = useCallback(
    (asset: MediaAsset) => {
      if (selectionMode === "none") return;

      if (selectionMode === "single") {
        setSelectedAssets(new Set([asset.id]));
        onSelect?.(asset);
      } else {
        setSelectedAssets((prev) => {
          const next = new Set(prev);
          if (next.has(asset.id)) {
            next.delete(asset.id);
          } else {
            next.add(asset.id);
          }
          return next;
        });
      }
    },
    [selectionMode, onSelect]
  );

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!assetToDelete) return;

    try {
      await deleteAsset.mutateAsync(assetToDelete);
      toast({
        title: "Asset deleted",
        description: "The media asset has been deleted",
      });
      setDeleteConfirmOpen(false);
      setAssetToDelete(null);
    } catch (err) {
      toast({
        title: "Delete failed",
        description: "Failed to delete the asset",
        variant: "destructive",
      });
    }
  }, [assetToDelete, deleteAsset, toast]);

  // Handle update
  const handleUpdate = useCallback(
    async (updates: { alt_text?: string; title?: string; description?: string }) => {
      if (!editingAsset) return;

      try {
        await updateAsset.mutateAsync({
          id: editingAsset.id,
          updates,
        });
        toast({
          title: "Asset updated",
          description: "The media asset has been updated",
        });
        setEditingAsset(null);
      } catch (err) {
        toast({
          title: "Update failed",
          description: "Failed to update the asset",
          variant: "destructive",
        });
      }
    },
    [editingAsset, updateAsset, toast]
  );

  // Copy URL to clipboard
  const copyUrl = useCallback(
    (url: string) => {
      navigator.clipboard.writeText(url);
      toast({
        title: "URL copied",
        description: "The URL has been copied to your clipboard",
      });
    },
    [toast]
  );

  return (
    <div className={cn("space-y-4", className)}>
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalAssets}</p>
                  <p className="text-sm text-muted-foreground">Total Assets</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{formatBytes(stats.totalSize)}</p>
                  <p className="text-sm text-muted-foreground">Total Size</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.optimized}</p>
                  <p className="text-sm text-muted-foreground">Optimized</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search media..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filters */}
        <Select
          value={filters.bucket || "all"}
          onValueChange={(value) =>
            setFilters((prev) => ({ ...prev, bucket: value === "all" ? undefined : value, page: 1 }))
          }
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All buckets" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Buckets</SelectItem>
            <SelectItem value="media">Media</SelectItem>
            <SelectItem value="videos">Videos</SelectItem>
            <SelectItem value="event-photos">Event Photos</SelectItem>
            <SelectItem value="ad-creatives">Ad Creatives</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.sortBy || "created_at"}
          onValueChange={(value) =>
            setFilters((prev) => ({ ...prev, sortBy: value as MediaFilters["sortBy"] }))
          }
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at">Date Added</SelectItem>
            <SelectItem value="file_size">File Size</SelectItem>
            <SelectItem value="views_count">Views</SelectItem>
            <SelectItem value="title">Title</SelectItem>
          </SelectContent>
        </Select>

        {/* View toggle */}
        <div className="flex border rounded-md">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("grid")}
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>

        {/* Upload button */}
        <label>
          <Button disabled={isUploading}>
            <Upload className="h-4 w-4 mr-2" />
            {isUploading ? "Uploading..." : "Upload"}
          </Button>
          <input
            type="file"
            className="hidden"
            multiple
            accept="image/*,video/*"
            onChange={handleFileUpload}
          />
        </label>

        {/* Refresh */}
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className={cn(
          viewMode === "grid"
            ? "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4"
            : "space-y-2"
        )}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className={viewMode === "grid" ? "aspect-square" : "h-16"} />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
            <p className="text-destructive">Failed to load media library</p>
            <Button variant="outline" onClick={() => refetch()} className="mt-2">
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Media grid/list */}
      {data && (
        <>
          {data.assets.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <ImageIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">No media found</h3>
                <p className="text-muted-foreground mb-4">
                  Upload some files to get started
                </p>
                <label>
                  <Button>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Files
                  </Button>
                  <input
                    type="file"
                    className="hidden"
                    multiple
                    accept="image/*,video/*"
                    onChange={handleFileUpload}
                  />
                </label>
              </CardContent>
            </Card>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {data.assets.map((asset) => (
                <Card
                  key={asset.id}
                  className={cn(
                    "group cursor-pointer transition-all hover:ring-2 hover:ring-primary",
                    selectedAssets.has(asset.id) && "ring-2 ring-primary"
                  )}
                  onClick={() => handleSelect(asset)}
                >
                  <div className="relative aspect-square">
                    {asset.mime_type.startsWith("image/") ? (
                      <OptimizedImage
                        src={asset.public_url || ""}
                        alt={asset.alt_text || asset.title || "Media"}
                        className="rounded-t-lg object-cover"
                        aspectRatio="1/1"
                      />
                    ) : asset.mime_type.startsWith("video/") ? (
                      <div className="w-full h-full bg-muted rounded-t-lg flex items-center justify-center">
                        <Video className="h-12 w-12 text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="w-full h-full bg-muted rounded-t-lg flex items-center justify-center">
                        {getFileIcon(asset.mime_type)}
                      </div>
                    )}

                    {/* Selection checkbox */}
                    {selectionMode !== "none" && (
                      <div className="absolute top-2 left-2">
                        <Checkbox
                          checked={selectedAssets.has(asset.id)}
                          onCheckedChange={() => handleSelect(asset)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    )}

                    {/* Actions */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="secondary" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingAsset(asset);
                            }}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              copyUrl(asset.public_url || "");
                            }}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy URL
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(asset.public_url, "_blank");
                            }}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAssetToDelete(asset.id);
                              setDeleteConfirmOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <CardContent className="p-2">
                    <p className="text-sm font-medium truncate">{asset.title || asset.original_file_name}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatBytes(asset.file_size)}</span>
                      <StatusBadge status={asset.processing_status} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {data.assets.map((asset) => (
                <Card
                  key={asset.id}
                  className={cn(
                    "cursor-pointer transition-all hover:bg-accent",
                    selectedAssets.has(asset.id) && "ring-2 ring-primary"
                  )}
                  onClick={() => handleSelect(asset)}
                >
                  <CardContent className="p-3 flex items-center gap-4">
                    {selectionMode !== "none" && (
                      <Checkbox
                        checked={selectedAssets.has(asset.id)}
                        onCheckedChange={() => handleSelect(asset)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <div className="w-12 h-12 rounded overflow-hidden flex-shrink-0">
                      {asset.mime_type.startsWith("image/") ? (
                        <OptimizedImage
                          src={asset.public_url || ""}
                          alt={asset.title || asset.original_file_name || "Media asset"}
                          className="object-cover"
                          width={48}
                          height={48}
                        />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          {getFileIcon(asset.mime_type)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{asset.title || asset.original_file_name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{formatBytes(asset.file_size)}</span>
                        <span>•</span>
                        <span>{formatDate(asset.created_at)}</span>
                        {asset.width && asset.height && (
                          <>
                            <span>•</span>
                            <span>{asset.width}×{asset.height}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <StatusBadge status={asset.processing_status} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingAsset(asset)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyUrl(asset.public_url || "")}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy URL
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => window.open(asset.public_url, "_blank")}>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            setAssetToDelete(asset.id);
                            setDeleteConfirmOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(filters.page! - 1) * filters.pageSize! + 1} - {Math.min(filters.page! * filters.pageSize!, data.total)} of {data.total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page === 1}
                  onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm">
                  Page {filters.page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page === totalPages}
                  onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingAsset} onOpenChange={() => setEditingAsset(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Media Details</DialogTitle>
          </DialogHeader>
          {editingAsset && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                handleUpdate({
                  title: formData.get("title") as string,
                  alt_text: formData.get("alt_text") as string,
                  description: formData.get("description") as string,
                });
              }}
              className="space-y-4"
            >
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  name="title"
                  defaultValue={editingAsset.title || ""}
                />
              </div>
              <div>
                <Label htmlFor="alt_text">Alt Text</Label>
                <Input
                  id="alt_text"
                  name="alt_text"
                  defaultValue={editingAsset.alt_text || ""}
                  placeholder="Describe the image for accessibility"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={editingAsset.description || ""}
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingAsset(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateAsset.isPending}>
                  {updateAsset.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Media</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this media? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteAsset.isPending}
            >
              {deleteAsset.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MediaLibrary;
