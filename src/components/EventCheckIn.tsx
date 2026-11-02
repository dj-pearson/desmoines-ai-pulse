import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCommunityFeatures } from "@/hooks/useCommunityFeatures";
import { Check, Heart, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { signInHref } from "@/lib/signInLinks";
import { CHECK_IN_LABELS, CHECK_IN_STATUSES, type CheckInStatus } from "@/lib/checkInStatus";

const STATUS_ICONS: Record<CheckInStatus, () => JSX.Element> = {
  going: () => <Check className="w-4 h-4" aria-hidden="true" />,
  interested: () => <Heart className="w-4 h-4" aria-hidden="true" />,
  maybe: () => <SpriteIcon name="clock" className="w-4 h-4" />,
  not_going: () => <X className="w-4 h-4" aria-hidden="true" />,
};

interface EventCheckInProps {
  eventId: string;
  eventTitle: string;
}

const EMPTY_COUNTS = { going: 0, interested: 0, maybe: 0, not_going: 0, total: 0 };

export function EventCheckIn({ eventId, eventTitle }: EventCheckInProps) {
  const { user } = useAuth();
  const location = useLocation();
  const { updateEventCheckIn, getEventCheckIns, getUserEventCheckIn } = useCommunityFeatures();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  // useQuery instead of a mount effect (events plan WP8 item 9): the tallies
  // are cached per event, a remount does not refetch, and the counts and the
  // viewer's own status arrive as one entry keyed by who is asking.
  const queryKey = ['event-check-in', eventId, user?.id ?? null] as const;
  const { data } = useQuery({
    queryKey,
    queryFn: async () => {
      const [status, counts] = await Promise.all([
        getUserEventCheckIn(eventId),
        getEventCheckIns(eventId),
      ]);
      return { status, counts };
    },
    enabled: Boolean(user),
    staleTime: 60 * 1000,
  });
  const userStatus = data?.status ?? null;
  const checkInCounts = data?.counts ?? EMPTY_COUNTS;

  const handleCheckIn = async (status: CheckInStatus) => {
    if (!user) return;

    setLoading(true);
    const success = await updateEventCheckIn(eventId, status);
    if (success) {
      await queryClient.invalidateQueries({ queryKey });
    }
    setLoading(false);
  };

  // -700 fills: white text on the -500 shades this used failed 4.5:1
  // (events-pass2 WP4 item 10).
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'going': return 'bg-green-700 text-white hover:bg-green-800';
      case 'interested': return 'bg-blue-700 text-white hover:bg-blue-800';
      case 'maybe': return 'bg-yellow-700 text-white hover:bg-yellow-800';
      case 'not_going': return 'bg-gray-700 text-white hover:bg-gray-800';
      default: return 'bg-primary hover:bg-primary/90';
    }
  };

  if (!user) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <SpriteIcon name="users" className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">
            <Link
              to={signInHref(location.pathname, location.search)}
              className="font-medium text-primary underline underline-offset-4"
            >
              Sign in
            </Link>{" "}
            to say whether you're going to {eventTitle}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SpriteIcon name="users" className="w-5 h-5" />
          Event Check-In
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* User's Status */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Your status for this event:</p>
          {/* aria-pressed carries the selected answer; before it only the
              fill colour did, which a screen reader cannot see. */}
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Your status for this event">
            {CHECK_IN_STATUSES.map((status) => {
              const Icon = STATUS_ICONS[status];
              const selected = userStatus === status;
              return (
                <Button
                  key={status}
                  onClick={() => handleCheckIn(status)}
                  disabled={loading}
                  aria-pressed={selected}
                  variant={selected ? 'default' : 'outline'}
                  className={`gap-2 min-h-[44px] ${selected ? getStatusColor(status) : ''}`}
                >
                  <Icon />
                  {CHECK_IN_LABELS[status]}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Community Stats. A total of 0 is also what a failed read returns
            (useCommunityFeatures getEventCheckIns), so "0 people" would be a
            claim the page can't back. Say nothing about counts until someone
            has answered (events-pass2 WP4 item 10). */}
        {checkInCounts.total > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">Community interest</p>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <dt className="flex items-center gap-1 font-medium text-foreground">
                  <Check className="w-3 h-3" aria-hidden="true" />
                  Going
                </dt>
                <dd className="text-muted-foreground tabular-nums">{checkInCounts.going}</dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="flex items-center gap-1 font-medium text-foreground">
                  <Heart className="w-3 h-3" aria-hidden="true" />
                  Interested
                </dt>
                <dd className="text-muted-foreground tabular-nums">{checkInCounts.interested}</dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="flex items-center gap-1 font-medium text-foreground">
                  <SpriteIcon name="clock" className="w-3 h-3" />
                  Maybe
                </dt>
                <dd className="text-muted-foreground tabular-nums">{checkInCounts.maybe}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Be the first to say you're going.</p>
        )}
      </CardContent>
    </Card>
  );
}