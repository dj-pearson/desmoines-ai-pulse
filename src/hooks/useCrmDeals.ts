import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  CrmDeal,
  CrmDealInput,
  CrmDealFilters,
  CrmDealPipeline,
  CrmPipelineStage,
  CrmDealStageHistory,
  CrmPipelineMetrics,
} from '@/types/crm';

const CRM_DEALS_KEY = 'crm-deals';
const CRM_PIPELINE_KEY = 'crm-pipeline';

export function useCrmPipelineStages() {
  return useQuery({
    queryKey: [CRM_PIPELINE_KEY, 'stages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_pipeline_stages')
        .select('*')
        .order('stage_order', { ascending: true });

      if (error) throw error;
      return data as CrmPipelineStage[];
    },
  });
}

export function useCrmDeals(filters?: CrmDealFilters) {
  return useQuery({
    queryKey: [CRM_DEALS_KEY, filters],
    queryFn: async () => {
      let query = supabase
        .from('crm_deals')
        .select(`
          *,
          stage:crm_pipeline_stages(*),
          contact:crm_contacts(id, email, first_name, last_name, company)
        `);

      // Apply filters
      if (filters?.search) {
        query = query.ilike('title', `%${filters.search}%`);
      }

      if (filters?.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        query = query.in('status', statuses);
      }

      if (filters?.stage_id) {
        const stageIds = Array.isArray(filters.stage_id) ? filters.stage_id : [filters.stage_id];
        query = query.in('stage_id', stageIds);
      }

      if (filters?.assigned_to) {
        query = query.eq('assigned_to', filters.assigned_to);
      }

      if (filters?.contact_id) {
        query = query.eq('contact_id', filters.contact_id);
      }

      if (filters?.min_value !== undefined) {
        query = query.gte('value', filters.min_value);
      }

      if (filters?.max_value !== undefined) {
        query = query.lte('value', filters.max_value);
      }

      if (filters?.expected_close_after) {
        query = query.gte('expected_close_date', filters.expected_close_after);
      }

      if (filters?.expected_close_before) {
        query = query.lte('expected_close_date', filters.expected_close_before);
      }

      // Sorting
      const sortBy = filters?.sort_by || 'created_at';
      const sortOrder = filters?.sort_order === 'asc' ? true : false;
      query = query.order(sortBy, { ascending: sortOrder });

      // Pagination
      const page = filters?.page || 1;
      const perPage = filters?.per_page || 25;
      const from = (page - 1) * perPage;
      const to = from + perPage - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        deals: data as (CrmDeal & { stage: CrmPipelineStage; contact: { id: string; email: string; first_name: string; last_name: string; company: string } })[],
        total: count || 0,
        page,
        perPage,
      };
    },
  });
}

