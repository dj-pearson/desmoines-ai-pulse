import React, { lazy, Suspense, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState } from "@/components/ui/error-state";
import { useToast } from "@/hooks/use-toast";
import PreferencesManager from "@/components/PreferencesManager";
import { User, Mail, Phone, Settings, Save, Edit, Trophy } from "lucide-react";
import { useSocialFeatures } from "@/hooks/useSocialFeatures";
import { useGamification } from "@/hooks/useGamification";
import { useTabState } from "@/hooks/useTabState";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { handleError } from "@/lib/errorHandler";

// Settings panels load with the Settings tab, not with the page (WP5 item 14).
const SecurityCheckup = lazy(() =>
  import("@/components/account/SecurityCheckup").then((m) => ({ default: m.SecurityCheckup })),
);
const AccountCredentials = lazy(() =>
  import("@/components/auth/AccountCredentials").then((m) => ({ default: m.AccountCredentials })),
);
const MFAManagement = lazy(() =>
  import("@/components/auth/MFAManagement").then((m) => ({ default: m.MFAManagement })),
);
const EmailStreams = lazy(() =>
  import("@/components/account/EmailStreams").then((m) => ({ default: m.EmailStreams })),
);
const PrivacyControls = lazy(() =>
  import("@/components/PrivacyControls").then((m) => ({ default: m.PrivacyControls })),
);

const TABS = ["overview", "activity", "settings"] as const;

/**
 * Tabs that moved, kept as redirects for one release (WP5 item 11) because
 * emails, bookmarks and older app builds link to them.
 */
const MOVED_TABS: Record<string, string> = {
  favorites: "/my-events?tab=saved",
  events: "/dashboard?tab=events",
};

function PanelSkeleton() {
  return <Skeleton className="h-48 w-full rounded-xl bg-muted" />;
}

/**
 * The Activity tab body. The gamification and social hooks live here, not on
 * the page, so /profile?tab=settings - where onboarding and Unsubscribe send
 * people - doesn't make six gamification reads it never shows.
 */
function ActivityTab() {
  const { reputation, badges, error: gamificationError, isLoading, refetch } = useGamification();
  const { friends, error: friendsError, loading: friendsLoading, fetchFriends } = useSocialFeatures();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" aria-hidden="true" />
          Points, badges and friends
        </CardTitle>
        <CardDescription>What you've earned by checking in, reviewing and sharing.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <Skeleton className="h-24 w-full bg-muted" />
        ) : gamificationError ? (
          <ErrorState
            compact
            error={gamificationError}
            title="Couldn't load your points"
            onRetry={refetch}
          />
        ) : reputation ? (
          <dl className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-muted p-4 text-center">
              <dt className="text-sm text-muted-foreground">Level</dt>
              <dd className="text-2xl font-semibold">{reputation.current_level}</dd>
            </div>
            <div className="rounded-lg bg-muted p-4 text-center">
              <dt className="text-sm text-muted-foreground">Points</dt>
              <dd className="text-2xl font-semibold">{reputation.experience_points}</dd>
            </div>
            <div className="rounded-lg bg-muted p-4 text-center">
              <dt className="text-sm text-muted-foreground">Badges</dt>
              <dd className="text-2xl font-semibold">{badges.length}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            No points yet. Check in at an event or write a review to start.
          </p>
        )}

        <div>
          {friendsLoading ? (
            <Skeleton className="h-6 w-40 bg-muted" />
          ) : friendsError ? (
            <ErrorState
              compact
              error={friendsError}
              title="Couldn't load your friends"
              onRetry={() => void fetchFriends()}
            />
          ) : (
            <p className="text-sm">
              {friends.length === 0
                ? "No friends added yet."
                : `${friends.length} ${friends.length === 1 ? "friend" : "friends"}.`}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild className="sm:flex-1">
            <Link to="/gamification">
              <Trophy className="mr-2 h-4 w-4" aria-hidden="true" />
              View achievements
            </Link>
          </Button>
          <Button asChild variant="outline" className="sm:flex-1">
            <Link to="/social">
              <SpriteIcon name="users" className="mr-2 h-4 w-4" />
              Friends and groups
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Every account setting, one page (account plan WP5). Security first, because
 * a compromised password is the reason someone opens this tab.
 */
function SettingsTab() {
  const { hash } = useLocation();

  // /profile?tab=settings#password (ResetPassword sends signed-in people here),
  // #two-step and #emails point into panels that load lazily, so the browser's
  // own jump happens before the target exists. Retry for a moment.
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    let frame = 0;
    const seek = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: "start" });
        return;
      }
      if (tries++ < 60) frame = window.requestAnimationFrame(seek);
    };
    frame = window.requestAnimationFrame(seek);
    return () => window.cancelAnimationFrame(frame);
  }, [hash]);

  return (
    <Suspense fallback={<PanelSkeleton />}>
      <SecurityCheckup />
      <AccountCredentials />
      <MFAManagement />
      <EmailStreams />
      <PreferencesManager />
      <PrivacyControls />
    </Suspense>
  );
}

