import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';
import { Ban, Mail, Plus, Search, Shield, Trash2 } from 'lucide-react';

const log = createLogger('BlockedEmailDomainsManager');

interface BlockedEmailDomain {
  id: string;
  domain: string;
  source: 'seed' | 'admin';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const TABLE = 'blocked_email_domains';
const PAGE_SIZE = 50;

// Accepts anything that looks like a valid DNS label sequence. Rejects leading
// "@" prefixes, whitespace, and URL-style inputs.
const DOMAIN_REGEX = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^@/, '');
}

function isValidDomain(domain: string): boolean {
  return DOMAIN_REGEX.test(domain);
}

export default function BlockedEmailDomainsManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [newDomain, setNewDomain] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [pendingDelete, setPendingDelete] = useState<BlockedEmailDomain | null>(null);

  // -------------------------------------------------------------------------
  // Total count (separate query so pagination doesn't mask it)
  // -------------------------------------------------------------------------
  const totalCountQuery = useQuery({
    queryKey: ['admin-blocked-email-domains', 'count'],
    queryFn: async () => {
      const { count, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(TABLE as any)
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  // -------------------------------------------------------------------------
  // Paginated, searchable list
  // -------------------------------------------------------------------------
  const listQuery = useQuery({
    queryKey: ['admin-blocked-email-domains', 'list', search, page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(TABLE as any)
        .select('*', { count: 'exact' })
        .order('domain', { ascending: true })
        .range(from, to);

      const term = normalizeDomain(search);
      if (term) {
        // Escape the two PostgREST wildcard characters so a user-entered `%`
        // or `_` is treated as a literal rather than a wildcard.
        const safeTerm = term.replace(/[%_]/g, (c) => `\\${c}`);
        query = query.ilike('domain', `%${safeTerm}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        rows: (data ?? []) as unknown as BlockedEmailDomain[],
        count: count ?? 0,
      };
    },
  });

  const totalCount = totalCountQuery.data ?? 0;
  const filteredCount = listQuery.data?.count ?? 0;
  const rows = listQuery.data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));

  const sourceCounts = useMemo(() => {
    // We don't fetch a full aggregate — show a lightweight summary for
    // whatever page we're on. Exact per-source totals would need a dedicated
    // RPC; this is a reasonable approximation for the admin UI.
    const seeded = rows.filter((r) => r.source === 'seed').length;
    const manual = rows.filter((r) => r.source === 'admin').length;
    return { seeded, manual };
  }, [rows]);

  // -------------------------------------------------------------------------
  // Add mutation
  // -------------------------------------------------------------------------
  const addDomain = useMutation({
    mutationFn: async ({ domain, notes }: { domain: string; notes: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(TABLE as any)
        .insert({
          domain,
          source: 'admin',
          notes: notes.trim() ? notes.trim() : null,
          created_by: userData.user?.id ?? null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-blocked-email-domains'] });
      setNewDomain('');
      setNewNotes('');
      toast({
        title: 'Domain Blocked',
        description: 'The domain has been added to the blocklist.',
      });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error('addDomain', 'Failed to add blocked domain', { error });
      toast({
        title: 'Failed to Add Domain',
        description: message.includes('duplicate')
          ? 'That domain is already on the blocklist.'
          : message,
        variant: 'destructive',
      });
    },
  });

  // -------------------------------------------------------------------------
  // Delete mutation
  // -------------------------------------------------------------------------
  const deleteDomain = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(TABLE as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-blocked-email-domains'] });
      setPendingDelete(null);
      toast({
        title: 'Domain Removed',
        description: 'The domain has been removed from the blocklist.',
      });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error('deleteDomain', 'Failed to delete blocked domain', { error });
      toast({
        title: 'Failed to Remove Domain',
        description: message,
        variant: 'destructive',
      });
    },
  });

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeDomain(newDomain);

    if (!normalized) {
      toast({
        title: 'Domain Required',
        description: 'Please enter a domain to block.',
        variant: 'destructive',
      });
      return;
    }

    if (!isValidDomain(normalized)) {
      toast({
        title: 'Invalid Domain',
        description:
          'Enter a domain like "example.com" — not an email address or URL.',
        variant: 'destructive',
      });
      return;
    }

    addDomain.mutate({ domain: normalized, notes: newNotes });
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-red-500" />
            Blocked Email Domains
          </CardTitle>
          <CardDescription>
            Disposable and throwaway email domains blocked from signup. Seeded from the{' '}
            <a
              href="https://github.com/disposable-email-domains/disposable-email-domains"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-primary"
            >
              disposable-email-domains
            </a>{' '}
            project — add or remove entries as needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="text-sm text-muted-foreground">Total Blocked</div>
              <div className="text-2xl font-bold flex items-center gap-2">
                <Shield className="h-5 w-5 text-muted-foreground" />
                {totalCountQuery.isLoading ? '—' : totalCount.toLocaleString()}
              </div>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="text-sm text-muted-foreground">
                Currently Showing
              </div>
              <div className="text-2xl font-bold">
                {listQuery.isLoading ? '—' : filteredCount.toLocaleString()}
              </div>
              {search && (
                <div className="text-xs text-muted-foreground">matching "{search}"</div>
              )}
            </div>
            <div className="p-4 border rounded-lg">
              <div className="text-sm text-muted-foreground">This Page</div>
              <div className="text-sm mt-2 space-y-1">
                <div>
                  <Badge variant="secondary">Seeded</Badge>{' '}
                  <span className="font-mono">{sourceCounts.seeded}</span>
                </div>
                <div>
                  <Badge variant="default">Admin</Badge>{' '}
                  <span className="font-mono">{sourceCounts.manual}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Add new */}
          <form
            onSubmit={handleAdd}
            className="grid grid-cols-1 md:grid-cols-[2fr_3fr_auto] gap-3 items-end p-4 border rounded-lg bg-muted/30"
          >
            <div>
              <Label htmlFor="new-domain">Domain</Label>
              <Input
                id="new-domain"
                placeholder="example.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                autoComplete="off"
                disabled={addDomain.isPending}
              />
            </div>
            <div>
              <Label htmlFor="new-notes">Notes (optional)</Label>
              <Textarea
                id="new-notes"
                placeholder="Why is this domain blocked?"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={1}
                disabled={addDomain.isPending}
              />
            </div>
            <Button type="submit" disabled={addDomain.isPending}>
              <Plus className="h-4 w-4 mr-2" />
              {addDomain.isPending ? 'Adding…' : 'Block Domain'}
            </Button>
          </form>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search domains…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>

          {/* List */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead className="w-28">Source</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-32">Added</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : listQuery.isError ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-destructive py-8">
                      Failed to load blocked domains.
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {search ? 'No domains match your search.' : 'No blocked domains yet.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono">{row.domain}</TableCell>
                      <TableCell>
                        <Badge variant={row.source === 'admin' ? 'default' : 'secondary'}>
                          {row.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {row.notes ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(row.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDelete(row)}
                          disabled={deleteDomain.isPending}
                          aria-label={`Remove ${row.domain}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {filteredCount > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground">
                Page {page + 1} of {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" />
              Remove blocked domain?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Remove <span className="font-mono font-semibold">{pendingDelete?.domain}</span>{' '}
              from the blocklist? New users with email addresses at this domain will be able
              to sign up again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteDomain.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteDomain.mutate(pendingDelete.id)}
              disabled={deleteDomain.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteDomain.isPending ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
