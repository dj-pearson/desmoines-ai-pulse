/**
 * Event Promotion Timeline Generator - Core Logic
 * Generates customized 8-week promotion timelines based on event characteristics
 */

import { subWeeks } from 'date-fns';
import type {
  EventFormData,
  PromotionTimeline,
  WeeklyMilestone,
  TimelineTask,
  ChannelRecommendation,
  BudgetAllocation,
} from '@/types/event-promotion';

/**
 * Generate a complete promotion timeline based on event data
 */
export function generatePromotionTimeline(
  eventData: EventFormData,
  unlocked: boolean = false
): PromotionTimeline {
  const totalWeeks = unlocked ? 8 : 4;
  const weeks: WeeklyMilestone[] = [];
  const startDate = subWeeks(eventData.eventDate, totalWeeks);

  for (let week = 1; week <= totalWeeks; week++) {
    const daysOut = (totalWeeks - week + 1) * 7;
    weeks.push(generateWeeklyMilestone(week, daysOut, eventData));
  }

  return {
    eventData,
    weeks,
    channels: generateChannelRecommendations(eventData),
    budget: generateBudgetAllocation(eventData),
    totalWeeks,
    startDate,
    unlocked,
  };
}

/**
 * Generate recommendations for promotion channels
 */
function generateChannelRecommendations(
  eventData: EventFormData
): ChannelRecommendation[] {
  const { eventType, budget, expectedAttendance } = eventData;
  const recommendations: ChannelRecommendation[] = [];

  // Base recommendations for all events
  recommendations.push({
    channel: 'social',
    priority: 1,
    budgetAllocation: 30,
    reasoning: 'Most cost-effective reach for Des Moines audiences',
    postingFrequency: '3-5 times per week',
    platforms: ['Facebook', 'Instagram', 'X/Twitter'],
  });

  recommendations.push({
    channel: 'email',
    priority: 2,
    budgetAllocation: 15,
    reasoning: 'Direct connection with interested attendees',
    postingFrequency: '1-2 times per week',
  });

  // Adjust based on event type
  if (eventType === 'community' || eventType === 'fundraiser') {
    recommendations.push({
      channel: 'partnerships',
      priority: 2,
      budgetAllocation: 25,
      reasoning: 'Local partnerships amplify community events',
      postingFrequency: 'Throughout campaign',
    });
  }

  if (eventType === 'concert' || eventType === 'festival') {
    recommendations.push({
      channel: 'paid-ads',
      priority: 3,
      budgetAllocation: 20,
      reasoning: 'Entertainment events benefit from targeted ads',
      postingFrequency: 'Continuous',
    });
  }

  // Budget considerations
  if (budget === '$0') {
    recommendations.push({
      channel: 'community',
      priority: 1,
      budgetAllocation: 40,
      reasoning: 'Focus on free community channels',
      postingFrequency: 'Daily',
    });
  } else if (budget === '$1000+') {
    recommendations.push({
      channel: 'radio',
      priority: 3,
      budgetAllocation: 15,
      reasoning: 'Budget allows for traditional media',
      postingFrequency: '1-2 spots per day',
    });
    recommendations.push({
      channel: 'print',
      priority: 4,
      budgetAllocation: 10,
      reasoning: 'Print ads for established events',
      postingFrequency: 'Weekly',
    });
  }

  // Attendance size adjustments
  if (expectedAttendance >= 500) {
    recommendations.push({
      channel: 'seo',
      priority: 2,
      budgetAllocation: 15,
      reasoning: 'Large events need organic search visibility',
      postingFrequency: 'Ongoing optimization',
    });
  }

  return recommendations.sort((a, b) => a.priority - b.priority);
}

/**
 * Generate budget allocation recommendations
 */
