import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUserStats } from '@/hooks/useUserStats';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  Area, AreaChart,
} from 'recharts';
import {
  Users, UserPlus, Activity, TrendingUp,
  RefreshCw, Globe, Crown, Star,
} from 'lucide-react';

export default function UserInsightsDashboard() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const { data, isLoading, refetch, isRefetching } = useUserStats(timeRange);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-16 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-64 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const weekGrowthPct = data.totalUsers > 0
    ? ((data.newThisWeek / Math.max(1, data.totalUsers - data.newThisWeek)) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-500" />
            User Insights
          </h2>
          <p className="text-muted-foreground">
            Real-time user growth, acquisition, and engagement data
          </p>
        </div>
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as const).map((range) => (
            <Button
              key={range}
              variant={timeRange === range ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange(range)}
            >
              {range}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.totalUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Registered accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-green-500" />
              New This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{data.newThisWeek}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-green-600">+{weekGrowthPct}%</span> growth
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              New This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">{data.newThisMonth}</div>
            <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-orange-500" />
              Active Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{data.activeToday}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Unique sessions
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1: Growth + Acquisition */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* User Growth Over Time */}
        <Card>
          <CardHeader>
            <CardTitle>User Growth</CardTitle>
            <CardDescription>Daily signups and cumulative total</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data.growthData}>
                <defs>
                  <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => {
                    const date = new Date(d + 'T00:00:00');
                    return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
                  }}
                  fontSize={12}
                />
                <YAxis yAxisId="left" fontSize={12} />
                <YAxis yAxisId="right" orientation="right" fontSize={12} />
                <Tooltip
                  labelFormatter={(d) => new Date(d + 'T00:00:00').toLocaleDateString('en', {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })}
                />
                <Legend />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#3b82f6"
                  fill="url(#growthGradient)"
                  name="Total Users"
                />
                <Bar yAxisId="left" dataKey="signups" fill="#22c55e" name="New Signups" radius={[2, 2, 0, 0]} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Acquisition Sources */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-500" />
              Acquisition Sources
            </CardTitle>
            <CardDescription>Where your traffic comes from (by session)</CardDescription>
          </CardHeader>
          <CardContent>
            {data.referrerBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.referrerBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" fontSize={12} />
                  <YAxis dataKey="source" type="category" width={100} fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#6366f1" name="Sessions" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No referrer data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Subscriptions + Interests */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Subscription Tier Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              Subscription Tiers
            </CardTitle>
            <CardDescription>User distribution by plan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row items-center gap-6">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={data.subscriptionBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="tier"
                    label={({ tier, count }) => `${tier}: ${count}`}
                  >
                    {data.subscriptionBreakdown.map((entry) => (
                      <Cell key={entry.tier} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3 min-w-[140px]">
                {data.subscriptionBreakdown.map((tier) => (
                  <div key={tier.tier} className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: tier.color }}
                    />
                    <div>
                      <p className="font-medium text-sm">{tier.tier}</p>
                      <p className="text-xs text-muted-foreground">
                        {tier.count} user{tier.count !== 1 ? 's' : ''}
                        {data.totalUsers > 0 && (
                          <> ({((tier.count / data.totalUsers) * 100).toFixed(0)}%)</>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Interests */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              User Interests
            </CardTitle>
            <CardDescription>Most popular interest tags selected by users</CardDescription>
          </CardHeader>
          <CardContent>
            {data.interestBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.interestBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="interest" fontSize={11} angle={-35} textAnchor="end" height={60} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#f59e0b" name="Users" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-muted-foreground">
                No interest data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Signups Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Signups</CardTitle>
          <CardDescription>Last 20 registered users</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 font-medium text-muted-foreground">User</th>
                  <th className="pb-3 font-medium text-muted-foreground">Email</th>
                  <th className="pb-3 font-medium text-muted-foreground">Location</th>
                  <th className="pb-3 font-medium text-muted-foreground">Interests</th>
                  <th className="pb-3 font-medium text-muted-foreground">Joined</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSignups.map((user) => (
                  <tr key={user.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 font-medium">
                      {user.first_name || user.last_name
                        ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
                        : 'Anonymous'}
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {user.email ?? '—'}
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {user.location ?? '—'}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {(user.interests ?? []).slice(0, 3).map((interest) => (
                          <Badge key={interest} variant="outline" className="text-xs">
                            {interest}
                          </Badge>
                        ))}
                        {(user.interests ?? []).length > 3 && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            +{(user.interests ?? []).length - 3}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(user.created_at).toLocaleDateString('en', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
                {data.recentSignups.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
