/**
 * Activity Log Viewer
 * View and search admin action logs with filtering and export
 */

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { Search, Download, Filter, User, Calendar, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { useDataExport } from '@/hooks/useDataExport';

interface AdminActionLog {
  id: string;
  admin_user_id: string;
  action_type: string;
  target_resource: string | null;
  target_id: string | null;
  old_values: any;
  new_values: any;
  created_at: string;
  admin_email?: string;
}

export function ActivityLogViewer() {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionTypeFilter, setActionTypeFilter] = useState<string>('all');
  const [resourceFilter, setResourceFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('7d');
  const { isExporting, exportData } = useDataExport();

  // Fetch admin action logs
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['admin-action-logs', dateRange],
    queryFn: async () => {
      const daysAgo = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);

      const { data, error } = await supabase
        .from('admin_action_logs')
        .select(`
          *,
          profiles:admin_user_id (
            email
          )
        `)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      return (data || []).map(log => ({
        ...log,
        admin_email: (log as any).profiles?.email || 'Unknown'
      })) as AdminActionLog[];
    },
    staleTime: 1000 * 60 // 1 minute
  });

  // Filter logs
  const filteredLogs = useMemo(() => {
    let filtered = logs;

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        log =>
          log.admin_email?.toLowerCase().includes(term) ||
          log.action_type?.toLowerCase().includes(term) ||
          log.target_resource?.toLowerCase().includes(term) ||
          log.target_id?.toLowerCase().includes(term)
      );
    }

    // Action type filter
    if (actionTypeFilter !== 'all') {
      filtered = filtered.filter(log => log.action_type === actionTypeFilter);
    }

    // Resource filter
    if (resourceFilter !== 'all') {
      filtered = filtered.filter(log => log.target_resource === resourceFilter);
    }

    return filtered;
  }, [logs, searchTerm, actionTypeFilter, resourceFilter]);

  // Get unique action types and resources for filters
  const actionTypes = useMemo(() => {
    const types = new Set(logs.map(log => log.action_type));
    return Array.from(types).sort();
  }, [logs]);

  const resources = useMemo(() => {
    const res = new Set(logs.map(log => log.target_resource).filter(Boolean));
    return Array.from(res).sort();
  }, [logs]);

  const handleExport = async () => {
    await exportData(filteredLogs, {
      filenamePrefix: 'admin-activity-logs',
      columns: [
        { key: 'created_at', label: 'Date & Time', type: 'date' },
        { key: 'admin_email', label: 'Admin User', type: 'text' },
        { key: 'action_type', label: 'Action Type', type: 'text' },
        { key: 'target_resource', label: 'Resource', type: 'text' },
        { key: 'target_id', label: 'Target ID', type: 'text' },
      ]
    });
  };

  const getActionTypeBadge = (actionType: string) => {
    const variants: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
      'user_management': 'default',
      'content_management': 'secondary',
      'system_configuration': 'destructive',
      'security': 'outline'
    };

    return (
      <Badge variant={variants[actionType] || 'outline'}>
        {actionType.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const formatChanges = (oldValues: any, newValues: any) => {
    if (!oldValues && !newValues) return 'No changes recorded';

    const changes: string[] = [];

    if (newValues) {
      Object.keys(newValues).forEach(key => {
        const oldVal = oldValues?.[key];
        const newVal = newValues[key];

        if (oldVal !== newVal) {
          changes.push(`${key}: ${oldVal || '(empty)'} → ${newVal || '(empty)'}`);
        }
      });
    }

    return changes.length > 0 ? changes.join(', ') : 'No changes';
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Activity Log</CardTitle>
              <CardDescription>
                View and search admin actions ({filteredLogs.length} of {logs.length} logs)
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleExport}
                disabled={isExporting || filteredLogs.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                {isExporting ? 'Exporting...' : 'Export'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={actionTypeFilter} onValueChange={setActionTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Action Types</SelectItem>
                {actionTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    {type.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={resourceFilter} onValueChange={setResourceFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Resources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Resources</SelectItem>
                {resources.map(resource => (
                  <SelectItem key={resource} value={resource!}>
                    {resource}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{logs.length}</div>
                <p className="text-xs text-muted-foreground">Total Actions</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {new Set(logs.map(l => l.admin_user_id)).size}
                </div>
                <p className="text-xs text-muted-foreground">Active Admins</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {logs.filter(l => l.action_type === 'content_management').length}
                </div>
                <p className="text-xs text-muted-foreground">Content Changes</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {logs.filter(l => l.action_type === 'user_management').length}
                </div>
                <p className="text-xs text-muted-foreground">User Changes</p>
              </CardContent>
            </Card>
          </div>

          {/* Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Admin User</TableHead>
                  <TableHead>Action Type</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Target ID</TableHead>
                  <TableHead>Changes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Loading activity logs...
                    </TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No activity logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.slice(0, 100).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {format(new Date(log.created_at), 'MMM dd, yyyy HH:mm')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {log.admin_email}
                        </div>
                      </TableCell>
                      <TableCell>{getActionTypeBadge(log.action_type)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.target_resource || 'N/A'}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.target_id ? log.target_id.slice(0, 8) + '...' : 'N/A'}
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="text-sm text-muted-foreground truncate">
                          {formatChanges(log.old_values, log.new_values)}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {filteredLogs.length > 100 && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              Showing 100 of {filteredLogs.length} logs. Use filters to narrow down results.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
