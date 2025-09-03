import React, { useState, useEffect } from 'react';
import { Clock, MapPin, Phone, Globe, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface BusinessHours {
  [key: string]: {
    open: string;
    close: string;
    isOpen: boolean;
  };
}

interface RealTimeBusinessInfo {
  id: string;
  name: string;
  category: 'restaurant' | 'attraction' | 'service';
  status: 'open' | 'closed' | 'closing-soon' | 'unknown';
  hours: BusinessHours;
  phone?: string;
  website?: string;
  lastUpdated: string;
  specialHours?: {
    date: string;
    hours: string;
    note: string;
  };
  liveUpdates?: {
    waitTime?: number;
    capacity?: 'low' | 'moderate' | 'high';
    specialOffers?: string[];
  };
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

  // Mock real-time business data - would integrate with actual APIs
  useEffect(() => {
    const fetchRealTimeData = () => {
      const currentTime = new Date();
      const currentDay = currentTime.toLocaleLowerCase().substring(0, 3); // mon, tue, etc.
      
      const mockBusinesses: RealTimeBusinessInfo[] = [
        {
          id: '1',
          name: 'Zombie Burger + Drink Lab',
          category: 'restaurant',
          status: 'open',
          hours: {
            mon: { open: '11:00', close: '21:00', isOpen: true },
            tue: { open: '11:00', close: '21:00', isOpen: true },
            wed: { open: '11:00', close: '21:00', isOpen: true },
            thu: { open: '11:00', close: '22:00', isOpen: true },
            fri: { open: '11:00', close: '23:00', isOpen: true },
            sat: { open: '11:00', close: '23:00', isOpen: true },
            sun: { open: '11:00', close: '21:00', isOpen: true }
          },
          phone: '(515) 244-6060',
          website: 'https://zombieburger.com',
          lastUpdated: new Date().toISOString(),
          liveUpdates: {
            waitTime: 15,
            capacity: 'moderate',
            specialOffers: ['Happy Hour until 6pm']
          }
        },
        {
          id: '2', 
          name: 'Science Center of Iowa',
          category: 'attraction',
          status: 'open',
          hours: {
            mon: { open: '10:00', close: '17:00', isOpen: true },
            tue: { open: '10:00', close: '17:00', isOpen: true },
            wed: { open: '10:00', close: '17:00', isOpen: true },
            thu: { open: '10:00', close: '17:00', isOpen: true },
            fri: { open: '10:00', close: '17:00', isOpen: true },
            sat: { open: '10:00', close: '17:00', isOpen: true },
            sun: { open: '12:00', close: '17:00', isOpen: true }
          },
          phone: '(515) 274-6868',
          website: 'https://sciowa.org',
          lastUpdated: new Date().toISOString(),
          specialHours: {
            date: '2024-12-25',
            hours: 'Closed',
            note: 'Closed for Christmas Day'
          },
          liveUpdates: {
            capacity: 'low',
            specialOffers: ['Family 4-pack discount available']
          }
        },
        {
          id: '3',
          name: 'Proof Restaurant',
          category: 'restaurant', 
          status: 'closing-soon',
          hours: {
            mon: { open: '16:00', close: '22:00', isOpen: false },
            tue: { open: '16:00', close: '22:00', isOpen: true },
            wed: { open: '16:00', close: '22:00', isOpen: true },
            thu: { open: '16:00', close: '23:00', isOpen: true },
            fri: { open: '16:00', close: '24:00', isOpen: true },
            sat: { open: '16:00', close: '24:00', isOpen: true },
            sun: { open: '16:00', close: '22:00', isOpen: false }
          },
          phone: '(515) 244-7765',
          website: 'https://proofrestaurant.com',
          lastUpdated: new Date().toISOString(),
          liveUpdates: {
            waitTime: 45,
            capacity: 'high'
          }
        }
      ];

      setBusinesses(mockBusinesses);
      setLoading(false);
      setLastUpdate(new Date());
    };

    fetchRealTimeData();

    // Update every 5 minutes for real-time accuracy
    const interval = setInterval(fetchRealTimeData, 5 * 60 * 1000);
    return () => clearInterval(interval);
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
            Live business hours and availability • Updated {lastUpdate.toLocaleTimeString()}
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
              {business.liveUpdates && (
                <div className="bg-blue-50 p-3 rounded-lg">
                  <h4 className="font-medium text-sm mb-2">Live Information</h4>
                  <div className="space-y-2 text-sm">
                    {business.liveUpdates.waitTime && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <span>Current wait time: ~{business.liveUpdates.waitTime} minutes</span>
                      </div>
                    )}
                    
                    {business.liveUpdates.capacity && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-blue-600" />
                        <span>Capacity: {business.liveUpdates.capacity}</span>
                        <Badge 
                          variant="secondary" 
                          className={
                            business.liveUpdates.capacity === 'low' ? 'bg-green-100 text-green-800' :
                            business.liveUpdates.capacity === 'moderate' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }
                        >
                          {business.liveUpdates.capacity === 'low' ? 'Good availability' :
                           business.liveUpdates.capacity === 'moderate' ? 'Moderate crowd' :
                           'Very busy'}
                        </Badge>
                      </div>
                    )}
                    
                    {business.liveUpdates.specialOffers && business.liveUpdates.specialOffers.length > 0 && (
                      <div className="mt-2">
                        <div className="font-medium text-green-700 mb-1">Current Offers:</div>
                        {business.liveUpdates.specialOffers.map((offer, index) => (
                          <div key={index} className="text-green-700">• {offer}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Special Hours Notice */}
              {business.specialHours && (
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                  <div className="flex items-center gap-2 text-amber-800">
                    <AlertCircle className="h-4 w-4" />
                    <span className="font-medium">Special Hours Notice</span>
                  </div>
                  <p className="text-sm text-amber-700 mt-1">
                    {business.specialHours.date}: {business.specialHours.hours} - {business.specialHours.note}
                  </p>
                </div>
              )}

              {/* Quick Action Buttons */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  Get Directions
                </Button>
                <Button variant="outline" size="sm" className="flex-1">
                  Call Now
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Real-time Features Explanation */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardContent className="p-6">
          <h3 className="font-semibold text-blue-900 mb-2">Why Real-Time Information Matters</h3>
          <p className="text-blue-800 text-sm leading-relaxed">
            Unlike static tourism guides, Des Moines Insider provides live business information 
            updated every 5 minutes. Check current wait times, availability, and special offers 
            before you visit. Perfect for Des Moines residents who need reliable, up-to-date 
            information about local businesses and attractions.
          </p>
          
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="secondary" className="bg-white/50">Live wait times</Badge>
            <Badge variant="secondary" className="bg-white/50">Current capacity</Badge>
            <Badge variant="secondary" className="bg-white/50">Special offers</Badge>
            <Badge variant="secondary" className="bg-white/50">Real-time hours</Badge>
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
export const RealTimeSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RealTimeBusinessInfo[]>([]);

  const handleSearch = (searchQuery: string) => {
    setQuery(searchQuery);
    
    // Voice search optimization for common queries
    const voiceQueries = {
      'restaurants open now': 'restaurant',
      'what restaurants are open': 'restaurant', 
      'things to do right now': 'attraction',
      'whats open in des moines': 'all'
    };
    
    // This would integrate with your real-time business API
    // For now, return mock results based on query
    console.log(`Real-time search: ${searchQuery}`);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          type="text"
          placeholder="What's open right now in Des Moines?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch(query)}
          className="w-full p-3 pr-12 border rounded-lg focus:ring-2 focus:ring-blue-500"
        />
        <Button 
          size="sm" 
          className="absolute right-2 top-1/2 transform -translate-y-1/2"
          onClick={() => handleSearch(query)}
        >
          Search
        </Button>
      </div>
      
      {/* Quick search buttons for common voice queries */}
      <div className="flex flex-wrap gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => handleSearch('restaurants open now')}
        >
          Restaurants Open Now
        </Button>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => handleSearch('attractions open today')}
        >
          Attractions Open Today  
        </Button>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => handleSearch('happy hour specials')}
        >
          Current Specials
        </Button>
      </div>
    </div>
  );
};