import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  DollarSign,
  Calendar,
  Building,
  MoreHorizontal,
  Check,
  X,
  ChevronRight,
} from 'lucide-react';
import {
  useCrmPipelineStages,
  useCrmDealsByStage,
  useCrmDealMutations,
  useCrmDealStats,
} from '@/hooks/useCrmDeals';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { format } from 'date-fns';
import type { CrmDeal, CrmPipelineStage } from '@/types/crm';

export function CrmPipeline() {
  const { data: stages, isLoading: stagesLoading } = useCrmPipelineStages();
  const { data: dealsByStage, isLoading: dealsLoading } = useCrmDealsByStage();
  const { data: stats } = useCrmDealStats();
  const { moveDealToStage, closeDeal } = useCrmDealMutations();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedStage, setSelectedStage] = useState<CrmPipelineStage | null>(null);

  const isLoading = stagesLoading || dealsLoading;

  if (isLoading) {
    return <PipelineSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Pipeline Value</div>
            <div className="text-2xl font-bold">${(stats?.pipeline_value || 0).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Open Deals</div>
            <div className="text-2xl font-bold">{stats?.open || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Won This Month</div>
            <div className="text-2xl font-bold text-green-600">
              ${(stats?.won_value_this_month || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Win Rate</div>
            <div className="text-2xl font-bold">{(stats?.win_rate || 0).toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages?.map((stage) => {
          const stageDeals = dealsByStage?.[stage.id] || [];
          const stageValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0);

          return (
            <div key={stage.id} className="flex-shrink-0 w-80">
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                      <CardTitle className="text-base">{stage.name}</CardTitle>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {stageDeals.length}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    ${stageValue.toLocaleString()}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 min-h-[300px]">
                  {stageDeals.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      stages={stages}
                      currentStageIndex={stages.findIndex(s => s.id === stage.id)}
                      onMoveToStage={(stageId) => moveDealToStage.mutate({ dealId: deal.id, stageId })}
                      onClose={(status, reason) => closeDeal.mutate({ dealId: deal.id, status, reason })}
                    />
                  ))}

                  <Button
                    variant="ghost"
                    className="w-full justify-start text-muted-foreground"
                    onClick={() => {
                      setSelectedStage(stage);
                      setShowCreateDialog(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Deal
                  </Button>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      <CreateDealDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        defaultStageId={selectedStage?.id}
      />
    </div>
  );
}

interface DealCardProps {
  deal: CrmDeal & {
    contact?: { id: string; email: string; first_name: string; last_name: string; company: string };
    stage?: CrmPipelineStage;
  };
  stages: CrmPipelineStage[];
  currentStageIndex: number;
  onMoveToStage: (stageId: string) => void;
  onClose: (status: 'won' | 'lost', reason?: string) => void;
}

function DealCard({ deal, stages, currentStageIndex, onMoveToStage, onClose }: DealCardProps) {
  const nextStage = stages[currentStageIndex + 1];
  const prevStage = stages[currentStageIndex - 1];

  return (
    <Card className="bg-white border shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-3">
        <div className="flex items-start justify-between mb-2">
          <h4 className="font-medium text-sm line-clamp-1">{deal.title}</h4>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {prevStage && (
                <DropdownMenuItem onClick={() => onMoveToStage(prevStage.id)}>
                  <ChevronRight className="mr-2 h-4 w-4 rotate-180" />
                  Move to {prevStage.name}
                </DropdownMenuItem>
              )}
              {nextStage && (
                <DropdownMenuItem onClick={() => onMoveToStage(nextStage.id)}>
                  <ChevronRight className="mr-2 h-4 w-4" />
                  Move to {nextStage.name}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-green-600"
                onClick={() => onClose('won')}
              >
                <Check className="mr-2 h-4 w-4" />
                Mark as Won
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600"
                onClick={() => onClose('lost')}
              >
                <X className="mr-2 h-4 w-4" />
                Mark as Lost
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {deal.contact && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
            <Building className="h-3 w-3" />
            <span>{deal.contact.company || `${deal.contact.first_name} ${deal.contact.last_name}`}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-green-600">
            <DollarSign className="h-3 w-3" />
            <span>{deal.value.toLocaleString()}</span>
          </div>
          {deal.expected_close_date && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{format(new Date(deal.expected_close_date), 'MMM d')}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface CreateDealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStageId?: string;
}

function CreateDealDialog({ open, onOpenChange, defaultStageId }: CreateDealDialogProps) {
  const { data: stages } = useCrmPipelineStages();
  const { data: contactsData } = useCrmContacts({ per_page: 100 });
  const { createDeal } = useCrmDealMutations();

  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [contactId, setContactId] = useState('');
  const [stageId, setStageId] = useState(defaultStageId || '');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !contactId || !stageId) return;

    await createDeal.mutateAsync({
      title,
      value: value ? parseFloat(value) : 0,
      contact_id: contactId,
      stage_id: stageId,
      expected_close_date: expectedCloseDate || undefined,
      description: description || undefined,
    });

    // Reset form
    setTitle('');
    setValue('');
    setContactId('');
    setExpectedCloseDate('');
    setDescription('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Deal</DialogTitle>
            <DialogDescription>
              Add a new deal to your sales pipeline.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Deal Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Premium Advertising Package"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contact">Contact *</Label>
                <Select value={contactId} onValueChange={setContactId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select contact" />
                  </SelectTrigger>
                  <SelectContent>
                    {contactsData?.contacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.first_name} {contact.last_name}
                        {contact.company && ` (${contact.company})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="stage">Stage *</Label>
                <Select value={stageId} onValueChange={setStageId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages?.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="value">Deal Value ($)</Label>
                <Input
                  id="value"
                  type="number"
                  min="0"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="closeDate">Expected Close Date</Label>
                <Input
                  id="closeDate"
                  type="date"
                  value={expectedCloseDate}
                  onChange={(e) => setExpectedCloseDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional details about this deal..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createDeal.isPending}>
              {createDeal.isPending ? 'Creating...' : 'Create Deal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PipelineSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>

      <div className="flex gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="w-80 flex-shrink-0">
            <Card>
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-16" />
              </CardHeader>
              <CardContent className="space-y-2">
                {[...Array(3)].map((_, j) => (
                  <Skeleton key={j} className="h-24" />
                ))}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
