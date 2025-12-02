import { useState } from "react";
import { Heart, Mail, Calendar, Utensils, MapPin, Crown, ArrowRight, Facebook, Twitter, Instagram } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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

      toast({
        title: "Subscribed!",
        description: "Welcome to the Des Moines Insider community.",
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
              <img
                src="/DMI-Logo2.png"
                alt="Des Moines Insider"
                className="h-12 w-auto mb-4"
              />
              <p className="text-neutral-400 mb-4 text-sm">
                Your AI-powered guide to discovering the best events, dining, and attractions
                in Des Moines. Join 15,000+ locals who trust us for their weekend plans.
              </p>

              {/* Newsletter Mini Form */}
              <form onSubmit={handleNewsletterSubmit} className="flex gap-2 mb-4">
                <Input
                  type="email"
                  placeholder="Your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500 h-10"
                  required
                />
                <Button type="submit" disabled={isLoading} size="sm" className="h-10 px-4">
                  <Mail className="h-4 w-4" />
                </Button>
              </form>

              {/* Social Links */}
              <div className="flex gap-3">
                <a href="https://facebook.com" target="_blank" rel="noopener noreferrer"
                   className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors">
                  <Facebook className="h-4 w-4" />
                </a>
                <a href="https://twitter.com" target="_blank" rel="noopener noreferrer"
                   className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors">
                  <Twitter className="h-4 w-4" />
                </a>
                <a href="https://instagram.com" target="_blank" rel="noopener noreferrer"
                   className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors">
                  <Instagram className="h-4 w-4" />
                </a>
              </div>
            </div>

            {/* Explore */}
            <div>
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
                  <Link to="/restaurants" className="text-neutral-400 hover:text-white transition-colors text-sm flex items-center gap-2">
                    <Utensils className="h-3.5 w-3.5" /> Restaurants
                  </Link>
                </li>
                <li>
                  <Link to="/attractions" className="text-neutral-400 hover:text-white transition-colors text-sm flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" /> Attractions
                  </Link>
                </li>
              </ul>
            </div>

            {/* For You */}
            <div>
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
            </div>

            {/* Business & Legal */}
            <div>
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
                  <Link to="/contact" className="text-neutral-400 hover:text-white transition-colors text-sm">
                    Contact Us
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-neutral-800 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center text-sm text-neutral-400">
              <span>Made with</span>
              <Heart className="h-4 w-4 mx-1 text-red-500 fill-red-500" />
              <span>for Des Moines</span>
            </div>
            <p className="text-neutral-500 text-sm">
              © {new Date().getFullYear()} Des Moines Insider. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}