function generateBudgetAllocation(eventData: EventFormData): BudgetAllocation[] {
  const { budget } = eventData;
  const allocations: BudgetAllocation[] = [];

  const budgetMap: Record<typeof budget, number> = {
    '$0': 0,
    '$0-$100': 75,
    '$100-$500': 300,
    '$500-$1000': 750,
    '$1000+': 2000,
  };

  const totalBudget = budgetMap[budget];

  if (totalBudget === 0) {
    return [
      {
        channel: 'social',
        amount: 0,
        percentage: 40,
        description: 'Organic social media (time investment)',
      },
      {
        channel: 'community',
        amount: 0,
        percentage: 30,
        description: 'Community boards, local groups',
      },
      {
        channel: 'email',
        amount: 0,
        percentage: 20,
        description: 'Direct email outreach',
      },
      {
        channel: 'partnerships',
        amount: 0,
        percentage: 10,
        description: 'Partner cross-promotion',
      },
    ];
  }

  // Paid budget allocation
  allocations.push({
    channel: 'social',
    amount: Math.round(totalBudget * 0.35),
    percentage: 35,
    description: 'Facebook & Instagram ads',
  });

  allocations.push({
    channel: 'paid-ads',
    amount: Math.round(totalBudget * 0.25),
    percentage: 25,
    description: 'Google Ads, display advertising',
  });

  allocations.push({
    channel: 'email',
    amount: Math.round(totalBudget * 0.15),
    percentage: 15,
    description: 'Email marketing platform',
  });

  allocations.push({
    channel: 'partnerships',
    amount: Math.round(totalBudget * 0.15),
    percentage: 15,
    description: 'Sponsored posts, influencers',
  });

  allocations.push({
    channel: 'print',
    amount: Math.round(totalBudget * 0.10),
    percentage: 10,
    description: 'Local magazines, flyers',
  });

  return allocations;
}

/**
 * Generate tasks for a specific week
 */
