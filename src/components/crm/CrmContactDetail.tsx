import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Mail,
  Phone,
  Building,
  MapPin,
  Calendar,
  Edit,
  MessageSquare,
  Target,
  TrendingUp,
  Clock,
  Plus,
} from 'lucide-react';
import { useCrmContactSummary, useCrmContactMutations } from '@/hooks/useCrmContacts';
import { useCrmContactCommunications } from '@/hooks/useCrmCommunications';
import { useCrmContactActivities } from '@/hooks/useCrmActivities';
import { useCrmContactNotes, useCrmNoteMutations } from '@/hooks/useCrmNotes';
import { useCrmContactTasks } from '@/hooks/useCrmTasks';
import { useCrmContactSegments } from '@/hooks/useCrmSegments';
import { useCrmLeadScoreHistory } from '@/hooks/useCrmDashboard';
import { CrmActivityTimeline } from './CrmActivityTimeline';
import { CrmContactDialog } from './CrmContactDialog';
import { format, formatDistanceToNow } from 'date-fns';
import type { CrmContactStatus, CrmContactSource } from '@/types/crm';

const STATUS_COLORS: Record<CrmContactStatus, string> = {
  lead: 'bg-blue-100 text-blue-800',
  prospect: 'bg-purple-100 text-purple-800',
  customer: 'bg-green-100 text-green-800',
  churned: 'bg-red-100 text-red-800',
  inactive: 'bg-gray-100 text-gray-800',
};

const SOURCE_COLORS: Record<CrmContactSource, string> = {
  website: 'bg-blue-100 text-blue-800',
  referral: 'bg-green-100 text-green-800',
  social_media: 'bg-pink-100 text-pink-800',
  advertising: 'bg-orange-100 text-orange-800',
  event: 'bg-purple-100 text-purple-800',
  cold_outreach: 'bg-gray-100 text-gray-800',
  partnership: 'bg-teal-100 text-teal-800',
  organic: 'bg-green-100 text-green-800',
  other: 'bg-gray-100 text-gray-800',
};

interface CrmContactDetailProps {
  contactId: string;
  onBack: () => void;
}

