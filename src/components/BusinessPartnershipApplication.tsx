import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBusinessPartnership } from "@/hooks/useBusinessPartnership";
import { useAuth } from "@/hooks/useAuth";
import { Building2, Send, CheckCircle, Clock, XCircle } from "lucide-react";

export function BusinessPartnershipApplication() {
  const { user } = useAuth();
  const { submitApplication, applications, benefits, loading } = useBusinessPartnership();
  
  const [formData, setFormData] = useState({
    business_name: '',
    business_type: 'restaurant',
    contact_email: user?.email || '',
    contact_phone: '',
    website: '',
    description: '',
    desired_tier: 'basic'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await submitApplication(formData);
    if (result) {
      setFormData({
        business_name: '',
        business_type: 'restaurant',
        contact_email: user?.email || '',
        contact_phone: '',
        website: '',
        description: '',
        desired_tier: 'basic'
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'rejected': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'under_review': return <Clock className="w-4 h-4 text-blue-500" />;
      default: return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'under_review': return 'bg-blue-100 text-blue-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getBenefitsByTier = (tier: string) => {
    return benefits.filter(benefit => benefit.tier === tier);
  };

  if (!user) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Building2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">Sign in to apply for business partnership</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Partnership Tiers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {['basic', 'premium', 'enterprise'].map((tier) => (
          <Card key={tier} className={`${formData.desired_tier === tier ? 'ring-2 ring-primary' : ''}`}>
            <CardHeader>
              <CardTitle className="capitalize">{tier} Partnership</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {getBenefitsByTier(tier).map((benefit) => (
                  <div key={benefit.id} className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{benefit.benefit_name}</p>
                      {benefit.benefit_description && (
                        <p className="text-xs text-muted-foreground">{benefit.benefit_description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant={formData.desired_tier === tier ? "default" : "outline"}
                onClick={() => setFormData(prev => ({ ...prev, desired_tier: tier }))}
                className="w-full"
              >
                Select {tier}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Application Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Partnership Application
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Business Name *</label>
                <Input
                  placeholder="Enter your business name"
                  value={formData.business_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, business_name: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Business Type *</label>
                <Select value={formData.business_type} onValueChange={(value) => setFormData(prev => ({ ...prev, business_type: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="restaurant">Restaurant</SelectItem>
                    <SelectItem value="retail">Retail</SelectItem>
                    <SelectItem value="entertainment">Entertainment</SelectItem>
                    <SelectItem value="fitness">Fitness & Wellness</SelectItem>
                    <SelectItem value="professional_services">Professional Services</SelectItem>
                    <SelectItem value="healthcare">Healthcare</SelectItem>
                    <SelectItem value="education">Education</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Contact Email *</label>
                <Input
                  type="email"
                  placeholder="Enter contact email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Contact Phone</label>
                <Input
                  type="tel"
                  placeholder="Enter contact phone"
                  value={formData.contact_phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, contact_phone: e.target.value }))}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Website</label>
                <Input
                  type="url"
                  placeholder="https://www.yourwebsite.com"
                  value={formData.website}
                  onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Business Description</label>
              <Textarea
                placeholder="Tell us about your business..."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={4}
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                <>Submitting...</>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Submit Application
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Previous Applications */}
      {applications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Applications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {applications.map((application) => (
                <div key={application.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">{application.business_name}</h3>
                    <Badge className={getStatusColor(application.status)}>
                      {getStatusIcon(application.status)}
                      <span className="ml-1 capitalize">{application.status.replace('_', ' ')}</span>
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                    <div>
                      <span className="font-medium">Type:</span> {application.business_type}
                    </div>
                    <div>
                      <span className="font-medium">Desired Tier:</span> {application.desired_tier}
                    </div>
                    <div>
                      <span className="font-medium">Applied:</span> {new Date(application.created_at).toLocaleDateString()}
                    </div>
                    {application.reviewed_at && (
                      <div>
                        <span className="font-medium">Reviewed:</span> {new Date(application.reviewed_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  {application.admin_notes && (
                    <div className="mt-2 p-2 bg-muted rounded text-sm">
                      <span className="font-medium">Admin Notes:</span> {application.admin_notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}