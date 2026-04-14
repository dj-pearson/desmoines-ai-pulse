import { useState } from "react";
import { Heart, Mail, Calendar, Utensils, MapPin, Building2, Crown, ArrowRight, Facebook, Twitter, Instagram, PlusCircle, Users, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { OptimizedLogo } from "@/components/OptimizedLogo";
import { logConsent } from "@/lib/consentLog";

export default function Footer() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('newsletter_subscribers')
        .insert({
          email: email.toLowerCase().trim(),
          source: 'footer',
        });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: "Already subscribed!",
            description: "You're already on our list.",
          });
          setEmail("");
          return;
        }
        throw error;
      }

      // Record affirmative marketing-email consent for CAN-SPAM / GDPR proof.
      void logConsent({
        type: "newsletter",
        granted: true,
        source: "newsletter_form",
        email: email.toLowerCase().trim(),
        metadata: { location: "footer" },
      });

      toast({
        title: "Subscribed!",
        description: "Welcome to the Des Moines Insider community. You can unsubscribe any time via the link in every email.",
      });
      setEmail("");
    } catch (error) {
      toast({
        title: "Error",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <footer className="bg-neutral-900 text-white">
      {/* CTA Banner */}
      <div className="bg-gradient-to-r from-primary to-primary/80 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-center md:text-left">
              <h3 className="text-xl font-bold text-white mb-1">
                Unlock Premium Features
              </h3>
              <p className="text-white/90 text-sm">
                Get early event access, unlimited favorites & personalized recommendations
              </p>
            </div>
            <Link to="/pricing">
              <Button size="lg" variant="secondary" className="font-semibold">
                <Crown className="h-4 w-4 mr-2" />
                View Plans
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
            {/* Brand */}
            <div className="lg:col-span-2">
              <OptimizedLogo
                variant="logo2"
                alt="Des Moines Insider"
                className="h-12 w-auto mb-4"
                height={48}
                loading="lazy"
                fetchPriority="low"
              />
              <p className="text-neutral-400 mb-4 text-sm">
                Your AI-powered guide to discovering the best events, dining, and attractions
                in Des Moines. Join 15,000+ locals who trust us for their weekend plans.
              </p>

              {/* Newsletter Benefit Line */}
              <p className="text-neutral-300 text-sm mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" aria-hidden="true" />
                Weekly digest of trending events + AI-powered recommendations
              </p>

              {/* Newsletter Mini Form */}
              <form onSubmit={handleNewsletterSubmit} className="flex gap-2 mb-2" aria-label="Newsletter subscription">
                <label htmlFor="footer-newsletter-email" className="sr-only">Email address for newsletter</label>
                <Input
                  id="footer-newsletter-email"
                  type="email"
                  placeholder="Get your weekly Des Moines plan"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500 h-10"
                  required
                  aria-describedby="newsletter-description"
                />
                <span id="newsletter-description" className="sr-only">Subscribe to receive weekly updates about Des Moines events</span>
                <Button type="submit" disabled={isLoading} size="sm" className="h-10 px-5 whitespace-nowrap" aria-label="Subscribe to newsletter">
                  Subscribe Free
                </Button>
              </form>

              {/* Social Proof + CAN-SPAM disclosure. Submitting the form is an
                  affirmative opt-in; we log it to consent_records. */}
              <p className="text-neutral-500 text-xs mb-1 flex items-center gap-1">
                <Users className="h-3 w-3" aria-hidden="true" />
                Join 15,000+ Des Moines locals. Free forever, unsubscribe anytime.
              </p>
              <p className="text-neutral-500 text-[11px] mb-4 leading-snug">
                By subscribing you agree to receive marketing emails from Des Moines Insider and acknowledge our{" "}
                <Link to="/privacy-policy" className="underline hover:text-neutral-300">
                  Privacy Policy
                </Link>
                . Every email includes a one-click unsubscribe link.
              </p>

              {/* Social Links */}
              <div className="flex gap-3" role="group" aria-label="Social media links">
                <a href="https://facebook.com" target="_blank" rel="noopener noreferrer"
                   aria-label="Follow us on Facebook (opens in new tab)"
                   className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-neutral-900">
                  <Facebook className="h-4 w-4" aria-hidden="true" />
                </a>
                <a href="https://twitter.com" target="_blank" rel="noopener noreferrer"
                   aria-label="Follow us on Twitter (opens in new tab)"
                   className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-neutral-900">
                  <Twitter className="h-4 w-4" aria-hidden="true" />
                </a>
                <a href="https://instagram.com" target="_blank" rel="noopener noreferrer"
                   aria-label="Follow us on Instagram (opens in new tab)"
                   className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-neutral-900">
                  <Instagram className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>

              {/* App Store Badge */}
              <a
                href="https://apps.apple.com/us/app/des-moines-insider-events/id6759137729"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Download Des Moines Insider on the App Store (opens in new tab)"
                className="inline-block mt-4 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-neutral-900 rounded-lg"
              >
                <img
                  src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83&releaseDate=1700000000"
                  alt="Download on the App Store"
                  className="h-10 w-auto"
                  loading="lazy"
                />
              </a>
            </div>

            {/* Explore */}
            <nav aria-label="Explore links">
              <h4 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-300">Explore</h4>
              <ul className="space-y-2">
                <li>
                  <Link to="/events" className="text-neutral-400 hover:text-white transition-colors text-sm flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" /> Events
                  </Link>
                </li>
                <li>
                  <Link to="/events/today" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    Today's Events
                  </Link>
                </li>
                <li>
                  <Link to="/events/this-weekend" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    This Weekend
                  </Link>
                </li>
                <li>
                  <Link to="/trip-planner" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    AI Trip Planner
                  </Link>
                </li>
                <li>
                  <Link to="/restaurants" className="text-neutral-400 hover:text-white transition-colors text-sm flex items-center gap-2">
                    <Utensils className="h-3.5 w-3.5" /> Restaurants
                  </Link>
                </li>
                <li>
                  <Link to="/attractions" className="text-neutral-400 hover:text-white transition-colors text-sm flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" /> Attractions
                  </Link>
                </li>
                <li>
                  <Link to="/stay" className="text-neutral-400 hover:text-white transition-colors text-sm flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5" /> Hotels & Stay
                  </Link>
                </li>
                <li>
                  <Link to="/submit-event" className="text-neutral-400 hover:text-white transition-colors text-sm flex items-center gap-2">
                    <PlusCircle className="h-3.5 w-3.5" /> Submit an Event
                  </Link>
                </li>
              </ul>
            </nav>

            {/* For You */}
            <nav aria-label="Account links">
              <h4 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-300">For You</h4>
              <ul className="space-y-2">
                <li>
                  <Link to="/pricing" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link to="/auth" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    Sign Up Free
                  </Link>
                </li>
                <li>
                  <Link to="/gamification" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    Earn Rewards
                  </Link>
                </li>
                <li>
                  <Link to="/articles" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    Articles & Guides
                  </Link>
                </li>
              </ul>
            </nav>

            {/* Business & Legal */}
            <nav aria-label="Business links">
              <h4 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-300">Business</h4>
              <ul className="space-y-2">
                <li>
                  <Link to="/advertise" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    Advertise With Us
                  </Link>
                </li>
                <li>
                  <Link to="/business-partnership" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    Business Partnership
                  </Link>
                </li>
                <li>
                  <Link to="/privacy-policy" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link to="/accessibility" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    Accessibility
                  </Link>
                </li>
                <li>
                  <Link to="/cookie-policy" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    Cookie Policy
                  </Link>
                </li>
                <li>
                  <Link to="/acceptable-use" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    Acceptable Use
                  </Link>
                </li>
                <li>
                  <Link to="/dmca" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    DMCA / Copyright
                  </Link>
                </li>
                <li>
                  <Link to="/dpa" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    Data Processing (DPA)
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    Contact Us
                  </Link>
                </li>
                <li>
                  <Link to="/affiliate-disclosure" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    Affiliate Disclosure
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-neutral-800 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start text-sm text-neutral-400">
              <span>Made with</span>
              <Heart className="h-4 w-4 mx-1 text-red-500 fill-red-500" />
              <span>for Des Moines</span>
            </div>
            <div className="text-neutral-500 text-xs space-y-1">
              <p>
                © {new Date().getFullYear()} Des Moines Insider. All rights reserved.
              </p>
              {/* Physical postal address — required by CAN-SPAM §5(a)(5) for any
                  marketing email we send out, and generally useful for legal notices. */}
              <address className="not-italic">
                Des Moines Insider · Des Moines, Iowa, USA ·{" "}
                <a
                  href="mailto:hello@desmoinesinsider.com"
                  className="underline hover:no-underline"
                >
                  hello@desmoinesinsider.com
                </a>
              </address>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}