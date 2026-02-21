// Utility functions for CRON expression conversion

export interface ScheduleOption {
  value: string;
  label: string;
  cron: string;
  description: string;
}

export const scheduleOptions: ScheduleOption[] = [
  {
    value: "never",
    label: "Never (Manual only)",
    cron: "",
    description: "Disable automatic scheduling"
  },
  {
    value: "hourly",
    label: "Every hour",
    cron: "0 * * * *",
    description: "Runs at the top of every hour"
  },
  {
    value: "3hours",
    label: "Every 3 hours",
    cron: "0 */3 * * *",
    description: "Runs every 3 hours"
  },
  {
    value: "6hours",
    label: "Every 6 hours",
    cron: "0 */6 * * *",
    description: "Runs every 6 hours (4 times per day)"
  },
  {
    value: "8hours",
    label: "Every 8 hours",
    cron: "0 */8 * * *",
    description: "Runs every 8 hours (3 times per day)"
  },
  {
    value: "12hours",
    label: "Every 12 hours",
    cron: "0 */12 * * *",
    description: "Runs twice per day"
  },
  {
    value: "daily",
    label: "Daily",
    cron: "0 6 * * *",
    description: "Runs once per day at 6:00 AM"
  },
  {
    value: "daily-evening",
    label: "Daily (Evening)",
    cron: "0 18 * * *",
    description: "Runs once per day at 6:00 PM"
  },
  {
    value: "weekly",
    label: "Weekly",
    cron: "0 6 * * 1",
    description: "Runs every Monday at 6:00 AM"
  },
  {
    value: "monthly",
    label: "Monthly",
    cron: "0 6 1 * *",
    description: "Runs on the 1st of each month at 6:00 AM"
  }
];

export function cronToFriendly(cronExpression: string): string {
  if (!cronExpression || cronExpression.trim() === "") {
    return "Never (Manual only)";
  }

  const option = scheduleOptions.find(opt => opt.cron === cronExpression);
  if (option) {
    return option.label;
  }

  // Try to parse common patterns
  const parts = cronExpression.split(' ');
  if (parts.length === 5) {
    const minute = parts[0];
    const hour = parts[1]!;
    const day = parts[2];
    const month = parts[3];
    const weekday = parts[4]!;

    // Every X hours pattern: "0 */X * * *"
    if (minute === '0' && hour.startsWith('*/') && day === '*' && month === '*' && weekday === '*') {
      const hours = hour.slice(2);
      return `Every ${hours} hours`;
    }

    // Daily pattern: "0 X * * *"
    if (minute === '0' && !hour.includes('*') && day === '*' && month === '*' && weekday === '*') {
      const hourNum = parseInt(hour);
      const time = hourNum === 0 ? '12:00 AM' :
                   hourNum < 12 ? `${hourNum}:00 AM` :
                   hourNum === 12 ? '12:00 PM' :
                   `${hourNum - 12}:00 PM`;
      return `Daily at ${time}`;
    }

    // Weekly pattern: "0 X * * Y"
    if (minute === '0' && !hour.includes('*') && day === '*' && month === '*' && !weekday.includes('*')) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = days[parseInt(weekday)] || 'Unknown';
      const hourNum = parseInt(hour);
      const time = hourNum === 0 ? '12:00 AM' :
                   hourNum < 12 ? `${hourNum}:00 AM` :
                   hourNum === 12 ? '12:00 PM' :
                   `${hourNum - 12}:00 PM`;
      return `Weekly on ${dayName} at ${time}`;
    }
  }

  return `Custom: ${cronExpression}`;
}

export function friendlyToCron(friendlyValue: string): string {
  const option = scheduleOptions.find(opt => opt.value === friendlyValue);
  return option ? option.cron : friendlyValue;
}

export function getNextRunTime(cronExpression: string): Date | null {
  if (!cronExpression || cronExpression.trim() === "") {
    return null;
  }

  // Simple calculation for common patterns
  // For production, you'd want to use a proper cron parser library
  const now = new Date();
  const parts = cronExpression.split(' ');
  
  if (parts.length === 5) {
    const minute = parts[0];
    const hour = parts[1]!;
    const day = parts[2];
    const month = parts[3];
    const weekday = parts[4];

    // Every X hours pattern: "0 */X * * *"
    if (minute === '0' && hour.startsWith('*/') && day === '*' && month === '*' && weekday === '*') {
      const hours = parseInt(hour.slice(2));
      const nextRun = new Date(now);
      nextRun.setMinutes(0, 0, 0);
      nextRun.setHours(nextRun.getHours() + hours);
      return nextRun;
    }

    // Daily pattern: "0 X * * *"
    if (minute === '0' && !hour.includes('*') && day === '*' && month === '*' && weekday === '*') {
      const targetHour = parseInt(hour);
      const nextRun = new Date(now);
      nextRun.setHours(targetHour, 0, 0, 0);
      
      // If time has passed today, set for tomorrow
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      return nextRun;
    }
  }

  // Fallback: assume hourly for unknown patterns
  const nextRun = new Date(now);
  nextRun.setHours(nextRun.getHours() + 1);
  nextRun.setMinutes(0, 0, 0);
  return nextRun;
}
