/**
 * Event Promotion Planner - Charts View Component
 * Visualizations for budget allocation and channel recommendations
 */

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PromotionTimeline } from '@/types/event-promotion';

interface ChartsViewProps {
  timeline: PromotionTimeline;
}

const CHANNEL_COLORS: Record<string, string> = {
  social: '#3b82f6',
  email: '#22c55e',
  print: '#a855f7',
  radio: '#ef4444',
  partnerships: '#eab308',
  seo: '#6366f1',
  community: '#ec4899',
  'paid-ads': '#f97316',
};

export function ChartsView({ timeline }: ChartsViewProps) {
  // Prepare budget allocation data
  const budgetData = timeline.budget.map((allocation) => ({
    name: allocation.channel.replace('-', ' ').toUpperCase(),
    value: allocation.percentage,
    amount: allocation.amount,
    description: allocation.description,
    color: CHANNEL_COLORS[allocation.channel] || '#gray',
  }));

  // Prepare channel recommendations data
  const channelData = timeline.channels.slice(0, 6).map((channel) => ({
    name: channel.channel.replace('-', ' ').toUpperCase(),
    priority: 6 - channel.priority, // Invert for better visualization (higher is better)
    allocation: channel.budgetAllocation,
    frequency: channel.postingFrequency,
    color: CHANNEL_COLORS[channel.channel] || '#gray',
  }));

  // Tasks by channel
  const tasksByChannel = timeline.weeks.reduce((acc, week) => {
    week.tasks.forEach((task) => {
      const channel = task.channel;
      acc[channel] = (acc[channel] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  const tasksData = Object.entries(tasksByChannel).map(([channel, count]) => ({
    name: channel.replace('-', ' ').toUpperCase(),
    tasks: count,
    color: CHANNEL_COLORS[channel] || '#gray',
  }));

  // Tasks by week
  const weeklyTasksData = timeline.weeks.map((week) => ({
    name: `Week ${week.week}`,
    tasks: week.tasks.length,
    daysOut: week.daysOut,
  }));

  return (
    <div className="space-y-6">
      {/* Budget Allocation */}
      <Card>
        <CardHeader>
          <CardTitle>Budget Allocation</CardTitle>
          <CardDescription>
            How to distribute your ${timeline.eventData.budget} promotion budget
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart */}
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={budgetData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {budgetData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ payload }) => {
                      if (payload && payload.length > 0) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-3 rounded-lg shadow-lg border">
                            <p className="font-semibold">{data.name}</p>
                            <p className="text-sm text-gray-600">{data.description}</p>
                            <p className="text-sm font-medium mt-1">
                              {data.value}% {data.amount > 0 && `($${data.amount})`}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend with Details */}
            <div className="space-y-3">
              {budgetData.map((item, index) => (
                <div key={index} className="flex items-start gap-3 p-2 rounded hover:bg-gray-50">
                  <div
                    className="w-4 h-4 rounded mt-1 flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{item.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {item.value}%
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-600">{item.description}</p>
                    {item.amount > 0 && (
                      <p className="text-xs font-medium text-primary mt-1">${item.amount}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Channel Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Channel Recommendations</CardTitle>
          <CardDescription>
            Prioritized promotion channels for your {timeline.eventData.eventType} event
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={channelData} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={100} />
              <Tooltip
                content={({ payload }) => {
                  if (payload && payload.length > 0) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white p-3 rounded-lg shadow-lg border">
                        <p className="font-semibold">{data.name}</p>
                        <p className="text-sm text-gray-600">Priority Score: {data.priority}</p>
                        <p className="text-sm text-gray-600">Budget: {data.allocation}%</p>
                        <p className="text-sm text-gray-600">{data.frequency}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="priority" radius={[0, 8, 8, 0]}>
                {channelData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tasks Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks by Channel */}
        <Card>
          <CardHeader>
            <CardTitle>Tasks by Channel</CardTitle>
            <CardDescription>Total promotional tasks per channel</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={tasksData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={12} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="tasks" radius={[8, 8, 0, 0]}>
                  {tasksData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Weekly Task Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Task Distribution</CardTitle>
            <CardDescription>Number of tasks per week</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={weeklyTasksData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip
                  content={({ payload }) => {
                    if (payload && payload.length > 0) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-2 rounded-lg shadow-lg border">
                          <p className="font-semibold">{data.name}</p>
                          <p className="text-sm text-gray-600">{data.daysOut} days out</p>
                          <p className="text-sm font-medium">{data.tasks} tasks</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="tasks" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Key Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Key Insights</CardTitle>
          <CardDescription>Important takeaways from your promotion plan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InsightCard
              title="Top Priority Channel"
              value={timeline.channels[0]?.channel.replace('-', ' ').toUpperCase() || 'N/A'}
              description={timeline.channels[0]?.reasoning || ''}
              color={CHANNEL_COLORS[timeline.channels[0]?.channel] || '#gray'}
            />
            <InsightCard
              title="Total Promotion Tasks"
              value={timeline.weeks.reduce((sum, week) => sum + week.tasks.length, 0).toString()}
              description={`Across ${timeline.totalWeeks} weeks leading to your event`}
              color="#22c55e"
            />
            <InsightCard
              title="Most Active Week"
              value={`Week ${weeklyTasksData.reduce((max, week) => week.tasks > max.tasks ? week : max, weeklyTasksData[0])?.name.split(' ')[1]}`}
              description="This week has the most promotional activities"
              color="#f97316"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface InsightCardProps {
  title: string;
  value: string;
  description: string;
  color: string;
}

function InsightCard({ title, value, description, color }: InsightCardProps) {
  return (
    <div className="p-4 border rounded-lg hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <h4 className="font-semibold text-sm text-gray-700">{title}</h4>
      </div>
      <div className="text-2xl font-bold mb-1" style={{ color }}>
        {value}
      </div>
      <p className="text-xs text-gray-600">{description}</p>
    </div>
  );
}
