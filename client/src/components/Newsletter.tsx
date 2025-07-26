import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Mail, Check } from "lucide-react";

export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const { toast } = useToast();

  const subscribeMutation = useMutation({
    mutationFn: async (email: string) => {
      return apiRequest('POST', '/api/newsletter/subscribe', { email });
    },
    onSuccess: () => {
      setIsSubscribed(true);
      setEmail("");
      toast({
        title: "Successfully subscribed!",
        description: "You'll receive the latest Des Moines events and recommendations.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Subscription failed",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleSubscribe = () => {
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    subscribeMutation.mutate(email);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubscribe();
    }
  };

  if (isSubscribed) {
    return (
      <section className="py-16 bg-primary text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center mb-4">
            <Check className="h-8 w-8 text-green-400 mr-2" />
            <h3 className="text-3xl font-bold">Thank You!</h3>
          </div>
          <p className="text-xl opacity-90">You're now subscribed to Des Moines Insider updates</p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 bg-primary text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="flex items-center justify-center mb-4">
          <Mail className="h-8 w-8 mr-2" />
          <h3 className="text-3xl font-bold">Stay Updated</h3>
        </div>
        <p className="text-xl mb-8 opacity-90">Get the latest Des Moines events and recommendations delivered to your inbox</p>
        
        <div className="max-w-md mx-auto">
          <div className="flex gap-2">
            <Input 
              type="email" 
              placeholder="Enter your email" 
              className="flex-1 px-4 py-3 rounded-l-lg text-neutral-900 bg-white border-0 focus:ring-2 focus:ring-white"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={subscribeMutation.isPending}
            />
            <Button 
              className="bg-secondary hover:bg-red-700 px-6 py-3 rounded-r-lg font-semibold transition-colors"
              onClick={handleSubscribe}
              disabled={subscribeMutation.isPending}
            >
              {subscribeMutation.isPending ? "..." : "Subscribe"}
            </Button>
          </div>
          <p className="text-sm mt-4 opacity-80">No spam, unsubscribe anytime</p>
        </div>
      </div>
    </section>
  );
}
