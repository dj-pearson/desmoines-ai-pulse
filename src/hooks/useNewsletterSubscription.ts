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
        // A duplicate address (WEB-FEAT-019). The old copy was "You're already
        // subscribed! Check your inbox for our latest updates", and for the
        // person most likely to see it - someone who unsubscribed and is
        // trying to come back - BOTH halves were false: their row is
        // status='unsubscribed', and nothing is going to their inbox. This
        // hook cannot tell the two apart, because the SELECT policy on
        // newsletter_subscribers is admin-only, so the copy says only what is
        // certainly true. Resubscribing needs an UPDATE path that does not
        // exist yet; the story tracks it.
        if (error.code === '23505') {
          toast.info(
            "That address is already on our list. If you unsubscribed before and want back in, email us and we'll sort it out.",
          );
          return true;
        }
        throw error;
      }

      // WEB-FEAT-019: this said "Check your email for a confirmation." Nothing
      // sends one. There is no confirmation flow anywhere in the repo - no
      // token, no double opt-in, no sender - so the row is written with the
      // default status and that was the end of it. People were left waiting
      // for an email that does not exist, and the ones who concluded the
      // signup had failed were closer to right than the ones who trusted it.
      // The copy now describes what actually happens.
      toast.success("You're on the list. The next Des Moines digest will come straight to your inbox.");
      return true;
    } catch (error) {
      console.error('Failed to subscribe:', error);
      toast.error('Failed to subscribe. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // WEB-FEAT-019: unsubscribe() and updatePreferences() USED TO LIVE HERE and
  // are deleted rather than fixed, because neither could work from a browser
  // and one of them lied about it.
  //
  // newsletter_subscribers has exactly two policies (migration
  // 20251126000000): INSERT for anyone, SELECT for admins. There is no UPDATE
  // policy at all. So unsubscribe()'s UPDATE matched zero rows, PostgREST
  // returned no error for that, and the hook announced "You've been
  // unsubscribed. We're sorry to see you go!" - a false success on the one
  // action a person has a legal right to. updatePreferences() read first, so
  // it failed loudly instead, which is only better by accident.
  //
  // Neither had a caller: NewsletterSignup.tsx uses `subscribe` alone. The
  // unsubscribe path belongs in an emailed token link handled server-side,
  // where the service role can actually write. Do not re-add a client-side
  // version.

  return {
    loading,
    subscribe,
  };
}
