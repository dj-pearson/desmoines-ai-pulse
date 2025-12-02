import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface NewsletterPreferences {
  weekly_digest: boolean;
  event_alerts: boolean;
  restaurant_updates: boolean;
  promotions: boolean;
}

export interface NewsletterSubscribeData {
  email: string;
  firstName?: string;
  source?: 'website' | 'popup' | 'footer' | 'checkout' | 'hero';
  preferences?: Partial<NewsletterPreferences>;
}

const defaultPreferences: NewsletterPreferences = {
  weekly_digest: true,
  event_alerts: true,
  restaurant_updates: true,
  promotions: true,
};

export function useNewsletterSubscription() {
  const [loading, setLoading] = useState(false);

  // Subscribe to newsletter
  const subscribe = async (data: NewsletterSubscribeData): Promise<boolean> => {
    try {
      setLoading(true);

      // Get UTM parameters from URL
      const urlParams = new URLSearchParams(window.location.search);

      const subscriptionData: Record<string, unknown> = {
        email: data.email.toLowerCase().trim(),
        first_name: data.firstName || null,
        source: data.source || 'website',
        preferences: { ...defaultPreferences, ...data.preferences },
        ip_address: null, // Would need server-side to capture
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        utm_source: urlParams.get('utm_source') || null,
        utm_medium: urlParams.get('utm_medium') || null,
        utm_campaign: urlParams.get('utm_campaign') || null,
      };

      const { error } = await supabase
        .from('newsletter_subscribers')
        .insert(subscriptionData as any);

      if (error) {
        // Handle duplicate email error
        if (error.code === '23505') {
          toast.info("You're already subscribed! Check your inbox for our latest updates.");
          return true;
        }
        throw error;
      }

      toast.success("Welcome aboard! Check your email for a confirmation.");
      return true;
    } catch (error) {
      console.error('Failed to subscribe:', error);
      toast.error('Failed to subscribe. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Unsubscribe from newsletter (requires email token in production)
  const unsubscribe = async (email: string): Promise<boolean> => {
    try {
      setLoading(true);

      const { error } = await supabase
        .from('newsletter_subscribers')
        .update({
          status: 'unsubscribed',
          unsubscribed_at: new Date().toISOString(),
        } as any)
        .eq('email', email.toLowerCase().trim());

      if (error) throw error;

      toast.success("You've been unsubscribed. We're sorry to see you go!");
      return true;
    } catch (error) {
      console.error('Failed to unsubscribe:', error);
      toast.error('Failed to unsubscribe. Please contact support.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Update preferences (requires email token in production)
  const updatePreferences = async (
    email: string,
    preferences: Partial<NewsletterPreferences>
  ): Promise<boolean> => {
    try {
      setLoading(true);

      // Fetch current preferences first
      const { data: currentData, error: fetchError } = await supabase
        .from('newsletter_subscribers')
        .select('preferences')
        .eq('email', email.toLowerCase().trim())
        .single();

      if (fetchError) throw fetchError;

      const updatedPreferences = {
        ...defaultPreferences,
        ...(currentData?.preferences || {}),
        ...preferences,
      };

      const { error } = await supabase
        .from('newsletter_subscribers')
        .update({ preferences: updatedPreferences } as any)
        .eq('email', email.toLowerCase().trim());

      if (error) throw error;

      toast.success('Preferences updated successfully!');
      return true;
    } catch (error) {
      console.error('Failed to update preferences:', error);
      toast.error('Failed to update preferences. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    subscribe,
    unsubscribe,
    updatePreferences,
  };
}