export default function Profile() {
  const { profile, updateProfile, isLoading, error: profileError, refetch } = useProfile();
  const { user } = useAuth();
  useDocumentTitle("Profile Settings");
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useTabState("overview", { validTabs: TABS });
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [formData, setFormData] = useState({ firstName: "", lastName: "", phone: "" });

  const resetForm = React.useCallback(() => {
    setFormData({
      firstName: profile?.first_name || "",
      lastName: profile?.last_name || "",
      phone: profile?.phone || "",
    });
  }, [profile?.first_name, profile?.last_name, profile?.phone]);

  useEffect(() => {
    resetForm();
  }, [resetForm]);

  const movedTo = MOVED_TABS[searchParams.get("tab") ?? ""];
  if (movedTo) return <Navigate to={movedTo} replace />;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      await updateProfile({
        first_name: formData.firstName.trim() || null,
        last_name: formData.lastName.trim() || null,
        phone: formData.phone.trim() || null,
      });
      toast({ title: "Saved", description: "Your details are updated." });
      setIsEditing(false);
    } catch (error) {
      handleError(error, { component: "Profile", action: "saveDetails" });
      toast({
        title: "Couldn't save your details",
        description: "Nothing was changed. Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const cancelEdit = () => {
    resetForm();
    setIsEditing(false);
  };

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Account" },
          ]}
        />
        <div>
          <h1 className="text-3xl font-bold">Your account</h1>
          <p className="text-muted-foreground">Your details, activity, and every setting in one place.</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-3">
            <TabsTrigger value="overview" className="flex items-center gap-2 py-2">
              <User className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2 py-2">
              <Trophy className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Activity</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2 py-2">
              <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Settings</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" aria-hidden="true" />
                      Your details
                    </CardTitle>
                    <CardDescription>Your name and phone number.</CardDescription>
                  </div>
                  {!isEditing && !isLoading && !profileError && (
                    <Button variant="outline" onClick={() => setIsEditing(true)}>
                      <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
                      Edit
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-5 w-48 bg-muted" />
                    <Skeleton className="h-5 w-64 bg-muted" />
                  </div>
                ) : profileError ? (
                  <ErrorState
                    compact
                    error={profileError}
                    title="Couldn't load your details"
                    onRetry={() => void refetch()}
                  />
                ) : isEditing ? (
                  <form onSubmit={handleSave} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First name</Label>
                        <Input
                          id="firstName"
                          autoComplete="given-name"
                          value={formData.firstName}
                          onChange={(e) => setFormData((prev) => ({ ...prev, firstName: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last name</Label>
                        <Input
                          id="lastName"
                          autoComplete="family-name"
                          value={formData.lastName}
                          onChange={(e) => setFormData((prev) => ({ ...prev, lastName: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        autoComplete="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" disabled={isUpdating}>
                        <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                        {isUpdating ? "Saving..." : "Save changes"}
                      </Button>
                      <Button type="button" variant="ghost" onClick={cancelEdit} disabled={isUpdating}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <dl className="space-y-3">
                    <div className="flex items-center gap-2">
                      <dt>
                        <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span className="sr-only">Name</span>
                      </dt>
                      <dd className="font-medium">{fullName || "No name added"}</dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <dt>
                        <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span className="sr-only">Email</span>
                      </dt>
                      {/* The auth user's address, not profiles.email: that
                          column never followed an email change (D13). */}
                      <dd className="break-all">{user?.email}</dd>
                    </div>
                    {profile?.phone && (
                      <div className="flex items-center gap-2">
                        <dt>
                          <Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          <span className="sr-only">Phone</span>
                        </dt>
                        <dd>{profile.phone}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Elsewhere in your account</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm">
                  <li>
                    <Link to="/my-events" className="font-medium text-primary underline-offset-4 hover:underline">
                      My events
                    </Link>
                    <span className="text-muted-foreground"> - what you're going to, saved and reminders</span>
                  </li>
                  <li>
                    <Link
                      to="/dashboard?tab=events"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Events you've submitted
                    </Link>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => setActiveTab("settings")}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Password, two-step sign-in and emails
                    </button>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="mt-6">
            <ActivityTab />
          </TabsContent>

          <TabsContent value="settings" className="mt-6 space-y-6">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </main>
      <Footer />
    </div>
  );
}
