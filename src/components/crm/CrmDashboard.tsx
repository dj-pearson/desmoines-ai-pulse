import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Users,
  DollarSign,
  TrendingUp,
  Activity,
  Target,
  AlertCircle,
  Plus,
  BarChart3,
} from 'lucide-react';
import { useCrmDashboard } from '@/hooks/useCrmDashboard';
import { CrmContactList } from './CrmContactList';
import { CrmPipeline } from './CrmPipeline';
import { CrmSegmentList } from './CrmSegmentList';
import { CrmActivityTimeline } from './CrmActivityTimeline';
import { CrmTaskList } from './CrmTaskList';
import { CrmContactDialog } from './CrmContactDialog';
import { Skeleton } from '@/components/ui/skeleton';

export function CrmDashboard() {
  const { data: stats, isLoading } = useCrmDashboard();
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  if (isLoading) {
    return <CrmDashboardSkeleton />;
  }

  const contactGrowth = stats?.new_contacts_last_month
    ? ((stats.new_contacts_this_month - stats.new_contacts_last_month) / stats.new_contacts_last_month * 100).toFixed(1)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CRM Dashboard</h1>
          <p className="text-muted-foreground">
            Manage contacts, deals, and customer relationships
          </p>
        </div>
        <Button onClick={() => setShowContactDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Contact
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_contacts || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.new_contacts_this_month || 0} new this month
              {Number(contactGrowth) > 0 && (
                <span className="text-green-600 ml-1">+{contactGrowth}%</span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(stats?.total_pipeline_value || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.deals_by_status?.open || 0} open deals
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Won This Month</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(stats?.won_deals_value_this_month || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.won_deals_this_month || 0} deals closed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Lead Score</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.average_lead_score || 0}</div>
            <p className="text-xs text-muted-foreground">
              out of 100 points
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Overdue Tasks Warning */}
      {stats?.overdue_tasks && stats.overdue_tasks.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="py-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              <CardTitle className="text-orange-800 text-sm">
                {stats.overdue_tasks.length} Overdue Task{stats.overdue_tasks.length !== 1 ? 's' : ''}
              </CardTitle>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="segments">Segments</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Contacts by Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Contacts by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(stats?.contacts_by_status || {}).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <span className="capitalize text-sm">{status}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top Segments */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top Segments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats?.top_segments?.map((segment) => (
                    <div key={segment.segment_id} className="flex items-center justify-between">
                      <span className="text-sm">{segment.segment_name}</span>
                      <span className="font-medium">{segment.count}</span>
                    </div>
                  )) || (
                    <p className="text-sm text-muted-foreground">No segments yet</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Pipeline by Stage */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pipeline by Stage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats?.deals_by_stage?.map((stage) => (
                    <div key={stage.stage_id} className="flex items-center justify-between">
                      <span className="text-sm">{stage.stage_name}</span>
                      <span className="font-medium">{stage.count} (${stage.value.toLocaleString()})</span>
                    </div>
                  )) || (
                    <p className="text-sm text-muted-foreground">No deals yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity and Upcoming Tasks */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CrmActivityTimeline
                  activities={stats?.recent_activities || []}
                  compact
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Upcoming Tasks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CrmTaskList
                  tasks={stats?.upcoming_tasks || []}
                  compact
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="contacts">
          <CrmContactList />
        </TabsContent>

        <TabsContent value="pipeline">
          <CrmPipeline />
        </TabsContent>

        <TabsContent value="segments">
          <CrmSegmentList />
        </TabsContent>

        <TabsContent value="activities">
          <Card>
            <CardHeader>
              <CardTitle>Activity Timeline</CardTitle>
              <CardDescription>All CRM activities across contacts and deals</CardDescription>
            </CardHeader>
            <CardContent>
              <CrmActivityTimeline />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks">
          <CrmTaskList />
        </TabsContent>
      </Tabs>

      {/* Contact Dialog */}
      <CrmContactDialog
        open={showContactDialog}
        onOpenChange={setShowContactDialog}
      />
    </div>
  );
}

function CrmDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-32 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Skeleton className="h-10 w-full" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[...Array(4)].map((_, j) => (
                  <Skeleton key={j} className="h-4 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
