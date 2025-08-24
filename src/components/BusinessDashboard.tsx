import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBusinessPartnership } from "@/hooks/useBusinessPartnership";
import { useAuth } from "@/hooks/useAuth";
import { 
  Building2, 
  BarChart3, 
  Phone, 
  Globe, 
  MapPin, 
  Eye, 
  MousePointer, 
  Star,
  Calendar,
  TrendingUp
} from "lucide-react";

export function BusinessDashboard() {
  const { user } = useAuth();
  const { 
    businessProfile, 
    analytics, 
    fetchAnalytics, 
    updateBusinessProfile, 
    createBusinessProfile,
    loading 
  } = useBusinessPartnership();

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    business_name: '',
    business_type: 'restaurant',
    description: '',
    website: '',
    phone: '',
    email: '',
    address: '',
    city: 'Des Moines',
    state: 'Iowa',
    zip_code: ''
  });

  useEffect(() => {
    if (businessProfile) {
      setFormData({
        business_name: businessProfile.business_name || '',
        business_type: businessProfile.business_type || 'restaurant',
        description: businessProfile.description || '',
        website: businessProfile.website || '',
        phone: businessProfile.phone || '',
        email: businessProfile.email || '',
        address: businessProfile.address || '',
        city: businessProfile.city || 'Des Moines',
        state: businessProfile.state || 'Iowa',
        zip_code: businessProfile.zip_code || ''
      });
      fetchAnalytics(businessProfile.id);
    }
  }, [businessProfile]);

  const handleSave = async () => {
    if (businessProfile) {
      await updateBusinessProfile(formData);
    } else {
      await createBusinessProfile(formData);
    }
    setIsEditing(false);
  };

  const calculateTotalViews = () => {
    return analytics.reduce((sum, day) => sum + day.profile_views, 0);
  };

  const calculateTotalClicks = () => {
    return analytics.reduce((sum, day) => 
      sum + day.website_clicks + day.phone_clicks + day.direction_requests, 0);
  };

  const getVerificationBadge = () => {
    if (!businessProfile) return null;
    
    const status = businessProfile.verification_status;
    const colors = {
      verified: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      rejected: 'bg-red-100 text-red-800'
    };

    return (
      <Badge className={colors[status as keyof typeof colors] || colors.pending}>
        {status}
      </Badge>
    );
  };

  const getTierBadge = () => {
    if (!businessProfile) return null;
    
    const tier = businessProfile.partnership_tier;
    const colors = {
      basic: 'bg-blue-100 text-blue-800',
      premium: 'bg-purple-100 text-purple-800',
      enterprise: 'bg-gold-100 text-gold-800'
    };

    return (
      <Badge className={colors[tier as keyof typeof colors] || colors.basic}>
        {tier} partner
      </Badge>
    );
  };

  if (!user) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Building2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">Sign in to access business dashboard</p>
        </CardContent>
      </Card>
    );
  }

  if (!businessProfile && !isEditing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Business Profile Setup
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">You don't have a business profile yet. Create one to get started!</p>
          <Button onClick={() => setIsEditing(true)}>
            Create Business Profile
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Business Overview */}
      {businessProfile && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{calculateTotalViews()}</p>
                  <p className="text-xs text-muted-foreground">Profile Views</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <MousePointer className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{calculateTotalClicks()}</p>
                  <p className="text-xs text-muted-foreground">Total Interactions</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{analytics.length}</p>
                  <p className="text-xs text-muted-foreground">Days Tracked</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <Star className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{businessProfile.partnership_tier}</p>
                  <p className="text-xs text-muted-foreground">Partnership Tier</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="partnership">Partnership</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Business Profile</CardTitle>
                <Button 
                  variant={isEditing ? "default" : "outline"}
                  onClick={isEditing ? handleSave : () => setIsEditing(true)}
                  disabled={loading}
                >
                  {isEditing ? 'Save Changes' : 'Edit Profile'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Business Name</label>
                    <Input
                      value={formData.business_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, business_name: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Business Type</label>
                    <Input
                      value={formData.business_type}
                      onChange={(e) => setFormData(prev => ({ ...prev, business_type: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Phone</label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Website</label>
                    <Input
                      value={formData.website}
                      onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Address</label>
                    <Input
                      value={formData.address}
                      onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">Description</label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      rows={4}
                    />
                  </div>
                </div>
              ) : businessProfile ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    {getVerificationBadge()}
                    {getTierBadge()}
                    {businessProfile.is_featured && (
                      <Badge className="bg-gold-100 text-gold-800">Featured</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="font-medium">Business Name</p>
                      <p className="text-muted-foreground">{businessProfile.business_name}</p>
                    </div>

                    <div>
                      <p className="font-medium">Business Type</p>
                      <p className="text-muted-foreground">{businessProfile.business_type}</p>
                    </div>

                    {businessProfile.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        <div>
                          <p className="font-medium">Phone</p>
                          <p className="text-muted-foreground">{businessProfile.phone}</p>
                        </div>
                      </div>
                    )}

                    {businessProfile.website && (
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        <div>
                          <p className="font-medium">Website</p>
                          <p className="text-muted-foreground">{businessProfile.website}</p>
                        </div>
                      </div>
                    )}

                    {businessProfile.address && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        <div>
                          <p className="font-medium">Address</p>
                          <p className="text-muted-foreground">{businessProfile.address}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {businessProfile.description && (
                    <div>
                      <p className="font-medium">Description</p>
                      <p className="text-muted-foreground">{businessProfile.description}</p>
                    </div>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Analytics Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.length > 0 ? (
                <div className="space-y-4">
                  {analytics.slice(0, 10).map((day) => (
                    <div key={day.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span className="font-medium">{new Date(day.date).toLocaleDateString()}</span>
                      </div>
                      <div className="flex gap-4 text-sm text-muted-foreground">
                        <span>{day.profile_views} views</span>
                        <span>{day.website_clicks} website clicks</span>
                        <span>{day.phone_clicks} phone clicks</span>
                        <span>{day.direction_requests} directions</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No analytics data available yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="partnership" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Partnership Information</CardTitle>
            </CardHeader>
            <CardContent>
              {businessProfile ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="font-medium">Partnership Tier</p>
                      <p className="text-muted-foreground capitalize">{businessProfile.partnership_tier}</p>
                    </div>

                    <div>
                      <p className="font-medium">Verification Status</p>
                      <p className="text-muted-foreground capitalize">{businessProfile.verification_status}</p>
                    </div>

                    {businessProfile.monthly_fee && (
                      <div>
                        <p className="font-medium">Monthly Fee</p>
                        <p className="text-muted-foreground">${businessProfile.monthly_fee}</p>
                      </div>
                    )}

                    {businessProfile.contract_start_date && (
                      <div>
                        <p className="font-medium">Contract Start</p>
                        <p className="text-muted-foreground">
                          {new Date(businessProfile.contract_start_date).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>

                  {businessProfile.verification_status === 'pending' && (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="text-sm text-yellow-800">
                        Your business profile is currently under review. You'll be notified once it's been verified.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">No partnership information available.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}