export function useCrmDeal(dealId: string | undefined) {
  return useQuery({
    queryKey: [CRM_DEALS_KEY, dealId],
    queryFn: async () => {
      if (!dealId) return null;

      const { data, error } = await supabase
        .from('crm_deals')
        .select(`
          *,
          stage:crm_pipeline_stages(*),
          contact:crm_contacts(*)
        `)
        .eq('id', dealId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!dealId,
  });
}

export function useCrmDealsByStage() {
  const { data: stages } = useCrmPipelineStages();

  return useQuery({
    queryKey: [CRM_DEALS_KEY, 'by-stage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_deals')
        .select(`
          *,
          stage:crm_pipeline_stages(*),
          contact:crm_contacts(id, email, first_name, last_name, company)
        `)
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by stage
      const byStage: Record<string, typeof data> = {};
      stages?.forEach(stage => {
        byStage[stage.id] = [];
      });

      data?.forEach(deal => {
        if (byStage[deal.stage_id]) {
          byStage[deal.stage_id].push(deal);
        }
      });

      return byStage;
    },
    enabled: !!stages?.length,
  });
}

export function useCrmDealStageHistory(dealId: string | undefined) {
  return useQuery({
    queryKey: [CRM_DEALS_KEY, dealId, 'history'],
    queryFn: async () => {
      if (!dealId) return [];

      const { data, error } = await supabase
        .from('crm_deal_stage_history')
        .select(`
          *,
          from_stage:crm_pipeline_stages!crm_deal_stage_history_from_stage_id_fkey(name, color),
          to_stage:crm_pipeline_stages!crm_deal_stage_history_to_stage_id_fkey(name, color)
        `)
        .eq('deal_id', dealId)
        .order('changed_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!dealId,
  });
}

export function useCrmDealMutations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createDeal = useMutation({
    mutationFn: async (input: CrmDealInput) => {
      const { data, error } = await supabase
        .from('crm_deals')
        .insert(input)
        .select()
        .single();

      if (error) throw error;

      // Add activity
      await supabase.rpc('add_crm_activity', {
        p_contact_id: input.contact_id,
        p_activity_type: 'deal_created',
        p_title: `Deal created: ${input.title}`,
        p_deal_id: data.id,
        p_metadata: { value: input.value },
      });

      return data as CrmDeal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CRM_DEALS_KEY] });
      toast({
        title: 'Deal created',
        description: 'The deal has been created successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error creating deal',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateDeal = useMutation({
    mutationFn: async ({ id, ...input }: Partial<CrmDealInput> & { id: string }) => {
      const { data, error } = await supabase
        .from('crm_deals')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as CrmDeal;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [CRM_DEALS_KEY] });
      queryClient.invalidateQueries({ queryKey: [CRM_DEALS_KEY, data.id] });
      toast({
        title: 'Deal updated',
        description: 'The deal has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error updating deal',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const moveDealToStage = useMutation({
    mutationFn: async ({ dealId, stageId }: { dealId: string; stageId: string }) => {
      const { data, error } = await supabase
        .from('crm_deals')
        .update({ stage_id: stageId })
        .eq('id', dealId)
        .select()
        .single();

      if (error) throw error;
      return data as CrmDeal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CRM_DEALS_KEY] });
      toast({
        title: 'Deal moved',
        description: 'The deal has been moved to the new stage.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error moving deal',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const closeDeal = useMutation({
    mutationFn: async ({ dealId, status, reason }: { dealId: string; status: 'won' | 'lost'; reason?: string }) => {
      const { data, error } = await supabase
        .from('crm_deals')
        .update({
          status,
          close_reason: reason,
          actual_close_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', dealId)
        .select(`*, contact_id`)
        .single();

      if (error) throw error;

      // Add activity
      await supabase.rpc('add_crm_activity', {
        p_contact_id: data.contact_id,
        p_activity_type: status === 'won' ? 'deal_won' : 'deal_lost',
        p_title: `Deal ${status}: ${data.title}`,
        p_deal_id: dealId,
        p_metadata: { reason, value: data.value },
      });

      return data as CrmDeal;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [CRM_DEALS_KEY] });
      toast({
        title: data.status === 'won' ? 'Deal won!' : 'Deal closed',
        description: data.status === 'won'
          ? 'Congratulations on closing the deal!'
          : 'The deal has been marked as lost.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error closing deal',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteDeal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('crm_deals')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CRM_DEALS_KEY] });
      toast({
        title: 'Deal deleted',
        description: 'The deal has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error deleting deal',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    createDeal,
    updateDeal,
    moveDealToStage,
    closeDeal,
    deleteDeal,
  };
}

export function useCrmPipelineMetrics() {
  const { data: stages } = useCrmPipelineStages();

  return useQuery({
    queryKey: [CRM_PIPELINE_KEY, 'metrics'],
    queryFn: async () => {
      if (!stages) return [];

      const { data: deals, error } = await supabase
        .from('crm_deals')
        .select('stage_id, status, value');

      if (error) throw error;

      const metrics: CrmPipelineMetrics[] = stages.map(stage => {
        const stageDeals = deals?.filter(d => d.stage_id === stage.id) || [];
        const openDeals = stageDeals.filter(d => d.status === 'open');
        const wonDeals = stageDeals.filter(d => d.status === 'won');

        return {
          stage_id: stage.id,
          stage_name: stage.name,
          stage_order: stage.stage_order,
          stage_color: stage.color,
          deal_count: openDeals.length,
          total_value: openDeals.reduce((sum, d) => sum + (d.value || 0), 0),
          average_value: openDeals.length > 0
            ? openDeals.reduce((sum, d) => sum + (d.value || 0), 0) / openDeals.length
            : 0,
          win_rate: stageDeals.length > 0
            ? (wonDeals.length / stageDeals.length) * 100
            : 0,
          average_days_in_stage: 0, // Would need stage history to calculate
        };
      });

      return metrics;
    },
    enabled: !!stages?.length,
  });
}

export function useCrmDealStats() {
  return useQuery({
    queryKey: [CRM_DEALS_KEY, 'stats'],
    queryFn: async () => {
      const { data: deals, error } = await supabase
        .from('crm_deals')
        .select('status, value, created_at, actual_close_date');

      if (error) throw error;

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      const totalDeals = deals?.length || 0;
      const openDeals = deals?.filter(d => d.status === 'open') || [];
      const wonDeals = deals?.filter(d => d.status === 'won') || [];
      const lostDeals = deals?.filter(d => d.status === 'lost') || [];

      const wonThisMonth = wonDeals.filter(d =>
        d.actual_close_date && new Date(d.actual_close_date) >= startOfMonth
      );

      const wonLastMonth = wonDeals.filter(d =>
        d.actual_close_date &&
        new Date(d.actual_close_date) >= startOfLastMonth &&
        new Date(d.actual_close_date) <= endOfLastMonth
      );

      return {
        total: totalDeals,
        open: openDeals.length,
        won: wonDeals.length,
        lost: lostDeals.length,
        pipeline_value: openDeals.reduce((sum, d) => sum + (d.value || 0), 0),
        won_value_this_month: wonThisMonth.reduce((sum, d) => sum + (d.value || 0), 0),
        won_value_last_month: wonLastMonth.reduce((sum, d) => sum + (d.value || 0), 0),
        win_rate: totalDeals > 0 ? (wonDeals.length / (wonDeals.length + lostDeals.length)) * 100 : 0,
      };
    },
  });
}
