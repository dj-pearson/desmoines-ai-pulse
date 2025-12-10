import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Mail,
  Phone,
  Building,
  Plus,
  Filter,
  SortAsc,
  SortDesc,
} from 'lucide-react';
import { useCrmContacts, useCrmContactMutations } from '@/hooks/useCrmContacts';
import { CrmContactDialog } from './CrmContactDialog';
import { CrmContactDetail } from './CrmContactDetail';
import { Skeleton } from '@/components/ui/skeleton';
import type { CrmContact, CrmContactFilters, CrmContactStatus, CrmContactSource } from '@/types/crm';

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

export function CrmContactList() {
  const [filters, setFilters] = useState<CrmContactFilters>({
    page: 1,
    per_page: 25,
    sort_by: 'created_at',
    sort_order: 'desc',
  });
  const [search, setSearch] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<CrmContact | null>(null);
  const [viewingContact, setViewingContact] = useState<CrmContact | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading } = useCrmContacts({
    ...filters,
    search: search || undefined,
  });
  const { deleteContact } = useCrmContactMutations();

  const handleSearch = (value: string) => {
    setSearch(value);
    setFilters(prev => ({ ...prev, page: 1 }));
  };

  const handleStatusFilter = (value: string) => {
    setFilters(prev => ({
      ...prev,
      status: value === 'all' ? undefined : value as CrmContactStatus,
      page: 1,
    }));
  };

  const handleSourceFilter = (value: string) => {
    setFilters(prev => ({
      ...prev,
      source: value === 'all' ? undefined : value as CrmContactSource,
      page: 1,
    }));
  };

  const handleSort = (field: CrmContactFilters['sort_by']) => {
    setFilters(prev => ({
      ...prev,
      sort_by: field,
      sort_order: prev.sort_by === field && prev.sort_order === 'desc' ? 'asc' : 'desc',
    }));
  };

  const handleDelete = async (contact: CrmContact) => {
    if (window.confirm(`Are you sure you want to delete ${contact.first_name} ${contact.last_name}?`)) {
      await deleteContact.mutateAsync(contact.id);
    }
  };

  if (viewingContact) {
    return (
      <CrmContactDetail
        contactId={viewingContact.id}
        onBack={() => setViewingContact(null)}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Contacts</CardTitle>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Contact
          </Button>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col gap-4 mt-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>
          </div>

          {showFilters && (
            <div className="flex gap-2 flex-wrap">
              <Select
                value={filters.status as string || 'all'}
                onValueChange={handleStatusFilter}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="churned">Churned</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.source as string || 'all'}
                onValueChange={handleSourceFilter}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="referral">Referral</SelectItem>
                  <SelectItem value="social_media">Social Media</SelectItem>
                  <SelectItem value="advertising">Advertising</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="cold_outreach">Cold Outreach</SelectItem>
                  <SelectItem value="partnership">Partnership</SelectItem>
                  <SelectItem value="organic">Organic</SelectItem>
                </SelectContent>
              </Select>

              <Input
                type="number"
                placeholder="Min Score"
                className="w-[120px]"
                min={0}
                max={100}
                value={filters.min_lead_score || ''}
                onChange={(e) => setFilters(prev => ({
                  ...prev,
                  min_lead_score: e.target.value ? parseInt(e.target.value) : undefined,
                  page: 1,
                }))}
              />
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <ContactListSkeleton />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort('first_name')}
                  >
                    <div className="flex items-center gap-1">
                      Name
                      {filters.sort_by === 'first_name' && (
                        filters.sort_order === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort('company')}
                  >
                    <div className="flex items-center gap-1">
                      Company
                      {filters.sort_by === 'company' && (
                        filters.sort_order === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort('lead_score')}
                  >
                    <div className="flex items-center gap-1">
                      Score
                      {filters.sort_by === 'lead_score' && (
                        filters.sort_order === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <div className="font-medium">
                        {contact.first_name} {contact.last_name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        {contact.email && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {contact.email}
                          </div>
                        )}
                        {contact.phone && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {contact.phone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {contact.company && (
                        <div className="flex items-center gap-1">
                          <Building className="h-3 w-3 text-muted-foreground" />
                          <span>{contact.company}</span>
                        </div>
                      )}
                      {contact.job_title && (
                        <div className="text-xs text-muted-foreground">{contact.job_title}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[contact.status]} variant="secondary">
                        {contact.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={SOURCE_COLORS[contact.source]} variant="secondary">
                        {contact.source.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <div
                          className="w-10 h-2 rounded-full bg-gray-200 overflow-hidden"
                          title={`Lead Score: ${contact.lead_score}`}
                        >
                          <div
                            className={`h-full ${
                              contact.lead_score >= 70 ? 'bg-green-500' :
                              contact.lead_score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${contact.lead_score}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">{contact.lead_score}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewingContact(contact)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingContact(contact)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleDelete(contact)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}

                {data?.contacts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No contacts found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {data && data.total > data.perPage && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {((data.page - 1) * data.perPage) + 1} to{' '}
                  {Math.min(data.page * data.perPage, data.total)} of {data.total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={data.page <= 1}
                    onClick={() => setFilters(prev => ({ ...prev, page: (prev.page || 1) - 1 }))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={data.page * data.perPage >= data.total}
                    onClick={() => setFilters(prev => ({ ...prev, page: (prev.page || 1) + 1 }))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Dialogs */}
      <CrmContactDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />

      <CrmContactDialog
        open={!!editingContact}
        onOpenChange={(open) => !open && setEditingContact(null)}
        contact={editingContact || undefined}
      />
    </Card>
  );
}

function ContactListSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}