function generateWeeklyMilestone(
  week: number,
  daysOut: number,
  eventData: EventFormData
): WeeklyMilestone {
  const { eventType, budget } = eventData;
  const tasks: TimelineTask[] = [];

  // Week 8 (56 days out) - Foundation
  if (week === 1) {
    tasks.push({
      id: `w${week}-1`,
      week,
      daysOut,
      title: 'Create event hashtag and branding',
      description:
        'Develop a unique, memorable hashtag. Create visual brand identity (colors, logo if needed).',
      channel: 'social',
      completed: false,
      priority: 'high',
      estimatedTime: '2-3 hours',
    });
    tasks.push({
      id: `w${week}-2`,
      week,
      daysOut,
      title: 'Set up event on DesMoinesInsider.com',
      description:
        'List your event to start building early awareness. Free listing gets you in front of 50K+ locals.',
      channel: 'partnerships',
      completed: false,
      priority: 'high',
      estimatedTime: '30 minutes',
    });
    tasks.push({
      id: `w${week}-3`,
      week,
      daysOut,
      title: 'Build email list landing page',
      description:
        'Create a simple landing page where interested people can sign up for event updates.',
      channel: 'email',
      completed: false,
      priority: 'medium',
      estimatedTime: '3-4 hours',
    });
    tasks.push({
      id: `w${week}-4`,
      week,
      daysOut,
      title: 'Identify 10 local partners for cross-promotion',
      description:
        'List complementary businesses, venues, or organizations that could help promote.',
      channel: 'partnerships',
      completed: false,
      priority: 'medium',
      estimatedTime: '1-2 hours',
    });
  }

  // Week 7 (49 days out) - Early Awareness
  if (week === 2) {
    tasks.push({
      id: `w${week}-1`,
      week,
      daysOut,
      title: 'Launch social media teaser campaign',
      description:
        'Post 3-4 teaser images/videos revealing event details gradually. Use your hashtag.',
      channel: 'social',
      completed: false,
      priority: 'high',
      estimatedTime: '4-5 hours',
    });
    tasks.push({
      id: `w${week}-2`,
      week,
      daysOut,
      title: 'Reach out to local media',
      description:
        'Contact Des Moines Register, Cityview, local blogs. Send press release.',
      channel: 'partnerships',
      completed: false,
      priority: 'medium',
      estimatedTime: '2-3 hours',
    });
    tasks.push({
      id: `w${week}-3`,
      week,
      daysOut,
      title: 'Create event on Facebook & Eventbrite',
      description:
        'Set up official event pages where people can RSVP and share.',
      channel: 'social',
      completed: false,
      priority: 'high',
      estimatedTime: '1 hour',
    });
    if (budget !== '$0') {
      tasks.push({
        id: `w${week}-4`,
        week,
        daysOut,
        title: 'Design and print initial flyers',
        description:
          'Create eye-catching flyers for strategic placement around Des Moines.',
        channel: 'print',
        completed: false,
        priority: 'low',
        estimatedTime: '3-4 hours',
      });
    }
  }

  // Week 6 (42 days out) - Community Engagement
  if (week === 3) {
    tasks.push({
      id: `w${week}-1`,
      week,
      daysOut,
      title: 'Post in Des Moines community groups',
      description:
        'Share in relevant Facebook groups, Reddit r/desmoines, Nextdoor neighborhoods.',
      channel: 'community',
      completed: false,
      priority: 'high',
      estimatedTime: '1-2 hours',
    });
    tasks.push({
      id: `w${week}-2`,
      week,
      daysOut,
      title: 'Send first email blast to your list',
      description:
        'Announce the event with early bird pricing or exclusive perks for subscribers.',
      channel: 'email',
      completed: false,
      priority: 'high',
      estimatedTime: '2-3 hours',
    });
    tasks.push({
      id: `w${week}-3`,
      week,
      daysOut,
      title: 'Create shareable content (infographic, video)',
      description:
        'Design content that attendees will want to share with their networks.',
      channel: 'social',
      completed: false,
      priority: 'medium',
      estimatedTime: '4-6 hours',
    });
    tasks.push({
      id: `w${week}-4`,
      week,
      daysOut,
      title: 'Secure 3-5 partner commitments',
      description:
        'Get confirmed cross-promotion agreements with local businesses.',
      channel: 'partnerships',
      completed: false,
      priority: 'medium',
      estimatedTime: '2-3 hours',
    });
  }

  // Week 5 (35 days out) - Momentum Building
  if (week === 4) {
    tasks.push({
      id: `w${week}-1`,
      week,
      daysOut,
      title: 'Launch paid social media ads',
      description:
        'Start Facebook/Instagram ads targeting Des Moines area with your event.',
      channel: 'paid-ads',
      completed: false,
      priority: budget === '$0' ? 'low' : 'high',
      estimatedTime: '3-4 hours',
    });
    tasks.push({
      id: `w${week}-2`,
      week,
      daysOut,
      title: 'Create "Why You Should Attend" blog post',
      description:
        'Write compelling content highlighting unique aspects of your event.',
      channel: 'seo',
      completed: false,
      priority: 'medium',
      estimatedTime: '2-3 hours',
    });
    tasks.push({
      id: `w${week}-3`,
      week,
      daysOut,
      title: 'Host Instagram/Facebook Live Q&A',
      description:
        'Go live to answer questions, show behind-the-scenes preparation.',
      channel: 'social',
      completed: false,
      priority: 'medium',
      estimatedTime: '1 hour',
    });
    tasks.push({
      id: `w${week}-4`,
      week,
      daysOut,
      title: 'Distribute flyers to 20+ high-traffic locations',
      description:
        'Coffee shops, libraries, community centers, gyms in Des Moines.',
      channel: 'community',
      completed: false,
      priority: 'medium',
      estimatedTime: '3-4 hours',
    });
  }

  // Week 4 (28 days out) - Amplification
  if (week === 5) {
    tasks.push({
      id: `w${week}-1`,
      week,
      daysOut,
      title: 'Send second email with social proof',
      description:
        'Share testimonials, confirmed attendees, or special guests.',
      channel: 'email',
      completed: false,
      priority: 'high',
      estimatedTime: '2 hours',
    });
    tasks.push({
      id: `w${week}-2`,
      week,
      daysOut,
      title: 'Run social media contest/giveaway',
      description:
        'Boost engagement with a ticket giveaway requiring shares/tags.',
      channel: 'social',
      completed: false,
      priority: 'high',
      estimatedTime: '3-4 hours',
    });
    tasks.push({
      id: `w${week}-3`,
      week,
      daysOut,
      title: 'Upgrade to Featured Event on DesMoinesInsider',
      description:
        'Boost listing to reach 3x more people with priority placement.',
      channel: 'partnerships',
      completed: false,
      priority: 'high',
      estimatedTime: '15 minutes',
    });
    tasks.push({
      id: `w${week}-4`,
      week,
      daysOut,
      title: 'Engage local influencers',
      description:
        'Send comp tickets to Des Moines micro-influencers in exchange for promotion.',
      channel: 'partnerships',
      completed: false,
      priority: 'medium',
      estimatedTime: '2-3 hours',
    });
  }

  // Week 3 (21 days out) - Urgency Creation
  if (week === 6) {
    tasks.push({
      id: `w${week}-1`,
      week,
      daysOut,
      title: 'Announce limited-time offer or early bird deadline',
      description:
        'Create urgency with expiring discount or exclusive perk.',
      channel: 'social',
      completed: false,
      priority: 'high',
      estimatedTime: '1-2 hours',
    });
    tasks.push({
      id: `w${week}-2`,
      week,
      daysOut,
      title: 'Post daily countdown on social media',
      description:
        'Start "3 weeks until [event]" countdown posts with new info each day.',
      channel: 'social',
      completed: false,
      priority: 'high',
      estimatedTime: '30 min/day',
    });
    tasks.push({
      id: `w${week}-3`,
      week,
      daysOut,
      title: 'Send targeted email to inactive subscribers',
      description:
        'Re-engage people who signed up but haven\'t purchased tickets.',
      channel: 'email',
      completed: false,
      priority: 'medium',
      estimatedTime: '1-2 hours',
    });
    tasks.push({
      id: `w${week}-4`,
      week,
      daysOut,
      title: 'Secure media coverage',
      description:
        'Follow up with journalists, schedule on-air interviews if possible.',
      channel: 'partnerships',
      completed: false,
      priority: 'medium',
      estimatedTime: '2-3 hours',
    });
  }

  // Week 2 (14 days out) - Final Push
  if (week === 7) {
    tasks.push({
      id: `w${week}-1`,
      week,
      daysOut,
      title: 'Launch "Last Chance" email campaign',
      description:
        'Send urgent email highlighting limited availability.',
      channel: 'email',
      completed: false,
      priority: 'high',
      estimatedTime: '2 hours',
    });
    tasks.push({
      id: `w${week}-2`,
      week,
      daysOut,
      title: 'Increase social ad budget 2x',
      description:
        'Double down on best-performing ads for final push.',
      channel: 'paid-ads',
      completed: false,
      priority: budget === '$0' ? 'low' : 'high',
      estimatedTime: '1 hour',
    });
    tasks.push({
      id: `w${week}-3`,
      week,
      daysOut,
      title: 'Share attendee testimonials and excitement',
      description:
        'Repost attendee content, share their excitement about coming.',
      channel: 'social',
      completed: false,
      priority: 'high',
      estimatedTime: '1 hour/day',
    });
    tasks.push({
      id: `w${week}-4`,
      week,
      daysOut,
      title: 'Post "What to Expect" guide',
      description:
        'Create detailed attendee guide: parking, schedule, what to bring.',
      channel: 'social',
      completed: false,
      priority: 'medium',
      estimatedTime: '2-3 hours',
    });
  }

  // Week 1 (7 days out) - Event Week
  if (week === 8) {
    tasks.push({
      id: `w${week}-1`,
      week,
      daysOut,
      title: 'Daily social media reminders',
      description:
        'Post 2-3x per day with countdown, last-minute details, excitement builders.',
      channel: 'social',
      completed: false,
      priority: 'high',
      estimatedTime: '1-2 hours/day',
    });
    tasks.push({
      id: `w${week}-2`,
      week,
      daysOut,
      title: 'Send final reminder email (2 days before)',
      description:
        'Include all essential info: time, location, parking, what to bring.',
      channel: 'email',
      completed: false,
      priority: 'high',
      estimatedTime: '1-2 hours',
    });
    tasks.push({
      id: `w${week}-3`,
      week,
      daysOut,
      title: 'Create event day social media plan',
      description:
        'Pre-schedule posts, prepare Stories, set up live stream if applicable.',
      channel: 'social',
      completed: false,
      priority: 'high',
      estimatedTime: '2-3 hours',
    });
    tasks.push({
      id: `w${week}-4`,
      week,
      daysOut,
      title: 'Prepare attendee engagement activities',
      description:
        'Photo booth, social media contest, branded hashtag displays.',
      channel: 'social',
      completed: false,
      priority: 'medium',
      estimatedTime: '3-4 hours',
    });
    tasks.push({
      id: `w${week}-5`,
      week,
      daysOut,
      title: 'Send day-of email (morning of event)',
      description:
        'Final enthusiasm builder with real-time info and last-minute tips.',
      channel: 'email',
      completed: false,
      priority: 'high',
      estimatedTime: '30 minutes',
    });
  }

  // Determine ticket sales goal based on expected attendance
  let ticketSalesGoal = '';
  if (week === 1) ticketSalesGoal = '5% of expected attendance';
  if (week === 2) ticketSalesGoal = '10% of expected attendance';
  if (week === 3) ticketSalesGoal = '20% of expected attendance';
  if (week === 4) ticketSalesGoal = '35% of expected attendance';
  if (week === 5) ticketSalesGoal = '50% of expected attendance';
  if (week === 6) ticketSalesGoal = '65% of expected attendance';
  if (week === 7) ticketSalesGoal = '80% of expected attendance';
  if (week === 8) ticketSalesGoal = '100% - Sell out!';

  return {
    week,
    daysOut,
    title: getWeekTitle(week, daysOut),
    description: getWeekDescription(week, eventType),
    tasks,
    ticketSalesGoal,
  };
}

