import { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle, Phone, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface RestaurantStatusProps {
  restaurant: {
    name: string;
    phone?: string;
    website?: string;
    hours?: string;
  };
}

interface DayHours {
  open: string;
  close: string;
}

/**
 * Displays real-time business status for a restaurant
 * Shows current open/closed status, today's hours, and quick actions
 */
export default function RestaurantStatus({ restaurant }: RestaurantStatusProps) {
  const [currentStatus, setCurrentStatus] = useState<'open' | 'closed' | 'closing-soon' | 'unknown'>('unknown');
  const [todayHours, setTodayHours] = useState<DayHours | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Determine current status based on time
  useEffect(() => {
    const checkStatus = () => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTime = currentHour * 60 + currentMinute; // Convert to minutes
      const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

      // Default hours (can be customized per restaurant from database)
      // For now using typical restaurant hours
      let openTime = 11 * 60; // 11:00 AM
      let closeTime = 22 * 60; // 10:00 PM

      // Weekend hours (Friday-Saturday)
      if (dayOfWeek === 5 || dayOfWeek === 6) {
        closeTime = 23 * 60; // 11:00 PM
      }

      // Sunday hours
      if (dayOfWeek === 0) {
        openTime = 12 * 60; // 12:00 PM
        closeTime = 21 * 60; // 9:00 PM
      }

      // Set today's hours
      const openHour = Math.floor(openTime / 60);
      const openMin = openTime % 60;
      const closeHour = Math.floor(closeTime / 60);
      const closeMin = closeTime % 60;

      setTodayHours({
        open: `${openHour.toString().padStart(2, '0')}:${openMin.toString().padStart(2, '0')}`,
        close: `${closeHour.toString().padStart(2, '0')}:${closeMin.toString().padStart(2, '0')}`,
      });

      // Determine status
      if (currentTime >= openTime && currentTime < closeTime) {
        // Check if closing soon (within 1 hour)
        if (currentTime >= closeTime - 60) {
          setCurrentStatus('closing-soon');
        } else {
          setCurrentStatus('open');
        }
      } else {
        setCurrentStatus('closed');
      }

      setLastUpdated(new Date());
    };

    checkStatus();
    // Update every minute
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = () => {
    switch (currentStatus) {
      case 'open':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'closing-soon':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'closed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusText = () => {
    switch (currentStatus) {
      case 'open':
        return 'Open Now';
      case 'closing-soon':
        return 'Closing Soon';
      case 'closed':
        return 'Closed';
      default:
        return 'Hours Unknown';
    }
  };

  const getStatusColor = () => {
    switch (currentStatus) {
      case 'open':
        return 'bg-green-50 border-green-200';
      case 'closing-soon':
        return 'bg-yellow-50 border-yellow-200';
      case 'closed':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <Card className={`border-2 ${getStatusColor()} transition-colors`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Hours & Status
          </CardTitle>
          <Badge
            variant="outline"
            className={`${
              currentStatus === 'open' ? 'bg-green-100 text-green-800 border-green-300' :
              currentStatus === 'closing-soon' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
              currentStatus === 'closed' ? 'bg-red-100 text-red-800 border-red-300' :
              'bg-gray-100 text-gray-800 border-gray-300'
            } font-semibold`}
          >
            {getStatusIcon()}
            <span className="ml-1.5">{getStatusText()}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {todayHours && (
          <div className="flex items-center justify-between p-3 bg-white/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Today's Hours:</span>
            </div>
            <span className="font-semibold text-primary">
              {formatTime(todayHours.open)} - {formatTime(todayHours.close)}
            </span>
          </div>
        )}

        {currentStatus === 'closing-soon' && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-900">Closing Soon</p>
                <p className="text-sm text-yellow-700">
                  This restaurant will be closing within the hour
                </p>
              </div>
            </div>
          </div>
        )}

        {currentStatus === 'closed' && todayHours && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium text-blue-900">Opens at {formatTime(todayHours.open)}</p>
                <p className="text-sm text-blue-700">
                  Plan your visit for later today!
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          {restaurant.phone && (
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={`tel:${restaurant.phone}`}>
                <Phone className="h-4 w-4 mr-2" />
                Call
              </a>
            </Button>
          )}
          {restaurant.website && (
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={restaurant.website} target="_blank" rel="noopener noreferrer">
                <Globe className="h-4 w-4 mr-2" />
                Website
              </a>
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center pt-2">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      </CardContent>
    </Card>
  );
}
