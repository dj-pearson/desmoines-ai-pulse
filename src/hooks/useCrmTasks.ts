import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { CrmTask, CrmTaskInput, CrmTaskPriority, CrmTaskStatus } from '@/types/crm';

const CRM_TASKS_KEY = 'crm-tasks';

interface CrmTaskFilters {
  contact_id?: string;
  deal_id?: string;
  assigned_to?: string;
  status?: CrmTaskStatus | CrmTaskStatus[];
  priority?: CrmTaskPriority | CrmTaskPriority[];
  due_before?: string;
  due_after?: string;
  page?: number;
  per_page?: number;
}

export function useCrmTasks(filters?: CrmTaskFilters) {
  return useQuery({
    queryKey: [CRM_TASKS_KEY, filters],
    queryFn: async () => {
      let query = supabase
        .from('crm_tasks')
        .select(`
          *,
          contact:crm_contacts(id, email, first_name, last_name),
          deal:crm_deals(id, title)
        `);

      if (filters?.contact_id) {
        query = query.eq('contact_id', filters.contact_id);
      }

      if (filters?.deal_id) {
        query = query.eq('deal_id', filters.deal_id);
      }

      if (filters?.assigned_to) {
        query = query.eq('assigned_to', filters.assigned_to);
      }

      if (filters?.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        query = query.in('status', statuses);
      }

      if (filters?.priority) {
        const priorities = Array.isArray(filters.priority) ? filters.priority : [filters.priority];
        query = query.in('priority', priorities);
      }

      if (filters?.due_before) {
        query = query.lte('due_date', filters.due_before);
      }

      if (filters?.due_after) {
        query = query.gte('due_date', filters.due_after);
      }

      query = query.order('due_date', { ascending: true, nullsFirst: false });

      // Pagination
      const page = filters?.page || 1;
      const perPage = filters?.per_page || 25;
      const from = (page - 1) * perPage;
      const to = from + perPage - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        tasks: data as (CrmTask & {
          contact: { id: string; email: string; first_name: string; last_name: string } | null;
          deal: { id: string; title: string } | null;
        })[],
        total: count || 0,
        page,
        perPage,
      };
    },
  });
}

export function useCrmMyTasks() {
  const { user } = useAuth();

  return useQuery({
    queryKey: [CRM_TASKS_KEY, 'my', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('crm_tasks')
        .select(`
          *,
          contact:crm_contacts(id, email, first_name, last_name),
          deal:crm_deals(id, title)
        `)
        .eq('assigned_to', user.id)
        .in('status', ['pending', 'in_progress'])
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
}

export function useCrmOverdueTasks() {
  return useQuery({
    queryKey: [CRM_TASKS_KEY, 'overdue'],
    queryFn: async () => {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('crm_tasks')
        .select(`
          *,
          contact:crm_contacts(id, email, first_name, last_name),
          deal:crm_deals(id, title)
        `)
        .lt('due_date', now)
        .in('status', ['pending', 'in_progress'])
        .order('due_date', { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}

export function useCrmUpcomingTasks(days = 7) {
  return useQuery({
    queryKey: [CRM_TASKS_KEY, 'upcoming', days],
    queryFn: async () => {
      const now = new Date();
      const future = new Date();
      future.setDate(future.getDate() + days);

      const { data, error } = await supabase
        .from('crm_tasks')
        .select(`
          *,
          contact:crm_contacts(id, email, first_name, last_name),
          deal:crm_deals(id, title)
        `)
        .gte('due_date', now.toISOString())
        .lte('due_date', future.toISOString())
        .in('status', ['pending', 'in_progress'])
        .order('due_date', { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}

export function useCrmContactTasks(contactId: string | undefined) {
  return useQuery({
    queryKey: [CRM_TASKS_KEY, 'contact', contactId],
    queryFn: async () => {
      if (!contactId) return [];

      const { data, error } = await supabase
        .from('crm_tasks')
        .select('*')
        .eq('contact_id', contactId)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data as CrmTask[];
    },
    enabled: !!contactId,
  });
}

export function useCrmDealTasks(dealId: string | undefined) {
  return useQuery({
    queryKey: [CRM_TASKS_KEY, 'deal', dealId],
    queryFn: async () => {
      if (!dealId) return [];

      const { data, error } = await supabase
        .from('crm_tasks')
        .select('*')
        .eq('deal_id', dealId)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data as CrmTask[];
    },
    enabled: !!dealId,
  });
}

export function useCrmTaskMutations() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const createTask = useMutation({
    mutationFn: async (input: CrmTaskInput) => {
      const { data, error } = await supabase
        .from('crm_tasks')
        .insert({
          ...input,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Add activity if linked to a contact
      if (input.contact_id) {
        await supabase.rpc('add_crm_activity', {
          p_contact_id: input.contact_id,
          p_activity_type: 'task',
          p_title: `Task created: ${input.title}`,
          p_deal_id: input.deal_id || null,
          p_metadata: { task_id: data.id, priority: input.priority },
        });
      }

      return data as CrmTask;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CRM_TASKS_KEY] });
      toast({
        title: 'Task created',
        description: 'The task has been created successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error creating task',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...input }: Partial<CrmTaskInput> & { id: string }) => {
      const { data, error } = await supabase
        .from('crm_tasks')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as CrmTask;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CRM_TASKS_KEY] });
      toast({
        title: 'Task updated',
        description: 'The task has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error updating task',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const completeTask = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('crm_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: user?.id,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as CrmTask;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CRM_TASKS_KEY] });
      toast({
        title: 'Task completed',
        description: 'The task has been marked as completed.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error completing task',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('crm_tasks')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CRM_TASKS_KEY] });
      toast({
        title: 'Task deleted',
        description: 'The task has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error deleting task',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    createTask,
    updateTask,
    completeTask,
    deleteTask,
  };
}

export function useCrmTaskStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: [CRM_TASKS_KEY, 'stats', user?.id],
    queryFn: async () => {
      const now = new Date().toISOString();

      const { data: tasks, error } = await supabase
        .from('crm_tasks')
        .select('status, priority, due_date, assigned_to');

      if (error) throw error;

      const myTasks = tasks?.filter(t => t.assigned_to === user?.id) || [];
      const overdue = tasks?.filter(t =>
        t.due_date && t.due_date < now && ['pending', 'in_progress'].includes(t.status)
      ) || [];

      const byStatus: Record<string, number> = {};
      const byPriority: Record<string, number> = {};

      tasks?.forEach(t => {
        byStatus[t.status] = (byStatus[t.status] || 0) + 1;
        byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
      });

      return {
        total: tasks?.length || 0,
        myTasks: myTasks.length,
        overdue: overdue.length,
        byStatus,
        byPriority,
      };
    },
    enabled: !!user?.id,
  });
}

// Priority color helper
export function getTaskPriorityColor(priority: CrmTaskPriority) {
  const colors: Record<CrmTaskPriority, string> = {
    low: 'bg-gray-100 text-gray-800',
    medium: 'bg-blue-100 text-blue-800',
    high: 'bg-orange-100 text-orange-800',
    urgent: 'bg-red-100 text-red-800',
  };
  return colors[priority];
}

// Status color helper
export function getTaskStatusColor(status: CrmTaskStatus) {
  const colors: Record<CrmTaskStatus, string> = {
    pending: 'bg-gray-100 text-gray-800',
    in_progress: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };
  return colors[status];
}
