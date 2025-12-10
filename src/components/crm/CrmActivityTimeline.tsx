import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  StickyNote,
  Phone,
  Mail,
  Users,
  CheckSquare,
  PlusCircle,
  Edit,
  Trophy,
  XCircle,
  RefreshCw,
  UserPlus,
  UserMinus,
  TrendingUp,
  User,
  CreditCard,
  LogIn,
  Eye,
  Calendar,
  UtensilsCrossed,
  MapPin,
  Search,
  Heart,
  Star,
  MessageSquare,
  Share2,
  Activity,
} from 'lucide-react';
import { useCrmRecentActivities, useCrmActivities } from '@/hooks/useCrmActivities';
import { formatDistanceToNow, format } from 'date-fns';
import type { CrmActivityFeed, CrmActivityType } from '@/types/crm';

const ACTIVITY_CONFIG: Record<CrmActivityType, { icon: React.ElementType; color: string; label: string }> = {
  note: { icon: StickyNote, color: 'bg-yellow-100 text-yellow-800', label: 'Note' },
  call: { icon: Phone, color: 'bg-green-100 text-green-800', label: 'Call' },
  email: { icon: Mail, color: 'bg-blue-100 text-blue-800', label: 'Email' },
  meeting: { icon: Users, color: 'bg-purple-100 text-purple-800', label: 'Meeting' },
  task: { icon: CheckSquare, color: 'bg-orange-100 text-orange-800', label: 'Task' },
  deal_created: { icon: PlusCircle, color: 'bg-indigo-100 text-indigo-800', label: 'Deal Created' },
  deal_updated: { icon: Edit, color: 'bg-indigo-100 text-indigo-800', label: 'Deal Updated' },
  deal_won: { icon: Trophy, color: 'bg-green-100 text-green-800', label: 'Deal Won' },
  deal_lost: { icon: XCircle, color: 'bg-red-100 text-red-800', label: 'Deal Lost' },
  status_change: { icon: RefreshCw, color: 'bg-gray-100 text-gray-800', label: 'Status Change' },
  segment_added: { icon: UserPlus, color: 'bg-teal-100 text-teal-800', label: 'Segment Added' },
  segment_removed: { icon: UserMinus, color: 'bg-teal-100 text-teal-800', label: 'Segment Removed' },
  score_updated: { icon: TrendingUp, color: 'bg-amber-100 text-amber-800', label: 'Score Updated' },
  profile_updated: { icon: User, color: 'bg-gray-100 text-gray-800', label: 'Profile Updated' },
  subscription_change: { icon: CreditCard, color: 'bg-pink-100 text-pink-800', label: 'Subscription' },
  login: { icon: LogIn, color: 'bg-gray-100 text-gray-800', label: 'Login' },
  page_view: { icon: Eye, color: 'bg-gray-100 text-gray-800', label: 'Page View' },
  event_interaction: { icon: Calendar, color: 'bg-blue-100 text-blue-800', label: 'Event' },
  restaurant_interaction: { icon: UtensilsCrossed, color: 'bg-orange-100 text-orange-800', label: 'Restaurant' },
  attraction_interaction: { icon: MapPin, color: 'bg-green-100 text-green-800', label: 'Attraction' },
  search: { icon: Search, color: 'bg-gray-100 text-gray-800', label: 'Search' },
  favorite: { icon: Heart, color: 'bg-red-100 text-red-800', label: 'Favorite' },
  rating: { icon: Star, color: 'bg-yellow-100 text-yellow-800', label: 'Rating' },
  review: { icon: MessageSquare, color: 'bg-blue-100 text-blue-800', label: 'Review' },
  share: { icon: Share2, color: 'bg-indigo-100 text-indigo-800', label: 'Share' },
  other: { icon: Activity, color: 'bg-gray-100 text-gray-800', label: 'Activity' },
};

interface CrmActivityTimelineProps {
  activities?: CrmActivityFeed[];
  compact?: boolean;
}

export function CrmActivityTimeline({ activities: propActivities, compact = false }: CrmActivityTimelineProps) {
  const [page, setPage] = useState(1);
  const { data: fetchedData, isLoading } = useCrmActivities(
    propActivities ? undefined : { page, per_page: compact ? 10 : 25 }
  );

  const activities = propActivities || fetchedData?.activities || [];
  const hasMore = !propActivities && fetchedData && fetchedData.total > page * fetchedData.perPage;

  if (!propActivities && isLoading) {
    return <ActivityTimelineSkeleton compact={compact} />;
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No activities yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

        {/* Activity items */}
        <div className="space-y-4">
          {activities.map((activity, index) => {
            const config = ACTIVITY_CONFIG[activity.activity_type] || ACTIVITY_CONFIG.other;
            const Icon = config.icon;

            return (
              <div key={activity.id} className="relative flex gap-4">
                {/* Icon */}
                <div
                  className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${config.color}`}
                >
                  <Icon className="h-4 w-4" />
                </div>

                {/* Content */}
                <div className={`flex-1 ${compact ? 'pb-2' : 'pb-4'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`font-medium ${compact ? 'text-sm' : ''}`}>
                        {activity.title}
                      </p>
                      {!compact && activity.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {activity.description}
                        </p>
                      )}
                      {activity.contact_first_name && !compact && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Contact: {activity.contact_first_name} {activity.contact_last_name}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(activity.performed_at), { addSuffix: true })}
                      </span>
                      {activity.is_system_generated && (
                        <Badge variant="outline" className="text-xs">
                          Auto
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Load more */}
      {hasMore && !compact && (
        <div className="text-center">
          <Button
            variant="outline"
            onClick={() => setPage(p => p + 1)}
          >
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}

// Standalone activity timeline card for the full view
export function CrmActivityTimelineCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Activity Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <CrmActivityTimeline />
      </CardContent>
    </Card>
  );
}

function ActivityTimelineSkeleton({ compact = false }: { compact?: boolean }) {
  const count = compact ? 5 : 8;

  return (
    <div className="space-y-4">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            {!compact && <Skeleton className="h-3 w-full" />}
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
