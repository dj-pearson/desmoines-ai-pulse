import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CrmDashboardStats } from '@/types/crm';

const CRM_DASHBOARD_KEY = 'crm-dashboard';

export function useCrmDashboard() {
  return useQuery({
    queryKey: [CRM_DASHBOARD_KEY],
    queryFn: async (): Promise<CrmDashboardStats> => {
      // Run parallel queries for better performance
      const [
        contactsResult,
        dealsResult,
        activitiesResult,
        tasksResult,
        segmentsResult,
      ] = await Promise.all([
        // Contacts data
        supabase.from('crm_contacts').select('status, source, lead_score, created_at'),

        // Deals data
        supabase.from('crm_deals').select(`
          status, value, stage_id, created_at, actual_close_date,
          stage:crm_pipeline_stages(id, name)
        `),

        // Recent activities
        supabase
          .from('crm_activities')
          .select(`
            *,
            contact:crm_contacts(id, email, first_name, last_name)
          `)
          .order('performed_at', { ascending: false })
          .limit(10),

        // Tasks
        supabase
          .from('crm_tasks')
          .select('*')
          .in('status', ['pending', 'in_progress'])
          .order('due_date', { ascending: true })
          .limit(20),

        // Segments
        supabase
          .from('crm_segments')
          .select('id, name, contact_count')
          .order('contact_count', { ascending: false })
          .limit(5),
      ]);

      // Process contacts
      const contacts = contactsResult.data || [];
      const contactsByStatus: Record<string, number> = {};
      const contactsBySource: Record<string, number> = {};
      let totalLeadScore = 0;

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      let newThisMonth = 0;
      let newLastMonth = 0;

      contacts.forEach(c => {
        contactsByStatus[c.status] = (contactsByStatus[c.status] || 0) + 1;
        contactsBySource[c.source] = (contactsBySource[c.source] || 0) + 1;
        totalLeadScore += c.lead_score || 0;

        const createdAt = new Date(c.created_at);
        if (createdAt >= startOfMonth) {
          newThisMonth++;
        } else if (createdAt >= startOfLastMonth && createdAt <= endOfLastMonth) {
          newLastMonth++;
        }
      });

      // Process deals
      const deals = dealsResult.data || [];
      const dealsByStatus: Record<string, number> = {};
      const dealsByStage: Array<{ stage_id: string; stage_name: string; count: number; value: number }> = [];
      const stageMap = new Map<string, { name: string; count: number; value: number }>();

      let pipelineValue = 0;
      let wonThisMonth = 0;
      let wonValueThisMonth = 0;

      deals.forEach(d => {
        dealsByStatus[d.status] = (dealsByStatus[d.status] || 0) + 1;

        if (d.status === 'open') {
          pipelineValue += d.value || 0;
        }

        if (d.status === 'won' && d.actual_close_date) {
          const closeDate = new Date(d.actual_close_date);
          if (closeDate >= startOfMonth) {
            wonThisMonth++;
            wonValueThisMonth += d.value || 0;
          }
        }

        // Group by stage
        const stageId = d.stage_id;
        const stageName = (d.stage as { name: string } | null)?.name || 'Unknown';
        if (!stageMap.has(stageId)) {
          stageMap.set(stageId, { name: stageName, count: 0, value: 0 });
        }
        const stage = stageMap.get(stageId)!;
        stage.count++;
        stage.value += d.value || 0;
      });

      stageMap.forEach((stage, stageId) => {
        dealsByStage.push({
          stage_id: stageId,
          stage_name: stage.name,
          count: stage.count,
          value: stage.value,
        });
      });

      // Process tasks
      const tasks = tasksResult.data || [];
      const nowStr = new Date().toISOString();
      const overdueTasks = tasks.filter(t => t.due_date && t.due_date < nowStr);
      const upcomingTasks = tasks.filter(t => !t.due_date || t.due_date >= nowStr);

      // Process segments
      const topSegments = (segmentsResult.data || []).map(s => ({
        segment_id: s.id,
        segment_name: s.name,
        count: s.contact_count,
      }));

      return {
        total_contacts: contacts.length,
        contacts_by_status: contactsByStatus as Record<import('@/types/crm').CrmContactStatus, number>,
        contacts_by_source: contactsBySource as Record<import('@/types/crm').CrmContactSource, number>,
        new_contacts_this_month: newThisMonth,
        new_contacts_last_month: newLastMonth,

        total_deals: deals.length,
        deals_by_status: dealsByStatus as Record<import('@/types/crm').CrmDealStatus, number>,
        deals_by_stage: dealsByStage,
        total_pipeline_value: pipelineValue,
        won_deals_this_month: wonThisMonth,
        won_deals_value_this_month: wonValueThisMonth,

        average_lead_score: contacts.length > 0 ? Math.round(totalLeadScore / contacts.length) : 0,
        top_segments: topSegments,

        recent_activities: activitiesResult.data as import('@/types/crm').CrmActivityFeed[],
        upcoming_tasks: upcomingTasks as import('@/types/crm').CrmTask[],
        overdue_tasks: overdueTasks as import('@/types/crm').CrmTask[],
      };
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCrmLeadScoreRules() {
  return useQuery({
    queryKey: ['crm-lead-score-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_lead_score_rules')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}

export function useCrmLeadScoreHistory(contactId: string | undefined) {
  return useQuery({
    queryKey: ['crm-lead-score-history', contactId],
    queryFn: async () => {
      if (!contactId) return [];

      const { data, error } = await supabase
        .from('crm_lead_score_history')
        .select(`
          *,
          rule:crm_lead_score_rules(name)
        `)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
    enabled: !!contactId,
  });
}

// Export all CRM hooks from a single entry point
export * from './useCrmContacts';
export * from './useCrmDeals';
export * from './useCrmCommunications';
export * from './useCrmSegments';
export * from './useCrmActivities';
export * from './useCrmTasks';
export * from './useCrmNotes';
