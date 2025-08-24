import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BusinessProfile {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string;
  description?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  latitude?: number;
  longitude?: number;
  logo_url?: string;
  cover_image_url?: string;
  business_hours?: any;
  amenities?: string[];
  social_media_links?: any;
  verification_status: string;
  is_featured: boolean;
  partnership_tier: string;
  monthly_fee?: number;
  contract_start_date?: string;
  contract_end_date?: string;
  created_at: string;
  updated_at: string;
}

interface PartnershipApplication {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string;
  contact_email: string;
  contact_phone?: string;
  website?: string;
  description?: string;
  desired_tier: string;
  status: string;
  admin_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
}

interface PartnershipBenefit {
  id: string;
  tier: string;
  benefit_name: string;
  benefit_description?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

interface AdvertisingPackage {
  id: string;
  package_name: string;
  package_description?: string;
  price_monthly: number;
  features: any;
  max_ads_per_month: number;
  ad_placements: any;
  is_active: boolean;
  created_at: string;
}

interface BusinessAnalytics {
  id: string;
  business_id: string;
  date: string;
  profile_views: number;
  website_clicks: number;
  phone_clicks: number;
  direction_requests: number;
  ad_impressions: number;
  ad_clicks: number;
  social_media_clicks: number;
  created_at: string;
}

export function useBusinessPartnership() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [applications, setApplications] = useState<PartnershipApplication[]>([]);
  const [benefits, setBenefits] = useState<PartnershipBenefit[]>([]);
  const [advertisingPackages, setAdvertisingPackages] = useState<AdvertisingPackage[]>([]);
  const [analytics, setAnalytics] = useState<BusinessAnalytics[]>([]);

  // Fetch partnership benefits
  const fetchBenefits = async () => {
    try {
      const { data, error } = await supabase
        .from('partnership_benefits')
        .select('*')
        .eq('is_active', true)
        .order('tier, sort_order');

      if (error) throw error;
      setBenefits(data || []);
      return data || [];
    } catch (error) {
      console.error('Failed to fetch benefits:', error);
      return [];
    }
  };

  // Fetch advertising packages
  const fetchAdvertisingPackages = async () => {
    try {
      const { data, error } = await supabase
        .from('advertising_packages')
        .select('*')
        .eq('is_active', true)
        .order('price_monthly');

      if (error) throw error;
      setAdvertisingPackages(data || []);
      return data || [];
    } catch (error) {
      console.error('Failed to fetch advertising packages:', error);
      return [];
    }
  };

  // Fetch user's business profile
  const fetchBusinessProfile = async () => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setBusinessProfile(data);
      return data;
    } catch (error) {
      console.error('Failed to fetch business profile:', error);
      return null;
    }
  };

  // Fetch user's applications
  const fetchApplications = async () => {
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('partnership_applications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApplications(data || []);
      return data || [];
    } catch (error) {
      console.error('Failed to fetch applications:', error);
      return [];
    }
  };

  // Create business profile
  const createBusinessProfile = async (profileData: any) => {
    if (!user) return null;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('business_profiles')
        .insert({
          business_name: profileData.business_name || '',
          business_type: profileData.business_type || 'restaurant',
          user_id: user.id,
          ...profileData
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Business profile created successfully!');
      setBusinessProfile(data);
      return data;
    } catch (error) {
      console.error('Failed to create business profile:', error);
      toast.error('Failed to create business profile');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Update business profile
  const updateBusinessProfile = async (profileData: Partial<BusinessProfile>) => {
    if (!user || !businessProfile) return null;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('business_profiles')
        .update(profileData)
        .eq('id', businessProfile.id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Business profile updated successfully!');
      setBusinessProfile(data);
      return data;
    } catch (error) {
      console.error('Failed to update business profile:', error);
      toast.error('Failed to update business profile');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Submit partnership application
  const submitApplication = async (applicationData: any) => {
    if (!user) return null;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('partnership_applications')
        .insert({
          business_name: applicationData.business_name || '',
          business_type: applicationData.business_type || 'restaurant',
          contact_email: applicationData.contact_email || user.email || '',
          user_id: user.id,
          ...applicationData
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Partnership application submitted successfully!');
      await fetchApplications();
      return data;
    } catch (error) {
      console.error('Failed to submit application:', error);
      toast.error('Failed to submit application');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Fetch business analytics
  const fetchAnalytics = async (businessId: string, days: number = 30) => {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('business_analytics')
        .select('*')
        .eq('business_id', businessId)
        .gte('date', startDate.toISOString().split('T')[0])
        .order('date', { ascending: false });

      if (error) throw error;
      setAnalytics(data || []);
      return data || [];
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      return [];
    }
  };

  // Track analytics event
  const trackAnalyticsEvent = async (businessId: string, eventType: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get current analytics for today
      const { data: currentData } = await supabase
        .from('business_analytics')
        .select('*')
        .eq('business_id', businessId)
        .eq('date', today)
        .single();

      const updateData: any = {};
      updateData[eventType] = (currentData?.[eventType] || 0) + 1;

      if (currentData) {
        // Update existing record
        await supabase
          .from('business_analytics')
          .update(updateData)
          .eq('id', currentData.id);
      } else {
        // Create new record
        await supabase
          .from('business_analytics')
          .insert({
            business_id: businessId,
            date: today,
            ...updateData
          });
      }
    } catch (error) {
      console.error('Failed to track analytics event:', error);
    }
  };

  // Initialize data
  useEffect(() => {
    fetchBenefits();
    fetchAdvertisingPackages();
    if (user) {
      fetchBusinessProfile();
      fetchApplications();
    }
  }, [user]);

  return {
    // State
    loading,
    businessProfile,
    applications,
    benefits,
    advertisingPackages,
    analytics,

    // Business Profile functions
    createBusinessProfile,
    updateBusinessProfile,
    fetchBusinessProfile,

    // Application functions
    submitApplication,
    fetchApplications,

    // Analytics functions
    fetchAnalytics,
    trackAnalyticsEvent,

    // Utility functions
    fetchBenefits,
    fetchAdvertisingPackages,

    // Refresh
    refresh: () => {
      if (user) {
        fetchBusinessProfile();
        fetchApplications();
        fetchBenefits();
        fetchAdvertisingPackages();
      }
    }
  };
}