import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface UserStatsData {
  totalUsers: number;
  newThisWeek: number;
  newThisMonth: number;
  activeToday: number;
  growthData: { date: string; signups: number; cumulative: number }[];
  referrerBreakdown: { source: string; count: number }[];
  subscriptionBreakdown: { tier: string; count: number; color: string }[];
  interestBreakdown: { interest: string; count: number }[];
  recentSignups: {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    location: string | null;
    created_at: string;
    interests: string[] | null;
  }[];
}

const TIER_COLORS: Record<string, string> = {
  Free: '#94a3b8',
  Insider: '#3b82f6',
  VIP: '#f59e0b',
};

function normalizeReferrer(raw: string | null): string {
  if (!raw || raw === '' || raw === 'null') return 'Direct';
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '');
    if (host.includes('google')) return 'Google';
    if (host.includes('bing')) return 'Bing';
    if (host.includes('facebook') || host.includes('fb.com')) return 'Facebook';
    if (host.includes('instagram')) return 'Instagram';
    if (host.includes('twitter') || host.includes('x.com')) return 'X / Twitter';
    if (host.includes('tiktok')) return 'TikTok';
    if (host.includes('reddit')) return 'Reddit';
    if (host.includes('linkedin')) return 'LinkedIn';
    if (host.includes('desmoinesinsider')) return 'Direct';
    return host;
  } catch {
    return raw.length > 30 ? raw.slice(0, 30) + '…' : raw;
  }
}

export function useUserStats(timeRange: '7d' | '30d' | '90d' = '30d') {
  return useQuery<UserStatsData>({
    queryKey: ['admin-user-stats', timeRange],
    queryFn: async () => {
      const now = new Date();
      const daysBack = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const rangeStart = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Parallel queries
      const [profilesRes, recentProfilesRes, analyticsRes, subscriptionsRes, todayActiveRes] =
        await Promise.all([
          // 1. All profiles (count + interests)
          // @ts-ignore
          supabase.from('profiles').select('id, email, first_name, last_name, location, created_at, interests'),

          // 2. Recent profiles for the table
          // @ts-ignore
          supabase
            .from('profiles')
            .select('id, email, first_name, last_name, location, created_at, interests')
            .order('created_at', { ascending: false })
            .limit(20),

          // 3. Referrer data from user_analytics within time range
          // @ts-ignore
          supabase
            .from('user_analytics')
            .select('referrer, session_id')
            .gte('created_at', rangeStart.toISOString()),

          // 4. Active subscriptions with plan names
          // @ts-ignore
          supabase
            .from('user_subscriptions')
            .select('user_id, plan:subscription_plans(name)')
            .eq('status', 'active'),

          // 5. Active sessions today
          // @ts-ignore
          supabase
            .from('user_analytics')
            .select('session_id')
            .gte('created_at', todayStart.toISOString()),
        ]);

      const profiles = (profilesRes.data ?? []) as Array<{
        id: string;
        email: string | null;
        first_name: string | null;
        last_name: string | null;
        location: string | null;
        created_at: string;
        interests: string[] | null;
      }>;
      const recentProfiles = (recentProfilesRes.data ?? []) as typeof profiles;
      const analyticsRows = (analyticsRes.data ?? []) as Array<{
        referrer: string | null;
        session_id: string;
      }>;
      const subscriptionRows = (subscriptionsRes.data ?? []) as Array<{
        user_id: string;
        plan: { name: string } | null;
      }>;
      const todayRows = (todayActiveRes.data ?? []) as Array<{ session_id: string }>;

      // --- Total users ---
      const totalUsers = profiles.length;

      // --- New this week / month ---
      const newThisWeek = profiles.filter(
        (p) => new Date(p.created_at) >= weekAgo
      ).length;
      const newThisMonth = profiles.filter(
        (p) => new Date(p.created_at) >= monthAgo
      ).length;

      // --- Active today (unique sessions) ---
      const activeToday = new Set(todayRows.map((r) => r.session_id)).size;

      // --- Growth data (daily signups within range) ---
      const signupsByDate: Record<string, number> = {};
      // Initialize all dates in range to 0
      for (let d = new Date(rangeStart); d <= now; d.setDate(d.getDate() + 1)) {
        signupsByDate[d.toISOString().split('T')[0]] = 0;
      }
      profiles.forEach((p) => {
        const date = p.created_at.split('T')[0];
        if (date in signupsByDate) {
          signupsByDate[date]++;
        }
      });
      let cumulative = profiles.filter(
        (p) => new Date(p.created_at) < rangeStart
      ).length;
      const growthData = Object.entries(signupsByDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, signups]) => {
          cumulative += signups;
          return { date, signups, cumulative };
        });

      // --- Referrer breakdown (deduplicated by session) ---
      const sessionReferrers = new Map<string, string>();
      analyticsRows.forEach((row) => {
        if (!sessionReferrers.has(row.session_id)) {
          sessionReferrers.set(row.session_id, normalizeReferrer(row.referrer));
        }
      });
      const referrerCounts: Record<string, number> = {};
      sessionReferrers.forEach((source) => {
        referrerCounts[source] = (referrerCounts[source] || 0) + 1;
      });
      const referrerBreakdown = Object.entries(referrerCounts)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // --- Subscription tier breakdown ---
      const subscribedUserIds = new Set(subscriptionRows.map((s) => s.user_id));
      const tierCounts: Record<string, number> = { Free: 0, Insider: 0, VIP: 0 };
      profiles.forEach((p) => {
        if (!subscribedUserIds.has(p.id)) {
          tierCounts['Free']++;
        }
      });
      subscriptionRows.forEach((s) => {
        const planName = s.plan?.name;
        if (planName === 'insider') tierCounts['Insider']++;
        else if (planName === 'vip') tierCounts['VIP']++;
        else tierCounts['Free']++;
      });
      const subscriptionBreakdown = Object.entries(tierCounts)
        .filter(([, count]) => count > 0)
        .map(([tier, count]) => ({
          tier,
          count,
          color: TIER_COLORS[tier] || '#8884d8',
        }));

      // --- Interest breakdown ---
      const interestCounts: Record<string, number> = {};
      profiles.forEach((p) => {
        (p.interests ?? []).forEach((interest) => {
          interestCounts[interest] = (interestCounts[interest] || 0) + 1;
        });
      });
      const interestBreakdown = Object.entries(interestCounts)
        .map(([interest, count]) => ({ interest, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12);

      return {
        totalUsers,
        newThisWeek,
        newThisMonth,
        activeToday,
        growthData,
        referrerBreakdown,
        subscriptionBreakdown,
        interestBreakdown,
        recentSignups: recentProfiles,
      };
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // auto-refresh every 5 min
  });
}
