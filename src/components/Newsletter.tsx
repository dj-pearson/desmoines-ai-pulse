import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Mail, CheckCircle, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    try {
      // Get UTM parameters from URL
      const urlParams = new URLSearchParams(window.location.search);
      const utmSource = urlParams.get('utm_source');
      const utmMedium = urlParams.get('utm_medium');
      const utmCampaign = urlParams.get('utm_campaign');

      // Insert into newsletter_subscribers table
      const { error } = await supabase
        .from('newsletter_subscribers')
        .insert({
          email: email.toLowerCase().trim(),
          source: 'website_hero',
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
        });

      if (error) {
        // Check if it's a duplicate email error
        if (error.code === '23505') {
          toast({
            title: "Already subscribed!",
            description: "This email is already on our list. Thanks for your enthusiasm!",
          });
          setEmail("");
          return;
        }
        throw error;
      }

      setIsSubscribed(true);
      toast({
        title: "Welcome to the Insider community!",
        description: "You'll receive the latest Des Moines updates in your inbox.",
      });
      setEmail("");
    } catch (error) {
      console.error('Newsletter signup error:', error);
      toast({
        title: "Subscription failed",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubscribed) {
    return (
      <section
        className="py-16 bg-gradient-to-r from-[#2D1B69] to-[#8B0000]"
        id="newsletter"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-green-500 rounded-full p-4">
              <CheckCircle className="h-12 w-12 text-white" />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-white mb-4">You're In!</h3>
          <p className="text-xl text-white/90 mb-4">
            Welcome to the Des Moines Insider community
          </p>
          <p className="text-white/70">
            Check your inbox for a welcome email with this week's top picks.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="py-16 bg-gradient-to-r from-[#2D1B69] to-[#8B0000]"
      id="newsletter"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Social Proof Badge */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="flex -space-x-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center"
              >
                <Users className="h-4 w-4 text-white/80" />
              </div>
            ))}
          </div>
          <span className="text-white/90 text-sm font-medium ml-2">
            Join 15,000+ Des Moines insiders
          </span>
        </div>

        <div className="flex justify-center mb-6">
          <Mail className="h-12 w-12 text-white" />
        </div>
        <h3 className="text-3xl font-bold text-white mb-4">Stay in the Loop</h3>
        <p className="text-xl text-white/90 mb-8">
          Get weekly updates on the best events, new restaurant openings, and
          hidden gems in Des Moines
        </p>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto"
          aria-label="Newsletter subscription form"
        >
          <Input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 h-12 bg-white/10 border-white/30 text-white placeholder:text-white/60"
            required
            aria-label="Email address for newsletter"
            id="newsletter-email"
            name="email"
          />
          <Button
            type="submit"
            disabled={isLoading}
            className="h-12 px-8 bg-green-600 hover:bg-green-700 text-white font-semibold"
            aria-label="Subscribe to newsletter"
          >
            {isLoading ? "Subscribing..." : "Subscribe Free"}
          </Button>
        </form>

        <p className="text-white/70 text-sm mt-4">
          No spam, ever. Unsubscribe anytime.
        </p>

        {/* Trust indicators */}
        <div className="flex flex-wrap items-center justify-center gap-6 mt-8 text-white/60 text-sm">
          <span className="flex items-center gap-1">
            <CheckCircle className="h-4 w-4" /> Weekly digest
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle className="h-4 w-4" /> Event alerts
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle className="h-4 w-4" /> Exclusive deals
          </span>
        </div>
      </div>
    </section>
  );
}
