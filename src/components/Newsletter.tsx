import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Mail } from "lucide-react";

export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    try {
      // Simulate newsletter signup
      await new Promise((resolve) => setTimeout(resolve, 1000));

      toast({
        title: "Successfully subscribed!",
        description:
          "You'll receive the latest Des Moines updates in your inbox.",
      });
      setEmail("");
    } catch (error) {
      toast({
        title: "Subscription failed",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section
      className="py-16 bg-gradient-to-r from-[#2D1B69] to-[#8B0000]"
      id="newsletter"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
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
        >
          <Input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 h-12"
            required
          />
          <Button
            type="submit"
            disabled={isLoading}
            className="h-12 px-8 bg-green-600 hover:bg-green-700 text-white"
          >
            {isLoading ? "Subscribing..." : "Subscribe"}
          </Button>
        </form>

        <p className="text-white/70 text-sm mt-4">
          No spam, ever. Unsubscribe anytime.
        </p>
      </div>
    </section>
  );
}
