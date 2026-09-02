import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Heart, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { readAuthCallbackError, looksConfirmed } from "@/lib/authCallbackError";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

export default function AuthVerified() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const [countdown, setCountdown] = useState(10);
  const [resending, setResending] = useState(false);
  const [resendEmail, setResendEmail] = useState("");

  // WEB-AUTH-005. This page used to render "Email Verified! 🎉" no matter what
  // brought the reader here. It read no error parameter, so an expired link, a
  // reused link and a cross-device confirmation all produced a celebration and
  // a ten-second countdown to the homepage -- while the reader was still logged
  // out and told nothing.
  //
  // Both halves of the URL are read. Supabase puts PKCE and OAuth failures in
  // the query string and implicit-flow and email-link failures in the FRAGMENT,
  // which never reaches a server and which useSearchParams does not expose.
  const authError = useMemo(
    () => readAuthCallbackError(location.search, location.hash),
    [location.search, location.hash],
  );
  const confirmed = useMemo(
    () => looksConfirmed(location.search, location.hash, isAuthenticated),
    [location.search, location.hash, isAuthenticated],
  );

  useDocumentTitle(authError ? "Verification Problem" : "Email Verified");

  useEffect(() => {
    // No countdown on the error branch. Bouncing someone to the homepage after
    // telling them something went wrong takes away the one screen that explains
    // it, and the action they need is on this page.
    if (authError || !confirmed) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          navigate("/");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate, authError, confirmed]);

  const handleExploreNow = () => {
    navigate("/");
  };

  const handleResend = async () => {
    const email = (resendEmail || user?.email || "").trim();
    if (!email) {
      toast({
        title: "Enter your email",
        description: "We need the address you signed up with to send a new link.",
        variant: "destructive",
      });
      return;
    }

    setResending(true);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setResending(false);

    // NEUTRAL EITHER WAY. resend errors for an address that is already
    // confirmed, and reporting that would turn this page into an account
    // checker for anyone who can type an address (the same enumeration
    // WEB-AUTH-004 is about). The message says what was attempted, not what
    // was found.
    toast({
      title: "Check your email",
      description:
        "If that address needs confirming, a new link is on its way. It is good for 24 hours.",
    });
    if (error) {
      // Kept out of the user-facing message on purpose; useful in a dev console.
      if (import.meta.env.DEV) console.warn("resend failed", error.message);
    }
  };

  if (authError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 to-accent/10 flex flex-col">
        <Header />

        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-xl">
            <CardHeader className="text-center space-y-4 pb-6">
              <div className="flex justify-center">
                <div className="rounded-full bg-red-100 p-4">
                  <XCircle className="h-16 w-16 text-red-600" />
                </div>
              </div>
              <CardTitle className="text-3xl font-bold">
                We couldn't confirm your email
              </CardTitle>
              <CardDescription className="text-lg">{authError.message}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {authError.canResend && (
                <div className="space-y-3">
                  <label htmlFor="resend-email" className="text-sm font-medium">
                    Email address
                  </label>
                  <input
                    id="resend-email"
                    type="email"
                    autoComplete="email"
                    className="w-full h-11 rounded-md border bg-background px-3 text-base"
                    placeholder={user?.email || "you@example.com"}
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                  />
                  <Button onClick={handleResend} disabled={resending} className="w-full h-12">
                    {resending ? "Sending..." : "Send a new confirmation link"}
                  </Button>
                </div>
              )}

              <div className="text-center text-sm text-muted-foreground space-y-2">
                <p>
                  Already confirmed?{" "}
                  <Link to="/auth" className="underline font-medium">
                    Sign in
                  </Link>
                </p>
                {/* The code is here for a support conversation, not for the
                    reader to interpret. */}
                <p className="text-xs">Reference: {authError.code}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-accent/10 flex flex-col">
      <Header />

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center space-y-4 pb-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-100 p-4">
                <CheckCircle className="h-16 w-16 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold">
              Email Verified! 🎉
            </CardTitle>
            <CardDescription className="text-lg">
              {user?.email && `Welcome, ${user.email.split('@')[0]}! `}
              Your account is now active and ready to use.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-8">
            {/* What's Next Section */}
            <div className="bg-primary/5 rounded-lg p-6 space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <SpriteIcon name="sparkles" className="h-5 w-5 text-primary" />
                What You Can Do Now
              </h3>

              <div className="grid gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 p-2 mt-1">
                    <Heart className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">Save Your Favorites</h4>
                    <p className="text-sm text-muted-foreground">
                      Click the heart icon on any event to save it to your favorites
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 p-2 mt-1">
                    <SpriteIcon name="calendar" className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">Get Personalized Recommendations</h4>
                    <p className="text-sm text-muted-foreground">
                      We'll show you events based on your interests and location
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 p-2 mt-1">
                    <SpriteIcon name="sparkles" className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">Add Events to Your Calendar</h4>
                    <p className="text-sm text-muted-foreground">
                      Download .ics files to add events to Google, Apple, or Outlook calendars
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Personalization Info */}
            {user?.user_metadata && (
              <div className="border rounded-lg p-4 space-y-3">
                <h3 className="font-semibold">Your Preferences</h3>

                {user.user_metadata.location && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Location:</span>
                    <span className="font-medium">{user.user_metadata.location}</span>
                  </div>
                )}

                {user.user_metadata.interests && user.user_metadata.interests.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-sm text-muted-foreground">Interests:</span>
                    <div className="flex flex-wrap gap-2">
                      {user.user_metadata.interests.map((interest: string) => (
                        <span
                          key={interest}
                          className="px-2 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium"
                        >
                          {interest}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                onClick={handleExploreNow}
                className="w-full h-12 text-lg"
                size="lg"
              >
                Start Exploring Events
                <SpriteIcon name="arrow-right" className="ml-2 h-5 w-5" />
              </Button>

              {confirmed && (
                <p className="text-center text-sm text-muted-foreground">
                  Redirecting automatically in {countdown} second{countdown !== 1 ? 's' : ''}...
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Footer />
    </div>
  );
}