export function CrmContactDetail({ contactId, onBack }: CrmContactDetailProps) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [newNote, setNewNote] = useState('');

  const { data: contact, isLoading } = useCrmContactSummary(contactId);
  const { data: communications } = useCrmContactCommunications(contactId);
  const { data: activities } = useCrmContactActivities(contactId);
  const { data: notes } = useCrmContactNotes(contactId);
  const { data: tasks } = useCrmContactTasks(contactId);
  const { data: segments } = useCrmContactSegments(contactId);
  const { data: scoreHistory } = useCrmLeadScoreHistory(contactId);
  const { updateLeadScore } = useCrmContactMutations();
  const { createNote } = useCrmNoteMutations();

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    await createNote.mutateAsync({
      contact_id: contactId,
      content: newNote,
    });
    setNewNote('');
  };

  const handleScoreAdjust = async (change: number) => {
    await updateLeadScore.mutateAsync({
      contactId,
      scoreChange: change,
      reason: `Manual adjustment by admin`,
    });
  };

  if (isLoading) {
    return <ContactDetailSkeleton />;
  }

  if (!contact) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Contact not found</p>
        <Button variant="link" onClick={onBack}>Go back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {contact.first_name} {contact.last_name}
          </h1>
          <p className="text-muted-foreground">
            {contact.company && `${contact.company}`}
            {contact.job_title && contact.company && ' • '}
            {contact.job_title}
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowEditDialog(true)}>
          <Edit className="mr-2 h-4 w-4" />
          Edit
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Contact Info Card */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {contact.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${contact.email}`} className="text-sm hover:underline">
                  {contact.email}
                </a>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a href={`tel:${contact.phone}`} className="text-sm hover:underline">
                  {contact.phone}
                </a>
              </div>
            )}
            {contact.company && (
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{contact.company}</span>
              </div>
            )}
            {(contact.city || contact.state) && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {[contact.city, contact.state].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                Added {format(new Date(contact.created_at), 'MMM d, yyyy')}
              </span>
            </div>

            <div className="pt-4 border-t">
              <div className="flex flex-wrap gap-2">
                <Badge className={STATUS_COLORS[contact.status]} variant="secondary">
                  {contact.status}
                </Badge>
                <Badge className={SOURCE_COLORS[contact.source]} variant="secondary">
                  {contact.source.replace('_', ' ')}
                </Badge>
              </div>
            </div>

            {segments && segments.length > 0 && (
              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-2">Segments</h4>
                <div className="flex flex-wrap gap-1">
                  {segments.map((segment) => (
                    <Badge key={segment.id} variant="outline" className="text-xs">
                      {segment.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Content */}
        <div className="md:col-span-2 space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Lead Score</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl font-bold">{contact.lead_score}</span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleScoreAdjust(5)}
                    >
                      <TrendingUp className="h-3 w-3 text-green-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleScoreAdjust(-5)}
                    >
                      <TrendingUp className="h-3 w-3 rotate-180 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Messages</span>
                </div>
                <span className="text-2xl font-bold">{contact.communications_count}</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Open Deals</span>
                </div>
                <span className="text-2xl font-bold">{contact.open_deals_count}</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Last Activity</span>
                </div>
                <span className="text-sm font-medium">
                  {contact.last_interaction_at
                    ? formatDistanceToNow(new Date(contact.last_interaction_at), { addSuffix: true })
                    : 'Never'}
                </span>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="activity" className="space-y-4">
            <TabsList>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="communications">Communications</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="score">Score History</TabsTrigger>
            </TabsList>

            <TabsContent value="activity">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Activity Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <CrmActivityTimeline
                    activities={activities?.map(a => ({
                      ...a,
                      contact_email: contact.email,
                      contact_first_name: contact.first_name,
                      contact_last_name: contact.last_name,
                      performed_by_email: null,
                    })) || []}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="communications">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Communication History</CardTitle>
                  <CardDescription>All messages and interactions with this contact</CardDescription>
                </CardHeader>
                <CardContent>
                  {communications && communications.length > 0 ? (
                    <div className="space-y-4">
                      {communications.map((comm) => (
                        <div key={comm.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{comm.channel}</Badge>
                              <Badge variant={comm.direction === 'outbound' ? 'default' : 'secondary'}>
                                {comm.direction}
                              </Badge>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(comm.sent_at), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                          {comm.subject && (
                            <h4 className="font-medium">{comm.subject}</h4>
                          )}
                          {comm.content && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
                              {comm.content}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">
                      No communications recorded yet
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notes">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Add a note..."
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      rows={2}
                    />
                    <Button onClick={handleAddNote} disabled={!newNote.trim()}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {notes && notes.length > 0 ? (
                    <div className="space-y-3">
                      {notes.map((note) => (
                        <div key={note.id} className="border rounded-lg p-3">
                          <p className="text-sm">{note.content}</p>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(note.created_at), 'MMM d, yyyy h:mm a')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">
                      No notes yet
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tasks">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Tasks</CardTitle>
                </CardHeader>
                <CardContent>
                  {tasks && tasks.length > 0 ? (
                    <div className="space-y-2">
                      {tasks.map((task) => (
                        <div key={task.id} className="flex items-center gap-3 p-2 border rounded">
                          <input
                            type="checkbox"
                            checked={task.status === 'completed'}
                            readOnly
                            className="h-4 w-4"
                          />
                          <div className="flex-1">
                            <span className={task.status === 'completed' ? 'line-through text-muted-foreground' : ''}>
                              {task.title}
                            </span>
                            {task.due_date && (
                              <span className="text-xs text-muted-foreground ml-2">
                                Due: {format(new Date(task.due_date), 'MMM d')}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">
                      No tasks assigned
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="score">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Lead Score History</CardTitle>
                </CardHeader>
                <CardContent>
                  {scoreHistory && scoreHistory.length > 0 ? (
                    <div className="space-y-2">
                      {scoreHistory.map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <span className={entry.score_change >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {entry.score_change >= 0 ? '+' : ''}{entry.score_change}
                            </span>
                            <span className="text-muted-foreground ml-2">
                              {(entry.rule as { name: string } | null)?.name || entry.reason || 'Score change'}
                            </span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(entry.created_at), 'MMM d, h:mm a')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">
                      No score history yet
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <CrmContactDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        contact={contact}
      />
    </div>
  );
}

function ContactDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <div className="flex-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32 mt-2" />
        </div>
        <Skeleton className="h-10 w-24" />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>

        <div className="md:col-span-2">
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}
