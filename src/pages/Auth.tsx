import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAuthSecurity } from "@/hooks/useAuthSecurity";
import { User, LogIn, UserPlus, MapPin, Heart, Calendar, Music, Coffee, Camera, Gamepad2, Palette, AlertCircle } from "lucide-react";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { MFAVerificationDialog } from "@/components/auth/MFAVerificationDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Google Logo SVG Component (official colors)
const GoogleLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

// Apple Logo SVG Component
const AppleLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
  </svg>
);

const INTERESTS = [
  { id: "food", label: "Food & Dining", icon: Coffee },
  { id: "music", label: "Music & Concerts", icon: Music },
  { id: "sports", label: "Sports & Recreation", icon: Gamepad2 },
  { id: "arts", label: "Arts & Culture", icon: Palette },
  { id: "nightlife", label: "Nightlife & Entertainment", icon: Heart },
  { id: "outdoor", label: "Outdoor Activities", icon: Camera },
  { id: "family", label: "Family Events", icon: User },
  { id: "networking", label: "Business & Networking", icon: Calendar },
];

const LOCATIONS = [
  "Downtown Des Moines",
  "West Des Moines",
  "Ankeny",
  "Urbandale",
  "Clive",
  "Johnston",
  "Altoona",
  "Other"
];

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [accountType, setAccountType] = useState<"personal" | "business">("personal");
  const [showMFAVerification, setShowMFAVerification] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    phone: "",
    location: "",
    interests: [] as string[],
    emailNotifications: true,
    smsNotifications: false,
    eventRecommendations: true,
    // Business fields
    businessName: "",
    businessType: "",
    businessAddress: "",
    businessWebsite: "",
  });

  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    isAuthenticated,
    login,
    signup,
    signInWithGoogle,
    signInWithApple,
    resetPassword: resetPasswordContext,
    resendVerification: resendVerificationContext,
  } = useAuth();

  // Security hooks for rate limiting and validation
  const {
    isBlocked,
    remainingAttempts,
    timeUntilReset,
    checkRateLimit,
    logFailedAttempt,
    validateInput
  } = useAuthSecurity();

  useEffect(() => {
    if (isAuthenticated) {
      // Get the redirect parameter from URL or default to home
      const redirectTo = searchParams.get("redirect") || "/";
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, navigate, searchParams]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleInterestToggle = (interestId: string) => {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.includes(interestId)
        ? prev.interests.filter(id => id !== interestId)
        : [...prev.interests, interestId]
    }));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Check rate limit before attempting login
      const rateLimitCheck = await checkRateLimit(formData.email);
      if (!rateLimitCheck.allowed) {
        toast({
          title: "Too Many Attempts",
          description: rateLimitCheck.message || "Please try again later.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // Validate email format
      const emailValidation = validateInput('email', formData.email);
      if (!emailValidation.isValid) {
        toast({
          title: "Invalid Email",
          description: emailValidation.errors[0],
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      const result = await login(formData.email, formData.password);

      // Check if MFA verification is required
      if (result.requiresMFA && result.factorId) {
        setMfaFactorId(result.factorId);
        setShowMFAVerification(true);
        setIsLoading(false);
        return;
      }

      if (!result.success) {
        // Log failed attempt for security monitoring
        await logFailedAttempt(formData.email, 'login', result.error || 'Invalid credentials');

        toast({
          title: "Login Failed",
          description: result.error || "Invalid email or password",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Welcome back!",
        description: "You've been successfully logged in.",
      });

      // Redirect to intended destination or home
      const redirectTo = searchParams.get("redirect") || "/";
      navigate(redirectTo, { replace: true });
    } catch (error: any) {
      // Log failed attempt for security monitoring
      await logFailedAttempt(formData.email, 'login', error.message || 'Unknown error');

      toast({
        title: "Login Error",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMFASuccess = () => {
    toast({
      title: "Welcome back!",
      description: "You've been successfully logged in.",
    });

    // Redirect to intended destination or home
    const redirectTo = searchParams.get("redirect") || "/";
    navigate(redirectTo, { replace: true });
  };

  const handleMFACancel = () => {
    setShowMFAVerification(false);
    setMfaFactorId(null);
    toast({
      title: "Login Cancelled",
      description: "MFA verification was cancelled. Please try again.",
      variant: "default",
    });
  };

  const handleResendVerification = async () => {
    setIsLoading(true);
    const result = await resendVerificationContext(signupEmail);

    if (!result.success) {
      toast({
        title: "Resend Failed",
        description: result.error || "Failed to resend verification email",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Email Sent!",
        description: "Please check your inbox for the verification link.",
      });
    }

    setIsLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotPasswordEmail) {
      toast({
        title: "Email Required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const result = await resetPasswordContext(forgotPasswordEmail);

    if (!result.success) {
      toast({
        title: "Reset Failed",
        description: result.error || "Failed to send reset email",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Reset Email Sent!",
        description: "Check your email for a password reset link.",
      });
      setShowForgotPassword(false);
      setForgotPasswordEmail("");
    }

    setIsLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate email format
    const emailValidation = validateInput('email', formData.email);
    if (!emailValidation.isValid) {
      toast({
        title: "Invalid Email",
        description: emailValidation.errors[0],
        variant: "destructive",
      });
      return;
    }

    // Validate password strength
    const passwordValidation = validateInput('password', formData.password);
    if (!passwordValidation.isValid) {
      toast({
        title: "Weak Password",
        description: passwordValidation.errors[0],
        variant: "destructive",
      });
      return;
    }

    // Validate first name
    const firstNameValidation = validateInput('firstName', formData.firstName);
    if (!firstNameValidation.isValid) {
      toast({
        title: "Invalid First Name",
        description: firstNameValidation.errors[0],
        variant: "destructive",
      });
      return;
    }

    // Validate last name
    const lastNameValidation = validateInput('lastName', formData.lastName);
    if (!lastNameValidation.isValid) {
      toast({
        title: "Invalid Last Name",
        description: lastNameValidation.errors[0],
        variant: "destructive",
      });
      return;
    }

    // Validate location is selected
    if (!formData.location) {
      toast({
        title: "Location Required",
        description: "Please select your location to continue.",
        variant: "destructive",
      });
      return;
    }

    // Business account validation
    if (accountType === "business") {
      if (!formData.businessName) {
        toast({
          title: "Business Name Required",
          description: "Please enter your business name.",
          variant: "destructive",
        });
        return;
      }
      if (!formData.businessType) {
        toast({
          title: "Business Type Required",
          description: "Please select your business type.",
          variant: "destructive",
        });
        return;
      }
    }

    // Check rate limit before attempting signup
    const rateLimitCheck = await checkRateLimit(formData.email);
    if (!rateLimitCheck.allowed) {
      toast({
        title: "Too Many Attempts",
        description: rateLimitCheck.message || "Please try again later.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    // Prepare metadata based on account type
    const metadata = accountType === "personal"
      ? {
          account_type: "personal",
          first_name: formData.firstName,
          last_name: formData.lastName,
          phone: formData.phone,
          location: formData.location,
          interests: formData.interests,
          communication_preferences: {
            email_notifications: formData.emailNotifications,
            sms_notifications: formData.smsNotifications,
            event_recommendations: formData.eventRecommendations,
          }
        }
      : {
          account_type: "business",
          business_name: formData.businessName,
          business_type: formData.businessType,
          business_address: formData.businessAddress,
          business_website: formData.businessWebsite,
          first_name: formData.firstName,
          last_name: formData.lastName,
          phone: formData.phone,
          location: formData.location,
        };

    const result = await signup(formData.email, formData.password, metadata);

    if (!result.success) {
      toast({
        title: "Signup Failed",
        description: result.error || "Failed to create account",
        variant: "destructive",
      });
    } else if (result.needsVerification) {
      // Show email confirmation screen
      setSignupEmail(formData.email);
      setShowEmailConfirmation(true);
    } else {
      // Signup successful and no verification needed (rare case)
      toast({
        title: "Account Created!",
        description: "Welcome to Des Moines Insider!",
      });
      navigate("/", { replace: true });
    }

    setIsLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    const redirectTo = searchParams.get("redirect") || undefined;
    const result = await signInWithGoogle(redirectTo);

    if (!result.success) {
      toast({
        title: "Google Sign In Failed",
        description: result.error || "Failed to sign in with Google",
        variant: "destructive",
      });
      setIsLoading(false);
    }
    // Don't set isLoading to false on success - let the redirect happen
  };

  const handleAppleSignIn = async () => {
    setIsLoading(true);
    const redirectTo = searchParams.get("redirect") || undefined;
    const result = await signInWithApple(redirectTo);

    if (!result.success) {
      toast({
        title: "Apple Sign In Failed",
        description: result.error || "Failed to sign in with Apple",
        variant: "destructive",
      });
      setIsLoading(false);
    }
    // Don't set isLoading to false on success - let the redirect happen
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Des Moines Insider</CardTitle>
          <CardDescription>
            Your personalized guide to Des Moines events and experiences
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showEmailConfirmation ? (
            /* Email Confirmation Screen */
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="rounded-full bg-green-100 p-3">
                  <svg className="h-12 w-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" />
                  </svg>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-2">Check Your Email!</h3>
                <p className="text-muted-foreground mb-1">
                  We've sent a verification link to:
                </p>
                <p className="font-medium text-foreground">{signupEmail}</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
                <h4 className="font-semibold text-blue-900 mb-2">Next Steps:</h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
                  <li>Check your email inbox (and spam folder)</li>
                  <li>Click the verification link in the email</li>
                  <li>You'll be redirected back here to start exploring!</li>
                </ol>
              </div>

              <div className="pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Didn't receive the email?
                </p>
                <Button
                  onClick={handleResendVerification}
                  variant="outline"
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? "Sending..." : "Resend Verification Email"}
                </Button>
                <Button
                  onClick={() => {
                    setShowEmailConfirmation(false);
                    setIsLogin(true);
                  }}
                  variant="ghost"
                  className="w-full"
                >
                  Back to Login
                </Button>
              </div>
            </div>
          ) : (
            /* Normal Login/Signup Tabs */
            <Tabs value={isLogin ? "login" : "signup"} onValueChange={(value) => setIsLogin(value === "login")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login" className="flex items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  Login
                </TabsTrigger>
                <TabsTrigger value="signup" className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Sign Up
                </TabsTrigger>
              </TabsList>

            <TabsContent value="login">
              {showForgotPassword ? (
                /* Forgot Password Form */
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email Address</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="your@email.com"
                      value={forgotPasswordEmail}
                      onChange={(e) => setForgotPasswordEmail(e.target.value)}
                      required
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    We'll send you a link to reset your password.
                  </p>
                  <div className="space-y-2">
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? "Sending..." : "Send Reset Link"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={() => {
                        setShowForgotPassword(false);
                        setForgotPasswordEmail("");
                      }}
                    >
                      Back to Login
                    </Button>
                  </div>
                </form>
              ) : (
                /* Login Form */
                <form onSubmit={handleLogin} className="space-y-4">
                  {/* Rate limit warning */}
                  {isBlocked && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Too many failed attempts. Please try again in {Math.ceil(timeUntilReset / 60)} minute{Math.ceil(timeUntilReset / 60) !== 1 ? 's' : ''}.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Remaining attempts warning */}
                  {!isBlocked && remainingAttempts < 3 && remainingAttempts > 0 && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {remainingAttempts} attempt{remainingAttempts !== 1 ? 's' : ''} remaining before temporary lockout.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <button
                        type="button"
                        onClick={() => setShowForgotPassword(true)}
                        className="text-sm text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={(e) => handleInputChange("password", e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading || isBlocked}>
                    {isLoading ? "Signing in..." : isBlocked ? "Please wait..." : "Sign In"}
                  </Button>

                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        Or continue with
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGoogleSignIn}
                      disabled={isLoading}
                      className="w-full"
                    >
                      <GoogleLogo className="h-4 w-4 mr-2" />
                      Google
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAppleSignIn}
                      disabled={isLoading}
                      className="w-full"
                    >
                      <AppleLogo className="h-4 w-4 mr-2" />
                      Apple
                    </Button>
                  </div>
                </form>
              )}
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                {/* Account Type Selector */}
                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setAccountType("personal")}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        accountType === "personal"
                          ? "border-primary bg-primary/10"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <User className="h-5 w-5 mx-auto mb-1" />
                      <p className="text-sm font-medium">Personal</p>
                      <p className="text-xs text-muted-foreground">For individual use</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccountType("business")}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        accountType === "business"
                          ? "border-primary bg-primary/10"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <Coffee className="h-5 w-5 mx-auto mb-1" />
                      <p className="text-sm font-medium">Business</p>
                      <p className="text-xs text-muted-foreground">For advertisers</p>
                    </button>
                  </div>
                </div>

                {/* Business Fields */}
                {accountType === "business" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="businessName">
                        Business Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="businessName"
                        placeholder="Your Business Name"
                        value={formData.businessName}
                        onChange={(e) => handleInputChange("businessName", e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="businessType">
                        Business Type <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={formData.businessType}
                        onValueChange={(value) => handleInputChange("businessType", value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select business type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="restaurant">Restaurant</SelectItem>
                          <SelectItem value="bar">Bar/Nightlife</SelectItem>
                          <SelectItem value="venue">Event Venue</SelectItem>
                          <SelectItem value="attraction">Attraction</SelectItem>
                          <SelectItem value="retail">Retail</SelectItem>
                          <SelectItem value="service">Service Provider</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="businessAddress">Business Address</Label>
                      <Input
                        id="businessAddress"
                        placeholder="123 Main St, Des Moines, IA"
                        value={formData.businessAddress}
                        onChange={(e) => handleInputChange("businessAddress", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="businessWebsite">Website (Optional)</Label>
                      <Input
                        id="businessWebsite"
                        type="url"
                        placeholder="https://yourbusiness.com"
                        value={formData.businessWebsite}
                        onChange={(e) => handleInputChange("businessWebsite", e.target.value)}
                      />
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      placeholder="John"
                      value={formData.firstName}
                      onChange={(e) => handleInputChange("firstName", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      placeholder="Doe"
                      value={formData.lastName}
                      onChange={(e) => handleInputChange("lastName", e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => handleInputChange("password", e.target.value)}
                    required
                    minLength={8}
                  />
                  <PasswordStrengthMeter
                    password={formData.password}
                    showRequirements={true}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone (Optional)</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(515) 555-0123"
                    value={formData.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">
                    Location <span className="text-red-500">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    We'll show you events and restaurants near you
                  </p>
                  <Select value={formData.location} onValueChange={(value) => handleInputChange("location", value)} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select your area" />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCATIONS.map((location) => (
                        <SelectItem key={location} value={location}>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {location}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Interests (Personal accounts only) */}
                {accountType === "personal" && (
                  <div className="space-y-3">
                    <Label>What interests you? (Select all that apply)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {INTERESTS.map((interest) => {
                        const Icon = interest.icon;
                        return (
                          <div
                            key={interest.id}
                            className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                              formData.interests.includes(interest.id)
                                ? "bg-primary/10 border-primary"
                                : "border-border hover:bg-muted"
                            }`}
                            onClick={() => handleInterestToggle(interest.id)}
                          >
                            <Checkbox
                              checked={formData.interests.includes(interest.id)}
                              onChange={() => handleInterestToggle(interest.id)}
                            />
                            <Icon className="h-4 w-4" />
                            <span className="text-sm">{interest.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Communication Preferences (Personal accounts only) */}
                {accountType === "personal" && (
                  <div className="space-y-3">
                    <Label>Communication Preferences</Label>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="emailNotifications"
                        checked={formData.emailNotifications}
                        onCheckedChange={(checked) => handleInputChange("emailNotifications", checked)}
                      />
                      <Label htmlFor="emailNotifications" className="text-sm">
                        Email notifications about events
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="smsNotifications"
                        checked={formData.smsNotifications}
                        onCheckedChange={(checked) => handleInputChange("smsNotifications", checked)}
                      />
                      <Label htmlFor="smsNotifications" className="text-sm">
                        SMS notifications (requires phone number)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="eventRecommendations"
                        checked={formData.eventRecommendations}
                        onCheckedChange={(checked) => handleInputChange("eventRecommendations", checked)}
                      />
                      <Label htmlFor="eventRecommendations" className="text-sm">
                        Personalized event recommendations
                      </Label>
                    </div>
                  </div>
                </div>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Creating account..." : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          )}
        </CardContent>
      </Card>

      {/* MFA Verification Dialog */}
      {mfaFactorId && (
        <MFAVerificationDialog
          open={showMFAVerification}
          onOpenChange={setShowMFAVerification}
          factorId={mfaFactorId}
          onSuccess={handleMFASuccess}
          onCancel={handleMFACancel}
        />
      )}
    </div>
  );
}