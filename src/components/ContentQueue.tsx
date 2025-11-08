/**
 * Content Queue Component
 * Approval queue for content submissions
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  User,
  Calendar,
  ThumbsUp,
  ThumbsDown,
  Eye,
  Zap,
  AlertTriangle
} from 'lucide-react';
import { useContentQueue, QueueItem } from '@/hooks/useContentQueue';
import { format } from 'date-fns';
import { useAdminAuth } from '@/hooks/useAdminAuth';

export function ContentQueue() {
  const { user } = useAdminAuth();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [contentTypeFilter, setContentTypeFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const {
    queueItems,
    isLoading,
    stats,
    approveItem,
    rejectItem,
    bulkApproveHighConfidence
  } = useContentQueue({
    status: statusFilter,
    contentType: contentTypeFilter
  });

  const handleApprove = async (item: QueueItem) => {
    if (!user) return;

    await approveItem.mutateAsync({
      queueId: item.id,
      reviewerId: user.id,
      publishImmediately: true
    });
  };

  const handleReject = async (item: QueueItem) => {
    if (!user) return;

    setSelectedItem(item);
    setShowRejectDialog(true);
  };

  const confirmReject = async () => {
    if (!user || !selectedItem) return;

    await rejectItem.mutateAsync({
      queueId: selectedItem.id,
      reviewerId: user.id,
      reason: rejectionReason
    });

    setShowRejectDialog(false);
    setRejectionReason('');
    setSelectedItem(null);
  };

  const handleBulkApprove = async () => {
    if (!user) return;

    if (!confirm(`This will auto-approve all items with 95%+ confidence. Continue?`)) {
      return;
    }

    await bulkApproveHighConfidence.mutateAsync({
      reviewerId: user.id,
      minConfidence: 95
    });
  };

  const getConfidenceBadge = (score: number) => {
    if (score >= 90) {
      return <Badge variant="default" className="bg-green-600">High: {score}%</Badge>;
    } else if (score >= 70) {
      return <Badge variant="secondary">Medium: {score}%</Badge>;
    } else {
      return <Badge variant="destructive">Low: {score}%</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      pending: { variant: 'default', icon: Clock },
      approved: { variant: 'default', icon: CheckCircle, className: 'bg-green-600' },
      rejected: { variant: 'destructive', icon: XCircle },
      needs_review: { variant: 'secondary', icon: AlertCircle }
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className={config.className}>
        <Icon className="h-3 w-3 mr-1" />
        {status.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const renderContentPreview = (item: QueueItem) => {
    const data = item.content_data;

    switch (item.content_type) {
      case 'event':
        return (
          <div className="text-sm">
            <p className="font-medium">{data.title}</p>
            <p className="text-muted-foreground">
              {data.venue} • {data.location}
            </p>
            <p className="text-muted-foreground">
              {data.date ? format(new Date(data.date), 'MMM dd, yyyy') : 'No date'}
            </p>
          </div>
        );

      case 'restaurant':
        return (
          <div className="text-sm">
            <p className="font-medium">{data.name}</p>
            <p className="text-muted-foreground">
              {data.cuisine} • {data.location}
            </p>
          </div>
        );

      case 'attraction':
        return (
          <div className="text-sm">
            <p className="font-medium">{data.name}</p>
            <p className="text-muted-foreground">
              {data.type} • {data.location}
            </p>
          </div>
        );

      case 'playground':
        return (
          <div className="text-sm">
            <p className="font-medium">{data.name}</p>
            <p className="text-muted-foreground">{data.location}</p>
          </div>
        );

      default:
        return <p className="text-sm">No preview available</p>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total Items</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent" onClick={() => setStatusFilter('pending')}>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Pending Review</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent" onClick={() => setStatusFilter('needs_review')}>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">{stats.needsReview}</div>
            <p className="text-xs text-muted-foreground">Needs Manual Review</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{stats.highConfidence}</div>
            <p className="text-xs text-muted-foreground">High Confidence (≥90%)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{stats.lowConfidence}</div>
            <p className="text-xs text-muted-foreground">Low Confidence (&lt;70%)</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Queue */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Content Approval Queue</CardTitle>
              <CardDescription>
                Review and approve submitted content
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleBulkApprove}
                disabled={stats.highConfidence === 0 || bulkApproveHighConfidence.isPending}
              >
                <Zap className="h-4 w-4 mr-2" />
                Auto-Approve High Confidence ({stats.highConfidence})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-4 mb-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="needs_review">Needs Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>

            <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="event">Events</SelectItem>
                <SelectItem value="restaurant">Restaurants</SelectItem>
                <SelectItem value="attraction">Attractions</SelectItem>
                <SelectItem value="playground">Playgrounds</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Queue Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitter</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading queue...
                    </TableCell>
                  </TableRow>
                ) : queueItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No items in queue
                    </TableCell>
                  </TableRow>
                ) : (
                  queueItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {format(new Date(item.submitted_at), 'MMM dd, HH:mm')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {item.content_type}
                        </Badge>
                      </TableCell>
                      <TableCell>{renderContentPreview(item)}</TableCell>
                      <TableCell>{getConfidenceBadge(item.confidence_score)}</TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {item.submitter_email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {(item.status === 'pending' || item.status === 'needs_review') && (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleApprove(item)}
                                disabled={approveItem.isPending}
                              >
                                <ThumbsUp className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleReject(item)}
                                disabled={rejectItem.isPending}
                              >
                                <ThumbsDown className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedItem(item)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
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

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Content</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this content (optional)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Reason for rejection..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmReject}>
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={!!selectedItem && !showRejectDialog} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Content Details</DialogTitle>
            <DialogDescription className="capitalize">
              {selectedItem?.content_type} submission
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Confidence Score</p>
                  <p>{getConfidenceBadge(selectedItem.confidence_score)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Status</p>
                  <p>{getStatusBadge(selectedItem.status)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Submitted</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(selectedItem.submitted_at), 'PPpp')}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Submitter</p>
                  <p className="text-sm text-muted-foreground">{selectedItem.submitter_email}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Validation Issues</p>
                <div className="space-y-2">
                  {selectedItem.validation_results && selectedItem.validation_results.length > 0 ? (
                    selectedItem.validation_results.map((result: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-2 text-sm p-2 border rounded">
                        {result.severity === 'error' ? (
                          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />
                        ) : result.severity === 'warning' ? (
                          <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5" />
                        )}
                        <div>
                          <p className="font-medium">{result.field}</p>
                          <p className="text-muted-foreground">{result.message}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No validation issues</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Content Data</p>
                <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96">
                  {JSON.stringify(selectedItem.content_data, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
