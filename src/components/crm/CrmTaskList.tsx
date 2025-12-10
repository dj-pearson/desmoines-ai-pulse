import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
  CheckSquare,
  MoreHorizontal,
  Edit,
  Trash2,
  Calendar,
  AlertCircle,
  Clock,
} from 'lucide-react';
import {
  useCrmTasks,
  useCrmMyTasks,
  useCrmOverdueTasks,
  useCrmTaskMutations,
  getTaskPriorityColor,
  getTaskStatusColor,
} from '@/hooks/useCrmTasks';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { format, isPast, isToday } from 'date-fns';
import type { CrmTask, CrmTaskInput, CrmTaskPriority, CrmTaskStatus } from '@/types/crm';

interface CrmTaskListProps {
  tasks?: CrmTask[];
  compact?: boolean;
  contactId?: string;
  dealId?: string;
}

export function CrmTaskList({ tasks: propTasks, compact = false, contactId, dealId }: CrmTaskListProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<CrmTask | null>(null);
  const [filter, setFilter] = useState<'all' | 'my' | 'overdue'>('all');

  const { data: allTasksData, isLoading: allLoading } = useCrmTasks(
    propTasks ? undefined : { contact_id: contactId, deal_id: dealId, status: ['pending', 'in_progress'] }
  );
  const { data: myTasks, isLoading: myLoading } = useCrmMyTasks();
  const { data: overdueTasks, isLoading: overdueLoading } = useCrmOverdueTasks();
  const { completeTask, deleteTask } = useCrmTaskMutations();

  const isLoading = !propTasks && (allLoading || myLoading || overdueLoading);

  // Determine which tasks to show
  let tasks: (CrmTask & { contact?: { id: string; email: string; first_name: string; last_name: string } | null })[] = [];
  if (propTasks) {
    tasks = propTasks as typeof tasks;
  } else if (filter === 'my') {
    tasks = myTasks || [];
  } else if (filter === 'overdue') {
    tasks = overdueTasks || [];
  } else {
    tasks = allTasksData?.tasks || [];
  }

  const handleComplete = async (task: CrmTask) => {
    await completeTask.mutateAsync(task.id);
  };

  const handleDelete = async (task: CrmTask) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      await deleteTask.mutateAsync(task.id);
    }
  };

  if (isLoading) {
    return <TaskListSkeleton compact={compact} />;
  }

  if (compact) {
    // Compact view for dashboard
    return (
      <div className="space-y-2">
        {tasks.slice(0, 5).map((task) => (
          <CompactTaskItem
            key={task.id}
            task={task}
            onComplete={handleComplete}
          />
        ))}
        {tasks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No tasks
          </p>
        )}
        {tasks.length > 5 && (
          <p className="text-xs text-muted-foreground text-center">
            +{tasks.length - 5} more tasks
          </p>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Tasks
          </CardTitle>
          <div className="flex items-center gap-2">
            {!propTasks && (
              <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tasks</SelectItem>
                  <SelectItem value="my">My Tasks</SelectItem>
                  <SelectItem value="overdue">
                    <span className="flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 text-red-500" />
                      Overdue
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Task
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onComplete={handleComplete}
              onEdit={setEditingTask}
              onDelete={handleDelete}
            />
          ))}

          {tasks.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <CheckSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No tasks yet</p>
              <Button
                variant="link"
                onClick={() => setShowCreateDialog(true)}
                className="mt-2"
              >
                Create your first task
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      <TaskDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        defaultContactId={contactId}
        defaultDealId={dealId}
      />

      <TaskDialog
        open={!!editingTask}
        onOpenChange={(open) => !open && setEditingTask(null)}
        task={editingTask || undefined}
      />
    </Card>
  );
}

interface TaskItemProps {
  task: CrmTask & { contact?: { id: string; email: string; first_name: string; last_name: string } | null; deal?: { id: string; title: string } | null };
  onComplete: (task: CrmTask) => void;
  onEdit: (task: CrmTask) => void;
  onDelete: (task: CrmTask) => void;
}

function TaskItem({ task, onComplete, onEdit, onDelete }: TaskItemProps) {
  const isOverdue = task.due_date && isPast(new Date(task.due_date)) && task.status !== 'completed';
  const isDueToday = task.due_date && isToday(new Date(task.due_date));

  return (
    <div className={`flex items-start gap-3 p-3 border rounded-lg ${isOverdue ? 'border-red-200 bg-red-50' : ''}`}>
      <Checkbox
        checked={task.status === 'completed'}
        onCheckedChange={() => onComplete(task)}
        className="mt-1"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-medium ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
            {task.title}
          </span>
          <Badge className={getTaskPriorityColor(task.priority)} variant="secondary">
            {task.priority}
          </Badge>
        </div>

        {task.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
            {task.description}
          </p>
        )}

        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          {task.due_date && (
            <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-600' : isDueToday ? 'text-orange-600' : ''}`}>
              {isOverdue ? (
                <AlertCircle className="h-3 w-3" />
              ) : (
                <Calendar className="h-3 w-3" />
              )}
              {isOverdue ? 'Overdue: ' : isDueToday ? 'Due today: ' : ''}
              {format(new Date(task.due_date), 'MMM d')}
            </span>
          )}

          {task.contact && (
            <span>
              {task.contact.first_name} {task.contact.last_name}
            </span>
          )}

          {task.deal && (
            <span>Deal: {task.deal.title}</span>
          )}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(task)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-red-600"
            onClick={() => onDelete(task)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function CompactTaskItem({ task, onComplete }: { task: CrmTask; onComplete: (task: CrmTask) => void }) {
  const isOverdue = task.due_date && isPast(new Date(task.due_date)) && task.status !== 'completed';

  return (
    <div className="flex items-center gap-2 text-sm">
      <Checkbox
        checked={task.status === 'completed'}
        onCheckedChange={() => onComplete(task)}
        className="h-4 w-4"
      />
      <span className={`flex-1 truncate ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
        {task.title}
      </span>
      {task.due_date && (
        <span className={`text-xs ${isOverdue ? 'text-red-600' : 'text-muted-foreground'}`}>
          {format(new Date(task.due_date), 'MMM d')}
        </span>
      )}
    </div>
  );
}

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: CrmTask;
  defaultContactId?: string;
  defaultDealId?: string;
}

function TaskDialog({ open, onOpenChange, task, defaultContactId, defaultDealId }: TaskDialogProps) {
  const { createTask, updateTask } = useCrmTaskMutations();
  const { data: contactsData } = useCrmContacts({ per_page: 100 });
  const isEditing = !!task;

  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [contactId, setContactId] = useState(task?.contact_id || defaultContactId || '');
  const [dueDate, setDueDate] = useState(task?.due_date ? task.due_date.split('T')[0] : '');
  const [priority, setPriority] = useState<CrmTaskPriority>(task?.priority || 'medium');
  const [status, setStatus] = useState<CrmTaskStatus>(task?.status || 'pending');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const input: CrmTaskInput = {
      title,
      description: description || undefined,
      contact_id: contactId || undefined,
      deal_id: defaultDealId || undefined,
      due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
      priority,
      status,
    };

    if (isEditing && task) {
      await updateTask.mutateAsync({ id: task.id, ...input });
    } else {
      await createTask.mutateAsync(input);
    }

    // Reset form
    setTitle('');
    setDescription('');
    setContactId(defaultContactId || '');
    setDueDate('');
    setPriority('medium');
    setStatus('pending');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Task' : 'Create Task'}</DialogTitle>
            <DialogDescription>
              {isEditing ? 'Update the task details.' : 'Add a new task to follow up on.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Task Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Follow up call"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional details..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contact">Contact</Label>
                <Select value={contactId} onValueChange={setContactId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select contact" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {contactsData?.contacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.first_name} {contact.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as CrmTaskPriority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isEditing && (
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as CrmTaskStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTask.isPending || updateTask.isPending}>
              {createTask.isPending || updateTask.isPending
                ? 'Saving...'
                : isEditing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TaskListSkeleton({ compact = false }: { compact?: boolean }) {
  const count = compact ? 5 : 8;

  return (
    <div className="space-y-2">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-4 w-4" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            {!compact && <Skeleton className="h-3 w-full" />}
          </div>
        </div>
      ))}
    </div>
  );
}
