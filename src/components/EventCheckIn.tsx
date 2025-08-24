import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCommunityFeatures } from "@/hooks/useCommunityFeatures";
import { Check, Clock, Users, Heart, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface EventCheckInProps {
  eventId: string;
  eventTitle: string;
}

export function EventCheckIn({ eventId, eventTitle }: EventCheckInProps) {
  const { user } = useAuth();
  const { updateEventCheckIn, getEventCheckIns, getUserEventCheckIn } = useCommunityFeatures();
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [checkInCounts, setCheckInCounts] = useState({
    going: 0,
    interested: 0,
    maybe: 0,
    not_going: 0,
    total: 0
  });
  const [loading, setLoading] = useState(false);

  const loadCheckInData = async () => {
    const [userCheckIn, counts] = await Promise.all([
      getUserEventCheckIn(eventId),
      getEventCheckIns(eventId)
    ]);
    
    setUserStatus(userCheckIn);
    setCheckInCounts(counts);
  };

  const handleCheckIn = async (status: 'interested' | 'going' | 'maybe' | 'not_going') => {
    if (!user) return;
    
    setLoading(true);
    const success = await updateEventCheckIn(eventId, status);
    if (success) {
      setUserStatus(status);
      await loadCheckInData(); // Refresh counts
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCheckInData();
  }, [eventId]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'going': return <Check className="w-4 h-4" />;
      case 'interested': return <Heart className="w-4 h-4" />;
      case 'maybe': return <Clock className="w-4 h-4" />;
      case 'not_going': return <X className="w-4 h-4" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'going': return 'bg-green-500 hover:bg-green-600';
      case 'interested': return 'bg-blue-500 hover:bg-blue-600';
      case 'maybe': return 'bg-yellow-500 hover:bg-yellow-600';
      case 'not_going': return 'bg-gray-500 hover:bg-gray-600';
      default: return 'bg-primary hover:bg-primary/90';
    }
  };

  if (!user) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">Sign in to check in to events</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Event Check-In
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* User's Status */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Your status for this event:</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => handleCheckIn('going')}
              disabled={loading}
              variant={userStatus === 'going' ? 'default' : 'outline'}
              className={`gap-2 ${userStatus === 'going' ? getStatusColor('going') : ''}`}
            >
              <Check className="w-4 h-4" />
              Going
            </Button>
            <Button
              onClick={() => handleCheckIn('interested')}
              disabled={loading}
              variant={userStatus === 'interested' ? 'default' : 'outline'}
              className={`gap-2 ${userStatus === 'interested' ? getStatusColor('interested') : ''}`}
            >
              <Heart className="w-4 h-4" />
              Interested
            </Button>
            <Button
              onClick={() => handleCheckIn('maybe')}
              disabled={loading}
              variant={userStatus === 'maybe' ? 'default' : 'outline'}
              className={`gap-2 ${userStatus === 'maybe' ? getStatusColor('maybe') : ''}`}
            >
              <Clock className="w-4 h-4" />
              Maybe
            </Button>
            <Button
              onClick={() => handleCheckIn('not_going')}
              disabled={loading}
              variant={userStatus === 'not_going' ? 'default' : 'outline'}
              className={`gap-2 ${userStatus === 'not_going' ? getStatusColor('not_going') : ''}`}
            >
              <X className="w-4 h-4" />
              Not Going
            </Button>
          </div>
        </div>

        {/* Community Stats */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Community Interest:</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  <Check className="w-3 h-3 mr-1" />
                  Going
                </Badge>
                <span className="text-sm text-muted-foreground">{checkInCounts.going} people</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                  <Heart className="w-3 h-3 mr-1" />
                  Interested
                </Badge>
                <span className="text-sm text-muted-foreground">{checkInCounts.interested} people</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                  <Clock className="w-3 h-3 mr-1" />
                  Maybe
                </Badge>
                <span className="text-sm text-muted-foreground">{checkInCounts.maybe} people</span>
              </div>
            </div>
          </div>
          
          <div className="pt-2 border-t">
            <p className="text-sm text-muted-foreground">
              Total responses: {checkInCounts.total}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}