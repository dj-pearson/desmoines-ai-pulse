import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createLogger } from "@/lib/logger";

const log = createLogger("useNewsletterSubscription");

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

  // Subscribe to newsletter.
  //
  // WEB-FEAT-019: this used to insert straight into newsletter_subscribers from
  // the browser. Two things a client cannot do are now done by the
  // newsletter-subscribe edge function under the service role:
  //   - write status 'pending' with a confirm token the browser must never see;
  //   - upsert on email, so an address that unsubscribed can come back. The
  //     table has no UPDATE policy for any role, so the old insert could only
  //     ever hit 23505 and tell the person they were already subscribed.
  const subscribe = async (data: NewsletterSubscribeData): Promise<boolean> => {
    try {
      setLoading(true);

      const urlParams = new URLSearchParams(window.location.search);

      const { data: result, error } = await supabase.functions.invoke(
        "newsletter-subscribe",
        {
          body: {
            email: data.email.toLowerCase().trim(),
            firstName: data.firstName || null,
            source: data.source || "website",
            preferences: { ...defaultPreferences, ...data.preferences },
            utm: {
              utm_source: urlParams.get("utm_source"),
              utm_medium: urlParams.get("utm_medium"),
              utm_campaign: urlParams.get("utm_campaign"),
            },
          },
        },
      );

      if (error) throw error;

      // The function answers ONE sentence for every outcome - new address,
      // pending, unsubscribed, already active - because any per-case wording
      // turns a public endpoint into an "is this person subscribed" oracle.
      // Showing its message rather than inventing one here is what keeps that
      // property true on the screen as well as on the wire.
      toast.success(
        result?.message ??
          "Almost there - check your inbox for a confirmation link.",
      );
      return true;
    } catch (error) {
      log.error("subscribe", "Failed to subscribe", { data: error });
      toast.error("Failed to subscribe. Please try again.");
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
