import React from 'react';
import SEOHead from '@/components/SEOHead';
import RealTimeBusinessInfo, { RealTimeSearch } from '@/components/RealTimeBusinessInfo';
import UserGeneratedContent, { QuickUpdateWidget } from '@/components/UserGeneratedContent';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Users, MessageSquare, TrendingUp } from 'lucide-react';

/**
 * Real-time information hub page
 * Key differentiator from CatchDesMoines static tourism content
 * Focuses on live business information and community insights
 */
export default function RealTimePage() {
  const realTimePageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Real-Time Des Moines Business Information",
    "description": "Live business hours, wait times, and community updates for Des Moines area",
    "url": "https://desmoinesinsider.com/real-time",
    "mainEntity": {
      "@type": "ItemList",
      "name": "Live Business Updates",
      "itemListElement": [
        {
          "@type": "LocalBusiness",
          "name": "Des Moines Area Restaurants",
          "description": "Real-time hours and availability"
        },
        {
          "@type": "TouristAttraction", 
          "name": "Des Moines Attractions",
          "description": "Live capacity and wait times"
        }
      ]
    },
    "about": {
      "@type": "Place",
      "name": "Des Moines, Iowa",
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": "41.5868",
        "longitude": "-93.6250"
      }
    },
    "audience": {
      "@type": "Audience",
      "audienceType": "Des Moines residents and locals"
    }
  };

  return (
    <>
      <SEOHead
        title="What's Open Right Now in Des Moines | Live Business Information"
        description="Live business hours, wait times, and community updates for Des Moines restaurants, attractions, and services. Real-time information updated every 5 minutes by local residents."
        type="website"
        keywords={[
          "Des Moines open now",
          "what's open Des Moines",
          "restaurant hours Des Moines",
          "live business information",
          "Des Moines wait times",
          "open restaurants near me",
          "Des Moines real time updates"
        ]}
        structuredData={realTimePageSchema}
        url="/real-time"
      />

      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-4 mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-full text-sm font-medium mb-4">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            Live Updates Every 5 Minutes
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
            What's <span className="text-blue-600">Open Right Now</span> in Des Moines
          </h1>
          
          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Real-time business information from Des Moines residents. Check current hours, 
            wait times, and availability before you visit. No more showing up to closed doors.
          </p>

          {/* Quick Stats */}
          <div className="flex justify-center gap-8 mt-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">500+</div>
              <div className="text-sm text-gray-600">Businesses Tracked</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">5 min</div>
              <div className="text-sm text-gray-600">Update Frequency</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">24/7</div>
              <div className="text-sm text-gray-600">Community Updates</div>
            </div>
          </div>
        </div>

        {/* Real-time Search */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              Find What's Open Now
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RealTimeSearch />
          </CardContent>
        </Card>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content - Real-time Business Info */}
          <div className="lg:col-span-2">
            <RealTimeBusinessInfo />
          </div>

          {/* Sidebar - Quick Updates */}
          <div className="space-y-6">
            <QuickUpdateWidget />
            
            {/* Feature Highlights */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Why Real-Time Info?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-blue-500 mt-1" />
                  <div>
                    <div className="font-medium text-sm">Live Hours</div>
                    <div className="text-xs text-gray-600">Current operating status, not outdated listings</div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <Users className="h-5 w-5 text-green-500 mt-1" />
                  <div>
                    <div className="font-medium text-sm">Wait Times</div>
                    <div className="text-xs text-gray-600">Know before you go - avoid disappointment</div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-5 w-5 text-purple-500 mt-1" />
                  <div>
                    <div className="font-medium text-sm">Community Intel</div>
                    <div className="text-xs text-gray-600">Local insights you won't find anywhere else</div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <TrendingUp className="h-5 w-5 text-orange-500 mt-1" />
                  <div>
                    <div className="font-medium text-sm">Special Offers</div>
                    <div className="text-xs text-gray-600">Current deals and happy hour specials</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Competitive Advantage */}
            <Card className="bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200">
              <CardContent className="p-4">
                <div className="text-center space-y-2">
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    Des Moines Insider Advantage
                  </Badge>
                  <h3 className="font-semibold text-blue-900">Beyond Tourism Guides</h3>
                  <p className="text-sm text-blue-700 leading-relaxed">
                    While other sites focus on tourist attractions, we provide 
                    real-time information for Des Moines residents who need to know 
                    what's actually open, busy, or worth visiting today.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Community Reviews Section */}
        <div className="mt-12">
          <UserGeneratedContent />
        </div>

        {/* Bottom Call-to-Action */}
        <Card className="bg-gradient-to-r from-green-500 to-blue-600 text-white border-0">
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Join the Des Moines Community</h2>
            <p className="text-lg mb-6 opacity-90">
              Help fellow residents by sharing real-time updates about local businesses
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button className="bg-white text-blue-600 px-6 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors">
                Share an Update
              </button>
              <button className="bg-transparent border-2 border-white px-6 py-3 rounded-lg font-medium hover:bg-white hover:text-blue-600 transition-colors">
                Leave a Review
              </button>
            </div>
          </CardContent>
        </Card>

        {/* SEO Content Section */}
        <div className="mt-16 prose prose-lg max-w-none">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            Real-Time Business Information for Des Moines Residents
          </h2>
          
          <div className="grid md:grid-cols-2 gap-8 text-gray-700">
            <div>
              <h3 className="text-xl font-semibold mb-4 text-gray-900">Why Real-Time Information Matters</h3>
              <p className="mb-4">
                Des Moines Insider provides live business information that tourist guides can't offer. 
                Our community-driven platform updates every 5 minutes with real conditions from local 
                residents who frequent these businesses.
              </p>
              
              <h4 className="text-lg font-medium mb-3 text-gray-900">What Makes Us Different</h4>
              <ul className="space-y-2 text-sm">
                <li>• <strong>Live wait times</strong> from actual customers</li>
                <li>• <strong>Current availability</strong> and capacity levels</li>
                <li>• <strong>Special offers</strong> and happy hour updates</li>
                <li>• <strong>Real operating hours</strong> including holiday changes</li>
                <li>• <strong>Community insights</strong> from Des Moines families</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold mb-4 text-gray-900">For Residents, By Residents</h3>
              <p className="mb-4">
                Unlike tourism-focused platforms like CatchDesMoines, our community shares experiences 
                from the resident perspective. We know which restaurants are family-friendly, where 
                to find the best local specials, and when places are actually worth visiting.
              </p>
              
              <h4 className="text-lg font-medium mb-3 text-gray-900">Community Features</h4>
              <ul className="space-y-2 text-sm">
                <li>• <strong>Verified local reviews</strong> from Des Moines residents</li>
                <li>• <strong>Real-time updates</strong> on business conditions</li>
                <li>• <strong>Family-focused insights</strong> for local parents</li>
                <li>• <strong>Seasonal information</strong> for year-round residents</li>
                <li>• <strong>Neighborhood context</strong> beyond downtown tourist areas</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 p-6 bg-gray-50 rounded-lg">
            <h3 className="text-xl font-semibold mb-4 text-gray-900">Popular Real-Time Searches</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="font-medium text-gray-900">Restaurants</div>
                <ul className="mt-2 space-y-1 text-gray-600">
                  <li>• "restaurants open now"</li>
                  <li>• "Des Moines wait times"</li>
                  <li>• "happy hour specials"</li>
                </ul>
              </div>
              <div>
                <div className="font-medium text-gray-900">Attractions</div>
                <ul className="mt-2 space-y-1 text-gray-600">
                  <li>• "Science Center hours"</li>
                  <li>• "Adventureland crowds"</li>
                  <li>• "events today"</li>
                </ul>
              </div>
              <div>
                <div className="font-medium text-gray-900">Services</div>
                <ul className="mt-2 space-y-1 text-gray-600">
                  <li>• "pharmacy hours"</li>
                  <li>• "grocery store open"</li>
                  <li>• "gas station near me"</li>
                </ul>
              </div>
              <div>
                <div className="font-medium text-gray-900">Family</div>
                <ul className="mt-2 space-y-1 text-gray-600">
                  <li>• "kids activities today"</li>
                  <li>• "playgrounds open"</li>
                  <li>• "family restaurants"</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}