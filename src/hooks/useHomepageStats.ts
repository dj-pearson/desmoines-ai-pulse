import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

interface HomepageStats {
  eventsToday: number;
  restaurantsCount: number;
  newThisWeek: number;
  isLoading: boolean;
}

export function useHomepageStats(): HomepageStats {
  const [stats, setStats] = useState<HomepageStats>({
    eventsToday: 0,
    restaurantsCount: 0,
    newThisWeek: 0,
    isLoading: true,
  });

  useEffect(() => {
    const fetchStats = async () => {
      const tz = 'America/Chicago';
      const now = new Date();
      const nowLocal = toZonedTime(now, tz);

      // Today's date range in UTC (matching EventsToday.tsx logic)
      const startLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 0, 0, 0, 0);
      const endLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 23, 59, 59, 999);
      const todayStartUtc = fromZonedTime(startLocal, tz).toISOString();
      const todayEndUtc = fromZonedTime(endLocal, tz).toISOString();

      // 7 days ago for "new this week"
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoUtc = weekAgo.toISOString();

      const [eventsRes, restaurantsRes, newEventsRes] = await Promise.all([
        // Count events happening today
        supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .gte('date', todayStartUtc)
          .lte('date', todayEndUtc),

        // Count total restaurants
        supabase
          .from('restaurants')
          .select('*', { count: 'exact', head: true }),

        // Count events created in the last 7 days
        supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', weekAgoUtc),
      ]);

      setStats({
        eventsToday: eventsRes.count ?? 0,
        restaurantsCount: restaurantsRes.count ?? 0,
        newThisWeek: newEventsRes.count ?? 0,
        isLoading: false,
      });
    };

    fetchStats();
  }, []);

  return stats;
}
