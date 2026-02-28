import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Deal {
  id: string;
  title: string;
  description: string | null;
  business_name: string;
  entity_type: string;
  entity_id: string | null;
  deal_type: string;
  discount_value: string | null;
  code: string | null;
  terms: string | null;
  start_date: string;
  end_date: string | null;
  image_url: string | null;
  is_verified: boolean;
  is_featured: boolean;
  redemption_count: number;
  created_at: string;
}

export function useDeals(category?: string) {
  return useQuery({
    queryKey: ['deals', category],
    queryFn: async (): Promise<Deal[]> => {
      let query = supabase
        .from('deals')
        .select('*')
        .order('is_featured', { ascending: false })
        .order('end_date', { ascending: true });

      if (category && category !== 'all') {
        query = query.eq('entity_type', category);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Deal[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useFeaturedDeals(limit = 4) {
  return useQuery({
    queryKey: ['deals', 'featured', limit],
    queryFn: async (): Promise<Deal[]> => {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .eq('is_featured', true)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as unknown as Deal[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useClaimDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dealId: string) => {
      const { error } = await supabase.rpc('increment_deal_redemption', { deal_id: dealId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
  });
}

export function getDealTypeLabel(dealType: string): string {
  const labels: Record<string, string> = {
    percentage: '% Off',
    dollar_off: '$ Off',
    bogo: 'BOGO',
    free_item: 'Free Item',
    package: 'Package',
  };
  return labels[dealType] || dealType;
}

export function getDealExpiryBadge(endDate: string | null): { text: string; variant: 'destructive' | 'secondary' | 'default' } | null {
  if (!endDate) return null;
  const now = new Date();
  const end = new Date(endDate);
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) return null;
  if (daysLeft === 1) return { text: 'Last day!', variant: 'destructive' };
  if (daysLeft <= 3) return { text: `Expires in ${daysLeft} days`, variant: 'destructive' };
  if (daysLeft <= 7) return { text: `${daysLeft} days left`, variant: 'secondary' };

  const created = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (end.getTime() - created.getTime() > 20 * 24 * 60 * 60 * 1000) {
    return { text: 'New this week', variant: 'default' };
  }
  return null;
}
