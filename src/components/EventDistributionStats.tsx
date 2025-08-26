import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Globe, Rss, Calendar, ExternalLink, CheckCircle } from 'lucide-react';

interface EventDistributionStatsProps {
  className?: string;
}

export default function EventDistributionStats({ className }: EventDistributionStatsProps) {
  const platforms = [
    {
      name: "Google Events",
      status: "active",
      method: "Schema.org markup + RSS",
      reach: "Primary search results",
      icon: <Globe className="h-4 w-4" />
    },
    {
      name: "Bing/Yahoo",
      status: "active", 
      method: "Schema.org markup",
      reach: "Search engine discovery",
      icon: <Globe className="h-4 w-4" />
    },
    {
      name: "RSS Aggregators",
      status: "active",
      method: "Structured RSS feed",
      reach: "Event feed consumers",
      icon: <Rss className="h-4 w-4" />
    },
    {
      name: "Local News Calendars",
      status: "configurable",
      method: "Webhook integration",
      reach: "Des Moines area media",
      icon: <Calendar className="h-4 w-4" />
    },
    {
      name: "Eventbrite",
      status: "configurable",
      method: "API integration",
      reach: "Event marketplace",
      icon: <ExternalLink className="h-4 w-4" />
    },
    {
      name: "Facebook Events",
      status: "configurable", 
      method: "Graph API",
      reach: "Social media platform",
      icon: <ExternalLink className="h-4 w-4" />
    },
    {
      name: "Meetup",
      status: "configurable",
      method: "API integration", 
      reach: "Community events",
      icon: <ExternalLink className="h-4 w-4" />
    },
    {
      name: "AllEvents.in",
      status: "configurable",
      method: "Webhook submission",
      reach: "Global event directory",
      icon: <ExternalLink className="h-4 w-4" />
    }
  ];

  const activePlatforms = platforms.filter(p => p.status === 'active').length;
  const configurablePlatforms = platforms.filter(p => p.status === 'configurable').length;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Event Distribution Network
        </CardTitle>
        <CardDescription>
          Your events are automatically distributed across multiple platforms for maximum visibility
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="text-2xl font-bold text-green-700">{activePlatforms}</div>
            <div className="text-sm text-green-600">Active Channels</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-2xl font-bold text-blue-700">{configurablePlatforms}</div>
            <div className="text-sm text-blue-600">Available Integrations</div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium">Distribution Channels</h4>
          <div className="space-y-2">
            {platforms.map((platform, index) => (
              <div key={index} className="flex items-center justify-between p-2 border rounded">
                <div className="flex items-center gap-2">
                  {platform.icon}
                  <div>
                    <div className="font-medium text-sm">{platform.name}</div>
                    <div className="text-xs text-muted-foreground">{platform.reach}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge 
                    variant={platform.status === 'active' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {platform.status === 'active' ? (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Active
                      </>
                    ) : (
                      'Setup Available'
                    )}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h5 className="font-medium text-blue-900 mb-1">Schema.org Event Markup</h5>
          <p className="text-sm text-blue-700">
            All events include comprehensive structured data for optimal search engine discovery and automatic ingestion by event platforms.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}