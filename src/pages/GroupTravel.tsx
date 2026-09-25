import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/components/ui/error-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SpriteIcon } from '@/components/ui/SpriteIcon';
import { Briefcase, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useContactForm } from '@/hooks/useContactForm';
import {
  EMPTY_RFP_FORM,
  RFP_MAX_LENGTH,
  RFP_SOURCE_PAGE,
  getCateringLabel,
  getVenueTypeLabel,
  toRfpContact,
  useMeetingVenues,
  validateRfp,
  withCurrentVenueNames,
  type MeetingVenueCard,
  type RfpErrors,
  type RfpFormValues,
} from '@/hooks/useMeetingVenues';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { getCanonicalUrl } from '@/lib/brandConfig';
import { ErrorSeverity, handleError } from '@/lib/errorHandler';
import { safeWebUrl } from '@/lib/hotelBooking';

const VENUE_TYPES = [
  { value: 'all', label: 'All Venues' },
  { value: 'conference_center', label: 'Conference Centers' },
  { value: 'hotel', label: 'Hotels' },
  { value: 'unique_venue', label: 'Unique Venues' },
  { value: 'outdoor', label: 'Outdoor' },
];

const CAPACITY_OPTIONS = [
  { value: 0, label: 'Any Capacity' },
  { value: 50, label: '50+' },
  { value: 100, label: '100+' },
  { value: 250, label: '250+' },
  { value: 500, label: '500+' },
  { value: 1000, label: '1,000+' },
];

/**
 * Honeypot field name. Hidden from people and assistive tech; a bot that fills
 * every input fills this one too, and submit then stops before the insert.
 * Deliberately meaningless (plan-stay-pass2 WP3 item 8): it was
 * "company_website", which browser autofill fills for real people.
 */
const HONEYPOT_NAME = 'hp_ref';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

interface RfpFieldProps {
  id: string;
  field: keyof RfpFormValues;
  label: string;
  values: RfpFormValues;
  errors: RfpErrors;
  onChange: (field: keyof RfpFormValues, value: string) => void;
  required?: boolean;
  multiline?: boolean;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: 'numeric' | 'email' | 'tel' | 'text';
  className?: string;
}

function RfpField({
  id,
  field,
  label,
  values,
  errors,
  onChange,
  required = false,
  multiline = false,
  type = 'text',
  placeholder,
  autoComplete,
  inputMode,
  className,
}: RfpFieldProps) {
  const error = errors[field];
  const errorId = `${id}-error`;
  const shared = {
    id,
    name: field,
    value: values[field],
    placeholder,
    maxLength: RFP_MAX_LENGTH[field],
    required,
    'aria-required': required || undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
  };
  return (
    <div className={className}>
      <Label htmlFor={id}>
        {label}
        {required ? ' *' : ''}
      </Label>
      {multiline ? (
        <Textarea {...shared} onChange={(e) => onChange(field, e.target.value)} />
      ) : (
        <Input
          {...shared}
          type={type}
          autoComplete={autoComplete}
          inputMode={inputMode}
          onChange={(e) => onChange(field, e.target.value)}
        />
      )}
      {error && (
        <p id={errorId} className="text-sm text-destructive mt-1">
          {error}
        </p>
      )}
    </div>
  );
}

interface VenueCardProps {
  venue: MeetingVenueCard;
  onRequest: (venue: MeetingVenueCard) => void;
}

