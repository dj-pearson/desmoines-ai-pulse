import React, { useState, useEffect } from 'react';
import { Clock, Phone, Globe, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { getRestaurantOpenStatus } from '@/lib/restaurantHours';
import { RESTAURANT_LIST_COLUMNS } from '@/lib/listColumns';
import { handleError } from '@/lib/errorHandler';

/**
 * WEB-LEGAL-010: every field here now has a column behind it.
 *
 * What was removed, and why: this component used to seed itself with three
 * real, named Des Moines businesses carrying invented seven-day opening hours,
 * invented phone numbers, and invented wait times and capacity, all rendered
 * under a "real-time" heading. A visitor could act on that and drive to a
 * closed restaurant, and the businesses never agreed to have hours published
 * in their name.
 *
 * `waitTime`, `capacity`, `specialOffers` and `specialHours` are gone rather
 * than rewired: nothing in the schema records any of them, so keeping the
 * fields would only invite the placeholders back. The structured seven-day
 * `hours` object is gone too - `restaurants.opening` is free-form text
 * ("Mon-Sat 11am-10pm"), so it is shown as written instead of being parsed
 * into a week we cannot actually fill.
 */
interface RealTimeBusinessInfo {
  id: string;
  name: string;
  category: 'restaurant';
  status: 'open' | 'closed' | 'closing-soon' | 'unknown';
  /** Raw text from restaurants.opening, shown as stored. */
  openingText: string | null;
  phone?: string;
  website?: string;
}

/**
 * Real-time business information component
 * Differentiates from CatchDesMoines static tourism focus
 * Provides live business status, hours, and availability
 */
export default function RealTimeBusinessInfo() {
  const [businesses, setBusinesses] = useState<RealTimeBusinessInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Real data only (WEB-LEGAL-010). Status is derived from restaurants.opening
  // by the same parser the rest of the site uses, so this page agrees with the
  // Open Now badges elsewhere instead of asserting its own version of reality.
  useEffect(() => {
    let cancelled = false;

    const fetchRealTimeData = async () => {
      try {
        const { data, error } = await supabase
          .from('restaurants')
          .select(RESTAURANT_LIST_COLUMNS)
          .not('opening', 'is', null)
          .order('popularity_score', { ascending: false, nullsFirst: false })
          .limit(24);

        if (error) throw error;
        if (cancelled) return;

        const rows = (data ?? []) as unknown as {
          id: string;
          name: string | null;
          opening: string | null;
          phone: string | null;
          website: string | null;
          is_merged?: boolean | null;
        }[];

        const mapped: RealTimeBusinessInfo[] = rows
          .filter((r) => r.name && !r.is_merged)
          .map((r) => ({
            id: r.id,
            name: r.name as string,
            category: 'restaurant' as const,
            status: getRestaurantOpenStatus(r.opening).status,
            openingText: r.opening,
            phone: r.phone ?? undefined,
            website: r.website ?? undefined,
          }))
          // A business whose hours we cannot parse is not "real-time" anything,
          // so it is left out rather than shown as Hours Unknown.
          .filter((b) => b.status !== 'unknown');

        setBusinesses(mapped);
        setLastUpdate(new Date());
      } catch (err) {
        handleError(err, { component: 'RealTimeBusinessInfo', action: 'fetchRealTimeData' });
        if (!cancelled) setBusinesses([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRealTimeData();

    // Re-derive open/closed as the clock moves.
    const interval = setInterval(fetchRealTimeData, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-green-100 text-green-800';
      case 'closed': return 'bg-red-100 text-red-800';
      case 'closing-soon': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <CheckCircle className="h-4 w-4" />;
      case 'closed': return <AlertCircle className="h-4 w-4" />;
      case 'closing-soon': return <Clock className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  const formatStatus = (status: string) => {
    switch (status) {
      case 'open': return 'Open Now';
      case 'closed': return 'Closed';
      case 'closing-soon': return 'Closing Soon';
      default: return 'Hours Unknown';
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Real-time Indicator */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">What's Open Right Now</h2>
          <p className="text-sm text-muted-foreground">
            Open now, from posted hours • Checked {lastUpdate.toLocaleTimeString()}
          </p>
        </div>
        <Badge variant="outline" className="flex items-center gap-1">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          Live Updates
        </Badge>
      </div>

      {/* Real-time Business Cards */}
      <div className="grid gap-4">
        {businesses.map((business) => (
          <Card key={business.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{business.name}</CardTitle>
                <Badge className={`flex items-center gap-1 ${getStatusColor(business.status)}`}>
                  {getStatusIcon(business.status)}
                  {formatStatus(business.status)}
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Contact Information */}
              <div className="flex flex-wrap gap-4 text-sm">
                {business.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{business.phone}</span>
                  </div>
                )}
                {business.website && (
                  <div className="flex items-center gap-1">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a 
                      href={business.website} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Visit Website
                    </a>
                  </div>
                )}
              </div>

              {/* Live Updates Section */}
              {/* Hours as recorded. Free-form text from restaurants.opening,
                  shown as stored rather than reformatted into a structure the
                  data does not support (WEB-LEGAL-010). */}
              {business.openingText && (
                <div className="flex items-start gap-2 text-sm">
                  <Clock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">{business.openingText}</span>
                </div>
              )}

            </CardContent>
          </Card>
        ))}
      </div>

      {/* Real-time Features Explanation */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardContent className="p-6">
          {/* WEB-LEGAL-010: this card used to promise live wait times, current
              capacity and special offers. None of those were ever measured, and
              the badges advertised them alongside fabricated values. Claims here
              must stay within what the data supports. */}
          <h3 className="font-semibold text-blue-900 mb-2">How this page works</h3>
          <p className="text-blue-800 text-sm leading-relaxed">
            Open and closed status is worked out from each restaurant&apos;s posted
            hours and the current time in Des Moines, and re-checked while this page
            is open. Hours come from the venue as they published them, so call ahead
            for holidays and late changes.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="secondary" className="bg-white/50">Open now, from posted hours</Badge>
            <Badge variant="secondary" className="bg-white/50">Central Time</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Real-time search component for voice queries
 * Targets "open now" and "near me" searches
 */
export const RealTimeSearch = ({
  onQueryChange,
}: {
  onQueryChange?: (query: string) => void;
}) => {
  // WEB-LEGAL-010: this box used to render an input and three buttons whose
  // handler only wrote a debug log - it looked like search and did nothing, and
  // a comment promised "mock results based on query". It now reports the query
  // upward so the caller can filter the real list, and the preset buttons are
  // gone because they mapped to categories this page does not have.
  const [query, setQuery] = useState('');

  const handleSearch = (searchQuery: string) => {
    setQuery(searchQuery);
    onQueryChange?.(searchQuery);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <label htmlFor="realtime-search" className="sr-only">
          Filter restaurants by name
        </label>
        <input
          id="realtime-search"
          type="text"
          placeholder="Filter by name"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full p-3 pr-12 border rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
};