/**
 * Get title for each week
 */
function getWeekTitle(week: number, daysOut: number): string {
  const weekTitles: Record<number, string> = {
    1: '8 Weeks Out: Foundation & Planning',
    2: '7 Weeks Out: Early Awareness',
    3: '6 Weeks Out: Community Engagement',
    4: '5 Weeks Out: Momentum Building',
    5: '4 Weeks Out: Amplification',
    6: '3 Weeks Out: Urgency Creation',
    7: '2 Weeks Out: Final Push',
    8: '1 Week Out: Event Week Excitement',
  };
  return weekTitles[week] || `${daysOut} Days Out`;
}

/**
 * Get description for each week
 */
function getWeekDescription(week: number, _eventType: string): string {
  const descriptions: Record<number, string> = {
    1: 'Lay the groundwork for successful promotion. Create your brand identity, set up platforms, and identify key partners.',
    2: 'Start generating buzz and awareness. Let people know your event exists and get them excited.',
    3: 'Engage your local community and build momentum. Focus on relationship-building and word-of-mouth.',
    4: 'Accelerate your promotional efforts. Scale up what\'s working and explore new channels.',
    5: 'Amplify your reach through partnerships and paid promotion. Make your event impossible to miss.',
    6: 'Create urgency and FOMO. Emphasize limited availability and exclusive opportunities.',
    7: 'Final push to convert interest into attendance. Remove any barriers to buying tickets.',
    8: 'Build maximum excitement for event week. Keep attendees engaged and handle last-minute details.',
  };
  return descriptions[week] || 'Execute your promotional strategy for this phase.';
}