function VenueCard({ venue, onRequest }: VenueCardProps) {
  const website = safeWebUrl(venue.website);
  return (
    <Card className="hover:border-primary transition-colors">
      <CardContent className="p-5">
        <h3 className="text-lg font-semibold mb-2">{venue.name}</h3>
        {venue.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{withCurrentVenueNames(venue.description)}</p>
        )}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {venue.venue_type && <Badge variant="secondary">{getVenueTypeLabel(venue.venue_type)}</Badge>}
          {venue.max_capacity && (
            <Badge variant="outline">
              <SpriteIcon name="users" className="h-3 w-3 mr-1" /> Up to {venue.max_capacity.toLocaleString()}
            </Badge>
          )}
          {venue.sq_footage && <Badge variant="outline">{venue.sq_footage.toLocaleString()} sq ft</Badge>}
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mb-4">
          {venue.catering && <span>{getCateringLabel(venue.catering)}</span>}
          {venue.av_equipment && <span> · A/V Equipment</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {website && (
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <a href={website} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${venue.name} website`}>
                <SpriteIcon name="external-link" className="h-4 w-4 mr-1" /> Visit website
              </a>
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className="min-h-11"
            onClick={() => onRequest(venue)}
            aria-label={`Request ${venue.name}`}
          >
            Request this venue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GroupTravel() {
  const { getStr, getNum, setParam } = useUrlFilters();
  const rawType = getStr('type', 'all');
  const venueType = VENUE_TYPES.some((t) => t.value === rawType) ? rawType : 'all';
  const rawCapacity = getNum('capacity', 0);
  const minCapacity = CAPACITY_OPTIONS.some((c) => c.value === rawCapacity) ? rawCapacity : 0;

  const { data: venues, isLoading, isError, error, refetch } = useMeetingVenues({ venueType, minCapacity });
  const { submitContactForm, loading: sending } = useContactForm();

  const [rfpForm, setRfpForm] = useState<RfpFormValues>(EMPTY_RFP_FORM);
  const [rfpErrors, setRfpErrors] = useState<RfpErrors>({});
  const [honeypot, setHoneypot] = useState('');
  /** The address a sent request will be answered at; set only after a send. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sendFailed, setSendFailed] = useState(false);
  /** "Added X to your request", read out when a card's button fills the form. */
  const [addedNote, setAddedNote] = useState('');
  const eventNameRef = useRef<HTMLDivElement>(null);

  const updateField = (field: keyof RfpFormValues, value: string) => {
    setRfpForm((prev) => ({ ...prev, [field]: value }));
    if (rfpErrors[field]) setRfpErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const requestVenue = (venue: MeetingVenueCard) => {
    const line = `Interested in: ${venue.name}`;
    setSentTo(null);
    setRfpForm((prev) => {
      if (prev.venue_requirements.includes(line)) return prev;
      const next = prev.venue_requirements ? `${line}\n${prev.venue_requirements}` : line;
      return { ...prev, venue_requirements: next.slice(0, RFP_MAX_LENGTH.venue_requirements) };
    });
    setAddedNote(`Added ${venue.name} to your request.`);
    const section = document.getElementById('rfp');
    section?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    eventNameRef.current?.querySelector('input')?.focus({ preventScroll: true });
  };

  const handleRfpSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSendFailed(false);
    if (honeypot) {
      // A person never sees the field, so this is almost always a bot. Log it
      // at warning level (no toast from handleError), write nothing, and show
      // the bot the same confirmation a real send gets.
      handleError(
        new Error('RFP honeypot field was filled'),
        { component: 'GroupTravel', action: 'rfpHoneypot' },
        ErrorSeverity.WARNING,
      );
      setSentTo(rfpForm.contact_email.trim() || null);
      setRfpForm(EMPTY_RFP_FORM);
      setHoneypot('');
      return;
    }
    const errors = validateRfp(rfpForm);
    setRfpErrors(errors);
    const firstInvalid = (Object.keys(errors) as Array<keyof RfpFormValues>)[0];
    if (firstInvalid) {
      toast.error('Check the highlighted fields.');
      document.getElementById(`rfp-${firstInvalid}`)?.focus();
      return;
    }
    // Into contact_submissions, where the admin inbox reads it (plan-stay-pass2
    // WP3 item 1). useContactForm toasts the result itself; the inline lines
    // below are what stays on screen.
    const contact = toRfpContact(rfpForm);
    const ok = await submitContactForm(contact, { sourcePage: RFP_SOURCE_PAGE });
    if (ok) {
      setSentTo(contact.email);
      setAddedNote('');
      setRfpForm(EMPTY_RFP_FORM);
    } else {
      setSendFailed(true);
    }
  };

  const fieldProps = { values: rfpForm, errors: rfpErrors, onChange: updateField };

  return (
    <>
      <SEOHead
        title="Group Travel & Meetings in Des Moines"
        description="Plan meetings, conferences, weddings and group travel in Des Moines. Search venues by capacity and type, and send a request for proposal."
        url={getCanonicalUrl('/group-travel')}
        canonicalUrl={getCanonicalUrl('/group-travel')}
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Group Travel', url: '/group-travel' },
        ]}
      />
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-4">
              <Briefcase className="h-5 w-5" />
              <span className="font-semibold">Meeting &amp; Group Travel</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">Plan Your Event in Des Moines</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Find a room for a retreat, a conference or a wedding, then send the details in one request.
            </p>
          </div>

          {/* The "30% below average convention city costs" style tiles that
              sat here had no source or date (plan-stay WP3 item 6). Deleted
              rather than footnoted: none of them could be sourced. */}

          {/* Venue Search */}
          <section className="mb-12" id="venues" aria-labelledby="venues-heading">
            <div className="flex items-center gap-2 mb-4">
              <SpriteIcon name="building-2" className="h-5 w-5 text-primary" />
              <h2 id="venues-heading" className="text-2xl font-bold">
                Meeting Venues
              </h2>
            </div>
            <div className="flex flex-wrap gap-3 mb-6">
              <Select value={venueType} onValueChange={(v) => setParam('type', v, { def: 'all' })}>
                <SelectTrigger className="w-48 min-h-11" aria-label="Venue type">
                  <SelectValue placeholder="Venue Type" />
                </SelectTrigger>
                <SelectContent>
                  {VENUE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(minCapacity)}
                onValueChange={(v) => setParam('capacity', Number(v), { def: 0 })}
              >
                <SelectTrigger className="w-48 min-h-11" aria-label="Minimum capacity">
                  <SelectValue placeholder="Min Capacity" />
                </SelectTrigger>
                <SelectContent>
                  {CAPACITY_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={String(c.value)}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-48 rounded-lg" />
                ))}
              </div>
            ) : isError ? (
              <ErrorState
                error={error}
                onRetry={() => void refetch()}
                title="Venues didn't load"
                description="The venue list is unavailable right now. Try again, or send a request below and name the venue you have in mind."
                compact
              />
            ) : venues && venues.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {venues.map((venue) => (
                  <VenueCard key={venue.id} venue={venue} onRequest={requestVenue} />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No venues match your filters.</p>
            )}
          </section>

          {/* Group Itineraries */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <SpriteIcon name="map-pin" className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Group Itineraries</h2>
            </div>
            <p className="text-muted-foreground mb-4 max-w-prose">
              Itineraries that work for group outings, team building and the free afternoon after a conference.
            </p>
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/itineraries">Browse curated itineraries</Link>
            </Button>
          </section>

          {/* RFP Form */}
          <section className="mb-12 scroll-mt-24" id="rfp" aria-labelledby="rfp-heading">
            <div className="flex items-center gap-2 mb-4">
              <Send className="h-5 w-5 text-primary" />
              <h2 id="rfp-heading" className="text-2xl font-bold">
                Submit an RFP
              </h2>
            </div>
            <Card className="max-w-2xl">
              <CardContent className="p-6">
                {sentTo && (
                  <div role="status" className="mb-6 space-y-2">
                    <p className="font-medium">Your request is with us.</p>
                    <p className="text-sm text-muted-foreground max-w-prose">
                      We&apos;ll reply to {sentTo}. We don&apos;t promise a reply time, so for anything urgent,
                      contact the venue directly.
                    </p>
                  </div>
                )}
                {/* Always in the DOM so the live region exists before it has anything to say. */}
                <p role="status" className="text-sm font-medium [&:not(:empty)]:mb-4">
                  {addedNote}
                </p>
                <form onSubmit={handleRfpSubmit} noValidate className="space-y-4" aria-labelledby="rfp-heading">
                  <p className="text-sm text-muted-foreground max-w-prose">
                    Tell us about your event: dates, headcount and what the room needs. We don&apos;t promise a
                    reply time, so for anything urgent, contact the venue directly.
                  </p>
                  {/* Honeypot. Off-screen rather than display:none, which some bots skip. */}
                  <div aria-hidden="true" className="absolute -left-[10000px] w-px h-px overflow-hidden">
                    <label htmlFor="rfp-hp-ref">Leave this empty</label>
                    <input
                      id="rfp-hp-ref"
                      name={HONEYPOT_NAME}
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div ref={eventNameRef} className="md:col-span-2">
                      <RfpField id="rfp-event_name" field="event_name" label="Event Name" required {...fieldProps} />
                    </div>
                    <RfpField
                      id="rfp-event_dates"
                      field="event_dates"
                      label="Preferred Dates"
                      placeholder="e.g. March 15-17, 2027"
                      {...fieldProps}
                    />
                    <RfpField
                      id="rfp-expected_attendance"
                      field="expected_attendance"
                      label="Expected Attendance"
                      inputMode="numeric"
                      {...fieldProps}
                    />
                    <RfpField
                      id="rfp-budget_range"
                      field="budget_range"
                      label="Budget Range"
                      placeholder="e.g. $5,000 - $15,000"
                      {...fieldProps}
                    />
                    <RfpField
                      id="rfp-organization"
                      field="organization"
                      label="Organization"
                      autoComplete="organization"
                      {...fieldProps}
                    />
                    <RfpField
                      id="rfp-venue_requirements"
                      field="venue_requirements"
                      label="Venue Requirements"
                      placeholder="A/V needs, catering preferences, room setup..."
                      multiline
                      className="md:col-span-2"
                      {...fieldProps}
                    />
                    <RfpField
                      id="rfp-contact_name"
                      field="contact_name"
                      label="Contact Name"
                      autoComplete="name"
                      required
                      {...fieldProps}
                    />
                    <RfpField
                      id="rfp-contact_email"
                      field="contact_email"
                      label="Contact Email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      required
                      {...fieldProps}
                    />
                    <RfpField
                      id="rfp-contact_phone"
                      field="contact_phone"
                      label="Phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      {...fieldProps}
                    />
                    <RfpField
                      id="rfp-notes"
                      field="notes"
                      label="Additional Notes"
                      multiline
                      className="md:col-span-2"
                      {...fieldProps}
                    />
                  </div>
                  {sendFailed && (
                    <p role="alert" className="text-sm text-destructive">
                      Your request did not go through. Please try again.
                    </p>
                  )}
                  <Button type="submit" className="w-full min-h-11" disabled={sending}>
                    {sending ? 'Submitting...' : 'Submit RFP'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </section>
        </div>
        <Footer />
      </div>
    </>
  );
}
