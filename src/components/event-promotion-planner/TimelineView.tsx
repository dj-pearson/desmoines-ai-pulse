/**
 * Event Promotion Planner - Timeline View Component
 * Interactive calendar and list view of promotion timeline
 */

import { useState, useMemo } from 'react';
import { format, addDays } from 'date-fns';
import { Calendar, CheckCircle2, Circle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { PromotionTimeline, TimelineTask, WeeklyMilestone } from '@/types/event-promotion';

interface TimelineViewProps {
  timeline: PromotionTimeline;
  onTaskToggle?: (taskId: string) => void;
  completedTasks?: Set<string>;
}

const CHANNEL_COLORS: Record<string, string> = {
  social: 'bg-blue-500',
  email: 'bg-green-500',
  print: 'bg-purple-500',
  radio: 'bg-red-500',
  partnerships: 'bg-yellow-500',
  seo: 'bg-indigo-500',
  community: 'bg-pink-500',
  'paid-ads': 'bg-orange-500',
};

const CHANNEL_ICONS: Record<string, string> = {
  social: '📱',
  email: '✉️',
  print: '📰',
  radio: '📻',
  partnerships: '🤝',
  seo: '🔍',
  community: '👥',
  'paid-ads': '💰',
};

export function TimelineView({ timeline, onTaskToggle, completedTasks = new Set() }: TimelineViewProps) {
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set([1]));
  const [view, setView] = useState<'list' | 'calendar'>('list');

  const toggleWeek = (week: number) => {
    const newExpanded = new Set(expandedWeeks);
    if (newExpanded.has(week)) {
      newExpanded.delete(week);
    } else {
      newExpanded.add(week);
    }
    setExpandedWeeks(newExpanded);
  };

  const expandAll = () => {
    setExpandedWeeks(new Set(timeline.weeks.map((w) => w.week)));
  };

  const collapseAll = () => {
    setExpandedWeeks(new Set());
  };

  const totalTasks = useMemo(() => {
    return timeline.weeks.reduce((sum, week) => sum + week.tasks.length, 0);
  }, [timeline.weeks]);

  const completedCount = useMemo(() => {
    return Array.from(completedTasks).length;
  }, [completedTasks]);

  const progressPercentage = totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0;

  return (
    <div className="w-full space-y-6">
      {/* Header Stats */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">{timeline.totalWeeks}</div>
              <div className="text-sm text-gray-600">Weeks</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">{totalTasks}</div>
              <div className="text-sm text-gray-600">Total Tasks</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{completedCount}</div>
              <div className="text-sm text-gray-600">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{Math.round(progressPercentage)}%</div>
              <div className="text-sm text-gray-600">Progress</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* View Controls */}
      <div className="flex items-center justify-between">
        <Tabs value={view} onValueChange={(v) => setView(v as 'list' | 'calendar')} className="w-auto">
          <TabsList>
            <TabsTrigger value="list">📋 List View</TabsTrigger>
            <TabsTrigger value="calendar">📅 Calendar View</TabsTrigger>
          </TabsList>
        </Tabs>

        {view === 'list' && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={expandAll}>
              Expand All
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>
              Collapse All
            </Button>
          </div>
        )}
      </div>

      {/* List View */}
      {view === 'list' && (
        <div className="space-y-4">
          {timeline.weeks.map((week) => (
            <WeekCard
              key={week.week}
              week={week}
              isExpanded={expandedWeeks.has(week.week)}
              onToggle={() => toggleWeek(week.week)}
              onTaskToggle={onTaskToggle}
              completedTasks={completedTasks}
              eventDate={timeline.eventData.eventDate}
            />
          ))}
        </div>
      )}

      {/* Calendar View */}
      {view === 'calendar' && (
        <CalendarGrid
          timeline={timeline}
          onTaskToggle={onTaskToggle}
          completedTasks={completedTasks}
        />
      )}

      {/* Locked State Message (if not unlocked) */}
      {!timeline.unlocked && timeline.weeks.length === 4 && (
        <Card className="border-primary bg-primary/5">
          <CardContent className="pt-6 text-center">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-xl font-bold mb-2">Unlock Your Complete 8-Week Timeline</h3>
            <p className="text-gray-600 mb-4">
              You're viewing the first 4 weeks. Enter your email to unlock the full timeline, downloadable PDF, and weekly reminders.
            </p>
            <Button size="lg" className="bg-gradient-to-r from-primary to-blue-600">
              Unlock Full Timeline
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface WeekCardProps {
  week: WeeklyMilestone;
  isExpanded: boolean;
  onToggle: () => void;
  onTaskToggle?: (taskId: string) => void;
  completedTasks: Set<string>;
  eventDate: Date;
}

function WeekCard({ week, isExpanded, onToggle, onTaskToggle, completedTasks, eventDate }: WeekCardProps) {
  const completedCount = week.tasks.filter((t) => completedTasks.has(t.id)).length;
  const totalCount = week.tasks.length;
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const weekStartDate = addDays(eventDate, -week.daysOut);

  return (
    <Card className={cn('transition-all', isExpanded && 'ring-2 ring-primary/20')}>
      <CardHeader className="cursor-pointer" onClick={onToggle}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs">
                Week {week.week}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {week.daysOut} days out
              </Badge>
              <span className="text-xs text-gray-500">
                {format(weekStartDate, 'MMM dd, yyyy')}
              </span>
            </div>
            <CardTitle className="text-lg">{week.title}</CardTitle>
            <CardDescription className="mt-1">{week.description}</CardDescription>
            {week.ticketSalesGoal && (
              <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                <span>🎯</span>
                <span className="font-medium">Goal: {week.ticketSalesGoal}</span>
              </div>
            )}
          </div>
          <Button variant="ghost" size="sm">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        {/* Progress Bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span>
              {completedCount} of {totalCount} tasks completed
            </span>
            <span>{Math.round(progressPercentage)}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-3">
            {week.tasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                completed={completedTasks.has(task.id)}
                onToggle={() => onTaskToggle?.(task.id)}
              />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

interface TaskItemProps {
  task: TimelineTask;
  completed: boolean;
  onToggle?: () => void;
}

function TaskItem({ task, completed, onToggle }: TaskItemProps) {
  const channelColor = CHANNEL_COLORS[task.channel] || 'bg-gray-500';
  const channelIcon = CHANNEL_ICONS[task.channel] || '📢';

  return (
    <div
      className={cn(
        'border-2 rounded-lg p-4 transition-all hover:shadow-md',
        completed ? 'border-green-200 bg-green-50' : 'border-gray-200'
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox checked={completed} onCheckedChange={onToggle} className="mt-1" />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h4 className={cn('font-semibold', completed && 'line-through text-gray-500')}>
              {task.title}
            </h4>
            <Badge
              variant="secondary"
              className={cn(
                'text-xs shrink-0',
                task.priority === 'high' && 'bg-red-100 text-red-700',
                task.priority === 'medium' && 'bg-yellow-100 text-yellow-700',
                task.priority === 'low' && 'bg-blue-100 text-blue-700'
              )}
            >
              {task.priority}
            </Badge>
          </div>

          <p className={cn('text-sm text-gray-700 mb-3', completed && 'line-through text-gray-500')}>
            {task.description}
          </p>

          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
            <div className="flex items-center gap-1">
              <span>{channelIcon}</span>
              <span className="font-medium capitalize">{task.channel}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{task.estimatedTime}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CalendarGridProps {
  timeline: PromotionTimeline;
  onTaskToggle?: (taskId: string) => void;
  completedTasks: Set<string>;
}

function CalendarGrid({ timeline, onTaskToggle, completedTasks }: CalendarGridProps) {
  return (
    <ScrollArea className="w-full h-[600px]">
      <div className="space-y-2">
        {timeline.weeks.map((week) => {
          const weekStartDate = addDays(timeline.eventData.eventDate, -week.daysOut);
          const weekEndDate = addDays(weekStartDate, 6);

          return (
            <Card key={week.week}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{week.title}</CardTitle>
                    <CardDescription className="text-xs">
                      {format(weekStartDate, 'MMM dd')} - {format(weekEndDate, 'MMM dd, yyyy')}
                    </CardDescription>
                  </div>
                  <Badge>{week.tasks.length} tasks</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 7 }).map((_, dayIndex) => {
                    const date = addDays(weekStartDate, dayIndex);
                    const dayTasks = week.tasks.filter((_, i) => i % 7 === dayIndex).slice(0, 1);

                    return (
                      <div
                        key={dayIndex}
                        className="border rounded p-2 min-h-[80px] text-xs hover:bg-gray-50 transition-colors"
                      >
                        <div className="font-semibold text-gray-700 mb-1">
                          {format(date, 'EEE')}
                        </div>
                        <div className="text-gray-500 mb-2">{format(date, 'dd')}</div>
                        {dayTasks.map((task) => (
                          <div
                            key={task.id}
                            className={cn(
                              'text-[10px] p-1 rounded truncate',
                              completedTasks.has(task.id) ? 'bg-green-100' : 'bg-blue-100'
                            )}
                            title={task.title}
                          >
                            {CHANNEL_ICONS[task.channel]} {task.title}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ScrollArea>
  );
}
