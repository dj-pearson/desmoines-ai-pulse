import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  ClipboardList,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  MessageSquare,
  Eye,
  Edit,
  Send,
  Calendar,
  User,
  FileText,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createLogger } from '@/lib/logger';

const log = createLogger('ContentQueue');

interface QueueItem {
  id: string;
  article_id: string;
  submitted_by: string | null;
  assigned_reviewer: string | null;
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'changes_requested' | 'published';
  priority: number;
  notes: string | null;
  review_deadline: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  article?: {
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    category: string;
    status: string;
    created_at: string;
  };
  submitter?: {
    email: string;
    user_metadata: {
      full_name?: string;
    };
  };
  reviewer?: {
    email: string;
    user_metadata: {
      full_name?: string;
    };
  };
}

interface QueueComment {
  id: string;
  queue_item_id: string;
  user_id: string | null;
  comment: string;
  comment_type: 'general' | 'approval' | 'rejection' | 'change_request' | 'question';
  is_resolved: boolean;
  created_at: string;
  user?: {
    email: string;
    user_metadata: {
      full_name?: string;
    };
  };
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pending Review', color: 'bg-yellow-500', icon: Clock },
  in_review: { label: 'In Review', color: 'bg-blue-500', icon: Eye },
  approved: { label: 'Approved', color: 'bg-green-500', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-500', icon: XCircle },
  changes_requested: { label: 'Changes Requested', color: 'bg-orange-500', icon: AlertCircle },
  published: { label: 'Published', color: 'bg-purple-500', icon: Send },
};

const priorityLabels: Record<number, { label: string; color: string }> = {
  1: { label: 'Low', color: 'text-gray-500' },
  2: { label: 'Low', color: 'text-gray-500' },
  3: { label: 'Normal', color: 'text-blue-500' },
  4: { label: 'Normal', color: 'text-blue-500' },
  5: { label: 'Normal', color: 'text-blue-500' },
  6: { label: 'High', color: 'text-orange-500' },
  7: { label: 'High', color: 'text-orange-500' },
  8: { label: 'Urgent', color: 'text-red-500' },
  9: { label: 'Urgent', color: 'text-red-500' },
  10: { label: 'Critical', color: 'text-red-600 font-bold' },
};

export function ContentQueue() {
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [comments, setComments] = useState<QueueComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState<QueueComment['comment_type']>('general');
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');

  useEffect(() => {
    loadQueueItems();
  }, []);

  const loadQueueItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('content_queue')
        .select(`
          *,
          article:articles(id, title, slug, excerpt, category, status, created_at)
        `)
        .order('priority', { ascending: false })
        .order('submitted_at', { ascending: true });

      if (error) throw error;
      setQueueItems(data || []);
    } catch (error: any) {
      log.error('loadQueue', 'Error loading queue', { data: error });
      toast.error('Failed to load content queue');
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async (queueItemId: string) => {
    try {
      const { data, error } = await supabase
        .from('content_queue_comments')
        .select('*')
        .eq('queue_item_id', queueItemId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setComments(data || []);
    } catch (error: any) {
      log.error('loadComments', 'Error loading comments', { data: error });
    }
  };

  const handleOpenDetails = async (item: QueueItem) => {
    setSelectedItem(item);
    setIsDetailsOpen(true);
    await loadComments(item.id);
  };

  const handleStatusChange = async (newStatus: QueueItem['status']) => {
    if (!selectedItem) return;

    try {
      const { error } = await supabase
        .from('content_queue')
        .update({
          status: newStatus,
          reviewed_at: newStatus !== 'pending' && newStatus !== 'in_review' ? new Date().toISOString() : null,
        })
        .eq('id', selectedItem.id);

      if (error) throw error;

      // If approved, update article status
      if (newStatus === 'approved' && selectedItem.article) {
        await supabase
          .from('articles')
          .update({ review_status: 'approved' })
          .eq('id', selectedItem.article_id);
      }

      // If published, publish the article
      if (newStatus === 'published' && selectedItem.article) {
        await supabase
          .from('articles')
          .update({
            status: 'published',
            published_at: new Date().toISOString(),
            review_status: 'approved',
          })
          .eq('id', selectedItem.article_id);
      }

      toast.success(`Status updated to ${statusConfig[newStatus].label}`);
      loadQueueItems();
      setSelectedItem((prev) => (prev ? { ...prev, status: newStatus } : null));
    } catch (error: any) {
      log.error('updateStatus', 'Error updating status', { data: error });
      toast.error('Failed to update status');
    }
  };

  const handleAddComment = async () => {
    if (!selectedItem || !newComment.trim()) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from('content_queue_comments').insert({
        queue_item_id: selectedItem.id,
        user_id: user?.id,
        comment: newComment,
        comment_type: commentType,
      });

      if (error) throw error;

      toast.success('Comment added');
      setNewComment('');
      setCommentType('general');
      loadComments(selectedItem.id);
    } catch (error: any) {
      log.error('addComment', 'Error adding comment', { data: error });
      toast.error('Failed to add comment');
    }
  };

  const handlePriorityChange = async (priority: number) => {
    if (!selectedItem) return;

    try {
      const { error } = await supabase
        .from('content_queue')
        .update({ priority })
        .eq('id', selectedItem.id);

      if (error) throw error;

      toast.success('Priority updated');
      loadQueueItems();
      setSelectedItem((prev) => (prev ? { ...prev, priority } : null));
    } catch (error: any) {
      log.error('updatePriority', 'Error updating priority', { data: error });
      toast.error('Failed to update priority');
    }
  };

  const filterByStatus = (status: string) => {
    if (status === 'all') return queueItems;
    return queueItems.filter((item) => item.status === status);
  };

  const getStatusCounts = () => {
    const counts: Record<string, number> = {
      pending: 0,
      in_review: 0,
      approved: 0,
      changes_requested: 0,
      rejected: 0,
      published: 0,
    };
    queueItems.forEach((item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
    });
    return counts;
  };

  const statusCounts = getStatusCounts();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Content Queue
          </CardTitle>
          <CardDescription>Review and manage articles pending approval</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="bg-yellow-500/10 p-3 rounded-lg text-center">
              <div className="text-2xl font-bold text-yellow-600">{statusCounts.pending}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
            <div className="bg-blue-500/10 p-3 rounded-lg text-center">
              <div className="text-2xl font-bold text-blue-600">{statusCounts.in_review}</div>
              <div className="text-xs text-muted-foreground">In Review</div>
            </div>
            <div className="bg-orange-500/10 p-3 rounded-lg text-center">
              <div className="text-2xl font-bold text-orange-600">{statusCounts.changes_requested}</div>
              <div className="text-xs text-muted-foreground">Changes</div>
            </div>
            <div className="bg-green-500/10 p-3 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-600">{statusCounts.approved}</div>
              <div className="text-xs text-muted-foreground">Approved</div>
            </div>
            <div className="bg-red-500/10 p-3 rounded-lg text-center">
              <div className="text-2xl font-bold text-red-600">{statusCounts.rejected}</div>
              <div className="text-xs text-muted-foreground">Rejected</div>
            </div>
            <div className="bg-purple-500/10 p-3 rounded-lg text-center">
              <div className="text-2xl font-bold text-purple-600">{statusCounts.published}</div>
              <div className="text-xs text-muted-foreground">Published</div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="pending">
                Pending ({statusCounts.pending})
              </TabsTrigger>
              <TabsTrigger value="in_review">
                In Review ({statusCounts.in_review})
              </TabsTrigger>
              <TabsTrigger value="changes_requested">
                Changes ({statusCounts.changes_requested})
              </TabsTrigger>
              <TabsTrigger value="approved">
                Approved ({statusCounts.approved})
              </TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>

            {['pending', 'in_review', 'changes_requested', 'approved', 'all'].map((tab) => (
              <TabsContent key={tab} value={tab} className="space-y-4">
                {filterByStatus(tab).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No items in this queue
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filterByStatus(tab).map((item) => (
                      <div
                        key={item.id}
                        className="border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => handleOpenDetails(item)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">
                                {item.article?.title || 'Untitled Article'}
                              </span>
                              <Badge variant="outline">{item.article?.category}</Badge>
                              {item.priority >= 8 && (
                                <Badge variant="destructive">Urgent</Badge>
                              )}
                            </div>
                            {item.article?.excerpt && (
                              <p className="text-sm text-muted-foreground line-clamp-1">
                                {item.article.excerpt}
                              </p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(item.submitted_at)}
                              </span>
                              <span className={priorityLabels[item.priority]?.color || 'text-gray-500'}>
                                Priority: {priorityLabels[item.priority]?.label || 'Normal'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={`${statusConfig[item.status].color} text-white`}>
                              {statusConfig[item.status].label}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Review: {selectedItem?.article?.title}</DialogTitle>
            <DialogDescription>
              Review this article and provide feedback
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="grid gap-4">
              {/* Article Info */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{selectedItem.article?.category}</Badge>
                    <Badge className={`${statusConfig[selectedItem.status].color} text-white`}>
                      {statusConfig[selectedItem.status].label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/articles/${selectedItem.article?.slug}`}
                      target="_blank"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      <Eye className="h-3 w-3" />
                      Preview
                    </Link>
                    <Link
                      to={`/admin/articles/edit/${selectedItem.article_id}`}
                      target="_blank"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      <Edit className="h-3 w-3" />
                      Edit
                    </Link>
                  </div>
                </div>

                {selectedItem.article?.excerpt && (
                  <p className="text-sm text-muted-foreground">{selectedItem.article.excerpt}</p>
                )}

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Submitted: {formatDate(selectedItem.submitted_at)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select
                    value={selectedItem.status}
                    onValueChange={(value) => handleStatusChange(value as QueueItem['status'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending Review</SelectItem>
                      <SelectItem value="in_review">In Review</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="changes_requested">Changes Requested</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="published">Publish Now</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Priority</label>
                  <Select
                    value={selectedItem.priority.toString()}
                    onValueChange={(value) => handlePriorityChange(parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 - Low</SelectItem>
                      <SelectItem value="3">3 - Normal</SelectItem>
                      <SelectItem value="5">5 - Normal</SelectItem>
                      <SelectItem value="7">7 - High</SelectItem>
                      <SelectItem value="9">9 - Urgent</SelectItem>
                      <SelectItem value="10">10 - Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Comments Section */}
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Review Comments
                </h4>

                <ScrollArea className="h-[200px] border rounded-lg p-3">
                  {comments.length === 0 ? (
                    <div className="text-center text-muted-foreground py-4">
                      No comments yet
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {comments.map((comment) => (
                        <div key={comment.id} className="border-b pb-3 last:border-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs">
                                {(comment.user?.user_metadata?.full_name || comment.user?.email || 'U')[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">
                              {comment.user?.user_metadata?.full_name || comment.user?.email || 'Unknown'}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {comment.comment_type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(comment.created_at)}
                            </span>
                          </div>
                          <p className="text-sm pl-8">{comment.comment}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>

                {/* Add Comment */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Select
                      value={commentType}
                      onValueChange={(value) => setCommentType(value as QueueComment['comment_type'])}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="approval">Approval</SelectItem>
                        <SelectItem value="rejection">Rejection</SelectItem>
                        <SelectItem value="change_request">Change Request</SelectItem>
                        <SelectItem value="question">Question</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add your review comment..."
                      className="flex-1"
                      rows={2}
                    />
                  </div>
                  <Button onClick={handleAddComment} disabled={!newComment.trim()}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Add Comment
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ContentQueue;
