import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Calendar, 
  Plus, 
  User, 
  Settings, 
  Eye, 
  Edit, 
  Trash2, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  ArrowLeft,
  Megaphone
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserSubmittedEvents } from "@/hooks/useUserSubmittedEvents";
import EventSubmissionForm from "@/components/EventSubmissionForm";
import { format } from "date-fns";
import { toast } from "sonner";

export default function UserDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { data: events, isLoading, refetch } = useUserSubmittedEvents();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }

    // Check for tab parameter from URL
    const tabParam = searchParams.get("tab");
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [user, authLoading, navigate, searchParams]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "rejected":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "needs_revision":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-blue-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-100 text-green-800 border-green-200";
      case "rejected":
        return "bg-red-100 text-red-800 border-red-200";
      case "needs_revision":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-blue-100 text-blue-800 border-blue-200";
    }
  };

  const handleEventSubmitted = () => {
    refetch();
    setActiveTab("events");
    toast.success("Event submitted successfully! We'll review it within 48 hours.");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b mobile-padding py-4 sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-card/95">
        <div className="container mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Site
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold">My Dashboard</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto mobile-padding py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Tab Navigation */}
          <div className="mb-6 overflow-x-auto">
            <TabsList className="flex w-max sm:w-auto gap-1 p-1">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="submit-event" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Submit Event
              </TabsTrigger>
              <TabsTrigger value="events" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                My Events
              </TabsTrigger>
              <TabsTrigger value="advertise" className="flex items-center gap-2">
                <Megaphone className="h-4 w-4" />
                Advertise
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Submitted Events</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{events?.length || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    Total events submitted
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Approved Events</CardTitle>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {events?.filter(e => e.status === "approved").length || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Live on the site
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
                  <Clock className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {events?.filter(e => e.status === "pending").length || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Awaiting approval
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                  <CardDescription>
                    Get started with submitting events and managing your listings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button 
                    onClick={() => setActiveTab("submit-event")} 
                    className="w-full sm:w-auto"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Submit New Event
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setActiveTab("advertise")}
                    className="w-full sm:w-auto ml-0 sm:ml-2"
                  >
                    <Megaphone className="h-4 w-4 mr-2" />
                    Advertise Your Business
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Submit Event Tab */}
          <TabsContent value="submit-event">
            <Card>
              <CardHeader>
                <CardTitle>Submit Your Event</CardTitle>
                <CardDescription>
                  Share your event with the Des Moines community. All submissions are reviewed within 48 hours.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EventSubmissionForm onSuccess={handleEventSubmitted} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* My Events Tab */}
          <TabsContent value="events">
            <Card>
              <CardHeader>
                <CardTitle>My Submitted Events</CardTitle>
                <CardDescription>
                  Track the status of your event submissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p>Loading your events...</p>
                  </div>
                ) : events && events.length > 0 ? (
                  <div className="space-y-4">
                    {events.map((event) => (
                      <div key={event.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg">{event.title}</h3>
                            <p className="text-muted-foreground mb-2">{event.venue}</p>
                            <p className="text-sm text-muted-foreground mb-3">
                              Submitted {format(new Date(event.submitted_at), "MMM d, yyyy 'at' h:mm a")}
                            </p>
                            {event.admin_notes && (
                              <Alert className="mt-2">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription>
                                  <strong>Admin Notes:</strong> {event.admin_notes}
                                </AlertDescription>
                              </Alert>
                            )}
                          </div>
                          <div className="ml-4 text-right">
                            <Badge 
                              variant="outline" 
                              className={getStatusColor(event.status)}
                            >
                              {getStatusIcon(event.status)}
                              <span className="ml-1 capitalize">{event.status.replace("_", " ")}</span>
                            </Badge>
                            {event.date && (
                              <p className="text-sm text-muted-foreground mt-2">
                                {format(new Date(event.date), "MMM d, yyyy")}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No events submitted yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Start by submitting your first event to the community!
                    </p>
                    <Button onClick={() => setActiveTab("submit-event")}>
                      <Plus className="h-4 w-4 mr-2" />
                      Submit Your First Event
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Advertise Tab */}
          <TabsContent value="advertise">
            <Card>
              <CardHeader>
                <CardTitle>Advertise Your Business</CardTitle>
                <CardDescription>
                  Reach thousands of local people with targeted advertising
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Alert>
                    <Megaphone className="h-4 w-4" />
                    <AlertDescription>
                      Get your business in front of Des Moines' most engaged community members.
                    </AlertDescription>
                  </Alert>
                  <Button onClick={() => navigate("/advertise")}>
                    Learn More About Advertising
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Account Settings</CardTitle>
                <CardDescription>
                  Manage your account preferences and notifications
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Alert>
                    <Settings className="h-4 w-4" />
                    <AlertDescription>
                      Settings panel coming soon. For now, you can manage your account through the main site.
                    </AlertDescription>
                  </Alert>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
