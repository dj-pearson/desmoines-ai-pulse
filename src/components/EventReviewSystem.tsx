import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Alert, AlertDescription } from "./ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Eye, 
  Calendar,
  MapPin,
  Tag,
  User,
  Mail,
  Phone,
  Globe,
  DollarSign
} from "lucide-react";
import { useAllSubmittedEvents, useReviewEvent } from "@/hooks/useUserSubmittedEvents";
import { format } from "date-fns";
import { toast } from "sonner";

export default function EventReviewSystem() {
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected' | 'needs_revision' | null>(null);
  
  const { data: events, isLoading, refetch } = useAllSubmittedEvents();
  const reviewEvent = useReviewEvent();

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

  const handleReview = async (status: 'approved' | 'rejected' | 'needs_revision') => {
    if (!selectedEvent) return;

    try {
      await reviewEvent.mutateAsync({
        id: selectedEvent.id,
        status,
        admin_notes: adminNotes.trim() || undefined,
      });

      toast.success(`Event ${status} successfully!`);
      setSelectedEvent(null);
      setAdminNotes("");
      setReviewAction(null);
      refetch();
    } catch (error) {
      console.error('Error reviewing event:', error);
      toast.error('Failed to review event');
    }
  };

  const filteredEvents = (status: string) => {
    if (!events || !Array.isArray(events)) return [];
    if (status === 'all') return events;
    return events.filter(event => event.status === status);
  };

  const pendingCount = (events && Array.isArray(events)) ? events.filter(e => e.status === 'pending').length : 0;
  const approvedCount = (events && Array.isArray(events)) ? events.filter(e => e.status === 'approved').length : 0;
  const rejectedCount = (events && Array.isArray(events)) ? events.filter(e => e.status === 'rejected').length : 0;
  const needsRevisionCount = (events && Array.isArray(events)) ? events.filter(e => e.status === 'needs_revision').length : 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading submitted events...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting approval
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvedCount}</div>
            <p className="text-xs text-muted-foreground">
              Live on site
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Needs Revision</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{needsRevisionCount}</div>
            <p className="text-xs text-muted-foreground">
              Requires changes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rejectedCount}</div>
            <p className="text-xs text-muted-foreground">
              Not approved
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Event Review Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Event Submissions</CardTitle>
          <CardDescription>
            Review and approve user-submitted events
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="pending">Pending ({pendingCount})</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="needs_revision">Needs Revision</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
              <TabsTrigger value="all">All Events</TabsTrigger>
            </TabsList>

            {(['pending', 'approved', 'needs_revision', 'rejected', 'all'] as const).map((status) => (
              <TabsContent key={status} value={status} className="mt-6">
                <div className="space-y-4">
                  {filteredEvents(status).length > 0 ? (
                    filteredEvents(status).map((event) => (
                      <div key={event.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-lg">{event.title}</h3>
                              <Badge 
                                variant="outline" 
                                className={getStatusColor(event.status)}
                              >
                                {getStatusIcon(event.status)}
                                <span className="ml-1 capitalize">{event.status.replace("_", " ")}</span>
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground mb-3">
                              {event.venue && (
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {event.venue}
                                </div>
                              )}
                              {event.date && (
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(event.date), "MMM d, yyyy")}
                                </div>
                              )}
                              {event.category && (
                                <div className="flex items-center gap-1">
                                  <Tag className="h-3 w-3" />
                                  {event.category}
                                </div>
                              )}
                              {event.price && (
                                <div className="flex items-center gap-1">
                                  <DollarSign className="h-3 w-3" />
                                  {event.price}
                                </div>
                              )}
                            </div>

                            <p className="text-sm text-muted-foreground">
                              Submitted {format(new Date(event.submitted_at), "MMM d, yyyy 'at' h:mm a")}
                              {event.profiles && (
                                <span className="ml-2">
                                  by {event.profiles.first_name} {event.profiles.last_name}
                                </span>
                              )}
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

                          <div className="ml-4 flex gap-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedEvent(event)}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  Review
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                                <DialogHeader>
                                  <DialogTitle className="flex items-center gap-2">
                                    Review Event: {event.title}
                                    <Badge 
                                      variant="outline" 
                                      className={getStatusColor(event.status)}
                                    >
                                      {getStatusIcon(event.status)}
                                      <span className="ml-1 capitalize">{event.status.replace("_", " ")}</span>
                                    </Badge>
                                  </DialogTitle>
                                </DialogHeader>
                                
                                <div className="grid gap-6">
                                  {/* Event Details */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <Label className="font-semibold">Event Title</Label>
                                      <p className="text-sm">{event.title}</p>
                                    </div>
                                    
                                    <div>
                                      <Label className="font-semibold">Category</Label>
                                      <p className="text-sm">{event.category || "Not specified"}</p>
                                    </div>

                                    <div>
                                      <Label className="font-semibold">Date & Time</Label>
                                      <p className="text-sm">
                                        {event.date ? format(new Date(event.date), "PPP") : "Not specified"}
                                        {event.start_time && ` at ${event.start_time}`}
                                        {event.end_time && ` - ${event.end_time}`}
                                      </p>
                                    </div>

                                    <div>
                                      <Label className="font-semibold">Price</Label>
                                      <p className="text-sm">{event.price || "Not specified"}</p>
                                    </div>

                                    <div>
                                      <Label className="font-semibold">Venue</Label>
                                      <p className="text-sm">{event.venue || "Not specified"}</p>
                                    </div>

                                    <div>
                                      <Label className="font-semibold">Location</Label>
                                      <p className="text-sm">{event.location || "Not specified"}</p>
                                    </div>

                                    <div className="md:col-span-2">
                                      <Label className="font-semibold">Address</Label>
                                      <p className="text-sm">{event.address || "Not specified"}</p>
                                    </div>

                                    <div className="md:col-span-2">
                                      <Label className="font-semibold">Description</Label>
                                      <p className="text-sm">{event.description || "No description provided"}</p>
                                    </div>

                                    {event.tags && event.tags.length > 0 && (
                                      <div className="md:col-span-2">
                                        <Label className="font-semibold">Tags</Label>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {event.tags.map((tag) => (
                                            <Badge key={tag} variant="secondary" className="text-xs">
                                              {tag}
                                            </Badge>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Contact Information */}
                                    <div>
                                      <Label className="font-semibold">Contact Email</Label>
                                      <p className="text-sm">{event.contact_email || "Not provided"}</p>
                                    </div>

                                    <div>
                                      <Label className="font-semibold">Contact Phone</Label>
                                      <p className="text-sm">{event.contact_phone || "Not provided"}</p>
                                    </div>

                                    <div>
                                      <Label className="font-semibold">Website</Label>
                                      <p className="text-sm">
                                        {event.website_url ? (
                                          <a 
                                            href={event.website_url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline"
                                          >
                                            {event.website_url}
                                          </a>
                                        ) : "Not provided"}
                                      </p>
                                    </div>

                                    {event.image_url && (
                                      <div className="md:col-span-2">
                                        <Label className="font-semibold">Event Image</Label>
                                        <img 
                                          src={event.image_url} 
                                          alt="Event" 
                                          className="mt-2 max-w-full h-48 object-cover rounded-lg"
                                        />
                                      </div>
                                    )}
                                  </div>

                                  {/* Admin Review Section */}
                                  {event.status === 'pending' && (
                                    <div className="border-t pt-4">
                                      <Label htmlFor="admin-notes" className="font-semibold">
                                        Admin Notes (optional)
                                      </Label>
                                      <Textarea
                                        id="admin-notes"
                                        value={adminNotes}
                                        onChange={(e) => setAdminNotes(e.target.value)}
                                        placeholder="Add notes for the user (will be sent via email)..."
                                        className="mt-2"
                                        rows={3}
                                      />
                                      
                                      <div className="flex gap-2 mt-4">
                                        <Button
                                          onClick={() => handleReview('approved')}
                                          disabled={reviewEvent.isPending}
                                          className="bg-green-600 hover:bg-green-700"
                                        >
                                          <CheckCircle className="h-4 w-4 mr-2" />
                                          Approve
                                        </Button>
                                        
                                        <Button
                                          onClick={() => handleReview('needs_revision')}
                                          disabled={reviewEvent.isPending}
                                          variant="outline"
                                          className="border-yellow-500 text-yellow-700 hover:bg-yellow-50"
                                        >
                                          <AlertTriangle className="h-4 w-4 mr-2" />
                                          Needs Revision
                                        </Button>
                                        
                                        <Button
                                          onClick={() => handleReview('rejected')}
                                          disabled={reviewEvent.isPending}
                                          variant="outline"
                                          className="border-red-500 text-red-700 hover:bg-red-50"
                                        >
                                          <XCircle className="h-4 w-4 mr-2" />
                                          Reject
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No events found with status: {status === 'all' ? 'any' : status.replace('_', ' ')}
                    </div>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
