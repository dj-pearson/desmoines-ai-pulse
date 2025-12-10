import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  Users,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  Zap,
  Filter,
} from 'lucide-react';
import { useCrmSegments, useCrmSegmentMutations, useCrmSegmentContacts } from '@/hooks/useCrmSegments';
import type { CrmSegment, CrmSegmentInput, CrmSegmentType } from '@/types/crm';

export function CrmSegmentList() {
  const { data: segments, isLoading } = useCrmSegments();
  const { deleteSegment } = useCrmSegmentMutations();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingSegment, setEditingSegment] = useState<CrmSegment | null>(null);
  const [viewingSegment, setViewingSegment] = useState<CrmSegment | null>(null);

  const handleDelete = async (segment: CrmSegment) => {
    if (window.confirm(`Are you sure you want to delete "${segment.name}"?`)) {
      await deleteSegment.mutateAsync(segment.id);
    }
  };

  if (isLoading) {
    return <SegmentListSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Customer Segments</h2>
          <p className="text-sm text-muted-foreground">
            Group contacts by behavior, attributes, or custom rules
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Segment
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {segments?.map((segment) => (
          <Card key={segment.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: segment.color }}
                  />
                  <CardTitle className="text-base">{segment.name}</CardTitle>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setViewingSegment(segment)}>
                      <Eye className="mr-2 h-4 w-4" />
                      View Contacts
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditingSegment(segment)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={() => handleDelete(segment)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {segment.description && (
                <CardDescription className="line-clamp-2">
                  {segment.description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{segment.contact_count}</span>
                  <span className="text-sm text-muted-foreground">contacts</span>
                </div>
                <Badge variant={segment.segment_type === 'dynamic' ? 'default' : 'secondary'}>
                  {segment.segment_type === 'dynamic' ? (
                    <><Zap className="mr-1 h-3 w-3" />Dynamic</>
                  ) : (
                    <><Filter className="mr-1 h-3 w-3" />Static</>
                  )}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}

        {(!segments || segments.length === 0) && (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="py-8 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">No segments yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create segments to group and target your contacts
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create First Segment
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <SegmentDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />

      <SegmentDialog
        open={!!editingSegment}
        onOpenChange={(open) => !open && setEditingSegment(null)}
        segment={editingSegment || undefined}
      />

      <SegmentContactsDialog
        open={!!viewingSegment}
        onOpenChange={(open) => !open && setViewingSegment(null)}
        segment={viewingSegment || undefined}
      />
    </div>
  );
}

interface SegmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segment?: CrmSegment;
}

function SegmentDialog({ open, onOpenChange, segment }: SegmentDialogProps) {
  const { createSegment, updateSegment } = useCrmSegmentMutations();
  const isEditing = !!segment;

  const [name, setName] = useState(segment?.name || '');
  const [description, setDescription] = useState(segment?.description || '');
  const [segmentType, setSegmentType] = useState<CrmSegmentType>(segment?.segment_type || 'static');
  const [color, setColor] = useState(segment?.color || '#6366f1');

  // Dynamic segment rules
  const [ruleField, setRuleField] = useState('lead_score');
  const [ruleOperator, setRuleOperator] = useState('>=');
  const [ruleValue, setRuleValue] = useState('50');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const input: CrmSegmentInput = {
      name,
      description: description || undefined,
      segment_type: segmentType,
      color,
      rules: segmentType === 'dynamic' ? {
        operator: 'AND',
        conditions: [{
          field: ruleField,
          operator: ruleOperator as '=' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'not_contains' | 'in' | 'not_in',
          value: ruleField === 'lead_score' ? parseInt(ruleValue) : ruleValue,
        }],
      } : undefined,
    };

    if (isEditing && segment) {
      await updateSegment.mutateAsync({ id: segment.id, ...input });
    } else {
      await createSegment.mutateAsync(input);
    }

    onOpenChange(false);
    // Reset form
    setName('');
    setDescription('');
    setSegmentType('static');
    setColor('#6366f1');
    setRuleField('lead_score');
    setRuleOperator('>=');
    setRuleValue('50');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Segment' : 'Create Segment'}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update the segment details below.'
                : 'Create a new segment to group your contacts.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Segment Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., High Value Customers"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this segment..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Segment Type</Label>
                <Select value={segmentType} onValueChange={(v) => setSegmentType(v as CrmSegmentType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="static">
                      <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        Static
                      </div>
                    </SelectItem>
                    <SelectItem value="dynamic">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Dynamic
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="color">Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="color"
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-12 h-10 p-1"
                  />
                  <Input
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            {segmentType === 'dynamic' && (
              <div className="space-y-2 p-4 border rounded-lg bg-muted/50">
                <Label>Segment Rules</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Contacts matching these rules will be automatically added
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <Select value={ruleField} onValueChange={setRuleField}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead_score">Lead Score</SelectItem>
                      <SelectItem value="status">Status</SelectItem>
                      <SelectItem value="source">Source</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={ruleOperator} onValueChange={setRuleOperator}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="=">equals</SelectItem>
                      <SelectItem value=">=">greater than or equal</SelectItem>
                      <SelectItem value="<=">less than or equal</SelectItem>
                      <SelectItem value=">">greater than</SelectItem>
                      <SelectItem value="<">less than</SelectItem>
                    </SelectContent>
                  </Select>

                  {ruleField === 'status' ? (
                    <Select value={ruleValue} onValueChange={setRuleValue}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="prospect">Prospect</SelectItem>
                        <SelectItem value="customer">Customer</SelectItem>
                        <SelectItem value="churned">Churned</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : ruleField === 'source' ? (
                    <Select value={ruleValue} onValueChange={setRuleValue}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="website">Website</SelectItem>
                        <SelectItem value="referral">Referral</SelectItem>
                        <SelectItem value="social_media">Social Media</SelectItem>
                        <SelectItem value="advertising">Advertising</SelectItem>
                        <SelectItem value="event">Event</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type="number"
                      value={ruleValue}
                      onChange={(e) => setRuleValue(e.target.value)}
                      placeholder="Value"
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createSegment.isPending || updateSegment.isPending}>
              {createSegment.isPending || updateSegment.isPending
                ? 'Saving...'
                : isEditing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface SegmentContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segment?: CrmSegment;
}

function SegmentContactsDialog({ open, onOpenChange, segment }: SegmentContactsDialogProps) {
  const { data: contacts, isLoading } = useCrmSegmentContacts(segment?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {segment?.name} - Contacts
          </DialogTitle>
          <DialogDescription>
            {segment?.contact_count} contacts in this segment
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : contacts && contacts.length > 0 ? (
            <div className="space-y-2">
              {contacts.map((contact) => (
                <div key={contact.id} className="flex items-center gap-3 p-3 border rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-sm font-medium">
                      {contact.first_name?.[0]}{contact.last_name?.[0]}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">
                      {contact.first_name} {contact.last_name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {contact.email}
                    </div>
                  </div>
                  <Badge variant="secondary">{contact.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No contacts in this segment
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SegmentListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-6 w-16" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
