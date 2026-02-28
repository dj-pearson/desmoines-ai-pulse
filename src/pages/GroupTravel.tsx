import { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useMeetingVenues, useSubmitRfp, getVenueTypeLabel, getCateringLabel } from '@/hooks/useMeetingVenues';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Users, Building2, Briefcase, MapPin, Star, Plane, Utensils, TreePine, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const VENUE_TYPES = [
  { value: 'all', label: 'All Venues' },
  { value: 'conference_center', label: 'Conference Centers' },
  { value: 'hotel', label: 'Hotels' },
  { value: 'unique_venue', label: 'Unique Venues' },
  { value: 'outdoor', label: 'Outdoor' },
];

export default function GroupTravel() {
  const [venueType, setVenueType] = useState('all');
  const [minCapacity, setMinCapacity] = useState(0);
  const { data: venues, isLoading } = useMeetingVenues({ venueType, minCapacity });
  const submitRfp = useSubmitRfp();

  const [rfpForm, setRfpForm] = useState({
    event_name: '',
    event_dates: '',
    expected_attendance: '',
    venue_requirements: '',
    budget_range: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    organization: '',
    notes: '',
  });

  const handleRfpSubmit = async () => {
    if (!rfpForm.event_name || !rfpForm.contact_name || !rfpForm.contact_email) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await submitRfp.mutateAsync({
        ...rfpForm,
        expected_attendance: Number(rfpForm.expected_attendance) || 0,
      });
      toast.success('RFP submitted! We will get back to you within 2 business days.');
      setRfpForm({ event_name: '', event_dates: '', expected_attendance: '', venue_requirements: '', budget_range: '', contact_name: '', contact_email: '', contact_phone: '', organization: '', notes: '' });
    } catch {
      toast.error('Failed to submit. Please try again.');
    }
  };

  return (
    <>
      <Helmet>
        <title>Meeting Planner & Group Travel — Venues, RFP | Des Moines Insider</title>
        <meta name="description" content="Plan meetings, conferences, weddings, and group travel in Des Moines. Search venues by capacity, submit an RFP, and explore group itineraries." />
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-4 py-2 rounded-full mb-4">
              <Briefcase className="h-5 w-5" />
              <span className="font-semibold">Meeting & Group Travel</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              Plan Your Event in Des Moines
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From intimate retreats to large conferences — Des Moines offers world-class venues, an award-winning food scene, and Midwestern hospitality.
            </p>
          </div>

          {/* Why DSM Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {[
              { icon: Plane, stat: 'Central Location', desc: '3hr flight to 80% of US' },
              { icon: Utensils, stat: 'Award-Winning', desc: 'Top food city in the Midwest' },
              { icon: TreePine, stat: '800+ Miles', desc: 'of trails for team outings' },
              { icon: Star, stat: '30% Below', desc: 'average convention city costs' },
            ].map((item) => (
              <Card key={item.stat}>
                <CardContent className="p-4 text-center">
                  <item.icon className="h-7 w-7 mx-auto mb-2 text-primary" />
                  <p className="font-bold text-sm">{item.stat}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Venue Search */}
          <section className="mb-12" id="venues">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Meeting Venues</h2>
            </div>
            <div className="flex flex-wrap gap-3 mb-6">
              <Select value={venueType} onValueChange={setVenueType}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Venue Type" />
                </SelectTrigger>
                <SelectContent>
                  {VENUE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(minCapacity)} onValueChange={(v) => setMinCapacity(Number(v))}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Min Capacity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Any Capacity</SelectItem>
                  <SelectItem value="50">50+</SelectItem>
                  <SelectItem value="100">100+</SelectItem>
                  <SelectItem value="250">250+</SelectItem>
                  <SelectItem value="500">500+</SelectItem>
                  <SelectItem value="1000">1,000+</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-48 rounded-lg" />
                ))}
              </div>
            ) : venues && venues.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {venues.map((venue) => (
                  <Card key={venue.id} className="hover:border-primary transition-colors">
                    <CardContent className="p-5">
                      <h3 className="text-lg font-semibold mb-2">{venue.name}</h3>
                      {venue.description && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{venue.description}</p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap mb-3">
                        {venue.venue_type && (
                          <Badge variant="secondary">{getVenueTypeLabel(venue.venue_type)}</Badge>
                        )}
                        {venue.max_capacity && (
                          <Badge variant="outline">
                            <Users className="h-3 w-3 mr-1" /> Up to {venue.max_capacity.toLocaleString()}
                          </Badge>
                        )}
                        {venue.sq_footage && (
                          <Badge variant="outline">{venue.sq_footage.toLocaleString()} sq ft</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                        {venue.catering && <span>{getCateringLabel(venue.catering)}</span>}
                        {venue.av_equipment && <span> · A/V Equipment</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No venues match your filters.</p>
            )}
          </section>

          {/* Group Itineraries */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Group Itineraries</h2>
            </div>
            <p className="text-muted-foreground mb-4">
              Explore our curated itineraries perfect for group outings, team building, and post-conference activities.
            </p>
            <Link to="/itineraries">
              <Button variant="outline">Browse Curated Itineraries</Button>
            </Link>
          </section>

          {/* RFP Form */}
          <section className="mb-12" id="rfp">
            <div className="flex items-center gap-2 mb-4">
              <Send className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Submit an RFP</h2>
            </div>
            <Card className="max-w-2xl">
              <CardContent className="p-6 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Tell us about your event and we&apos;ll connect you with the best venues and services in Des Moines.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <Label htmlFor="rfp-event">Event Name *</Label>
                    <Input id="rfp-event" value={rfpForm.event_name} onChange={(e) => setRfpForm(p => ({ ...p, event_name: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="rfp-dates">Preferred Dates</Label>
                    <Input id="rfp-dates" placeholder="e.g. March 15-17, 2026" value={rfpForm.event_dates} onChange={(e) => setRfpForm(p => ({ ...p, event_dates: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="rfp-attendance">Expected Attendance</Label>
                    <Input id="rfp-attendance" type="number" value={rfpForm.expected_attendance} onChange={(e) => setRfpForm(p => ({ ...p, expected_attendance: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="rfp-budget">Budget Range</Label>
                    <Input id="rfp-budget" placeholder="e.g. $5,000 - $15,000" value={rfpForm.budget_range} onChange={(e) => setRfpForm(p => ({ ...p, budget_range: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="rfp-org">Organization</Label>
                    <Input id="rfp-org" value={rfpForm.organization} onChange={(e) => setRfpForm(p => ({ ...p, organization: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="rfp-reqs">Venue Requirements</Label>
                    <Textarea id="rfp-reqs" placeholder="A/V needs, catering preferences, room setup..." value={rfpForm.venue_requirements} onChange={(e) => setRfpForm(p => ({ ...p, venue_requirements: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="rfp-name">Contact Name *</Label>
                    <Input id="rfp-name" value={rfpForm.contact_name} onChange={(e) => setRfpForm(p => ({ ...p, contact_name: e.target.value }))} autoComplete="name" />
                  </div>
                  <div>
                    <Label htmlFor="rfp-email">Contact Email *</Label>
                    <Input id="rfp-email" type="email" value={rfpForm.contact_email} onChange={(e) => setRfpForm(p => ({ ...p, contact_email: e.target.value }))} autoComplete="email" />
                  </div>
                  <div>
                    <Label htmlFor="rfp-phone">Phone</Label>
                    <Input id="rfp-phone" type="tel" value={rfpForm.contact_phone} onChange={(e) => setRfpForm(p => ({ ...p, contact_phone: e.target.value }))} autoComplete="tel" />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="rfp-notes">Additional Notes</Label>
                    <Textarea id="rfp-notes" value={rfpForm.notes} onChange={(e) => setRfpForm(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                </div>
                <Button className="w-full" onClick={handleRfpSubmit} disabled={submitRfp.isPending}>
                  {submitRfp.isPending ? 'Submitting...' : 'Submit RFP'}
                </Button>
              </CardContent>
            </Card>
          </section>
        </div>
        <Footer />
      </div>
    </>
  );
}
