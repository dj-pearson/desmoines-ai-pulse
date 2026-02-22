/**
 * PDF Playbook Generator for Event Promotion Timeline
 */

import jsPDF from 'jspdf';
import { format } from 'date-fns';
import type { PromotionTimeline } from '@/types/event-promotion';

/**
 * Generate a professional PDF playbook from timeline data
 */
export async function generatePDFPlaybook(timeline: PromotionTimeline): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let yPos = margin;

  // Brand colors
  const primaryColor: [number, number, number] = [59, 130, 246]; // Blue
  const secondaryColor: [number, number, number] = [100, 100, 100]; // Gray
  const accentColor: [number, number, number] = [34, 197, 94]; // Green

  // Helper function to add a new page if needed
  const checkPageBreak = (spaceNeeded: number) => {
    if (yPos + spaceNeeded > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };

  // Cover Page
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 80, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(32);
  doc.setFont('helvetica', 'bold');
  doc.text('Event Promotion', pageWidth / 2, 35, { align: 'center' });
  doc.text('Playbook', pageWidth / 2, 50, { align: 'center' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('Your 8-Week Roadmap to Success', pageWidth / 2, 65, { align: 'center' });

  // Event Details Box
  yPos = 100;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Your Event Details', margin, yPos);

  yPos += 10;
  doc.setFillColor(240, 240, 240);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 50, 3, 3, 'F');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Event Type: ${timeline.eventData.eventType.toUpperCase()}`, margin + 10, yPos + 12);
  doc.text(`Event Date: ${format(timeline.eventData.eventDate, 'MMMM dd, yyyy')}`, margin + 10, yPos + 22);
  doc.text(`Expected Attendance: ${timeline.eventData.expectedAttendance}`, margin + 10, yPos + 32);
  doc.text(`Budget: ${timeline.eventData.budget}`, margin + 10, yPos + 42);

  // Branding
  yPos += 65;
  doc.setFontSize(9);
  doc.setTextColor(...secondaryColor);
  doc.text('Created by DesMoinesInsider.com - Your Event Success Partner', pageWidth / 2, yPos, { align: 'center' });

  // Table of Contents
  doc.addPage();
  yPos = margin;

  doc.setTextColor(...primaryColor);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('Table of Contents', margin, yPos);

  yPos += 15;
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');

  const tocItems = [
    'Week 8: Foundation & Planning',
    'Week 7: Early Awareness',
    'Week 6: Community Engagement',
    'Week 5: Momentum Building',
    'Week 4: Amplification',
    'Week 3: Urgency Creation',
    'Week 2: Final Push',
    'Week 1: Event Week Excitement',
    'Budget Allocation Guide',
    'Channel Recommendations',
    'Post-Event Checklist',
  ];

  tocItems.forEach((item, index) => {
    doc.text(`${index + 1}. ${item}`, margin + 10, yPos);
    doc.text(`${index + 3}`, pageWidth - margin - 10, yPos, { align: 'right' });
    yPos += 8;
  });

  // Weekly Timeline Pages
  timeline.weeks.forEach((week, _weekIndex) => {
    doc.addPage();
    yPos = margin;

    // Week Header
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(week.title, margin, 20);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`${week.daysOut} days until your event`, margin, 30);

    // Week Description
    yPos = 55;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    const descLines = doc.splitTextToSize(week.description, pageWidth - 2 * margin);
    doc.text(descLines, margin, yPos);
    yPos += descLines.length * 6 + 10;

    // Ticket Sales Goal
    if (week.ticketSalesGoal) {
      doc.setFillColor(...accentColor);
      doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 12, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text(`🎯 Goal: ${week.ticketSalesGoal}`, margin + 5, yPos + 8);
      yPos += 20;
      doc.setTextColor(0, 0, 0);
    }

    // Tasks
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Tasks for This Week:', margin, yPos);
    yPos += 10;

    week.tasks.forEach((task, _taskIndex) => {
      checkPageBreak(40);

      // Task Box
      doc.setDrawColor(...secondaryColor);
      doc.setLineWidth(0.5);
      doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 35, 2, 2, 'S');

      // Checkbox
      doc.rect(margin + 5, yPos + 5, 5, 5, 'S');

      // Task Title
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(task.title, margin + 15, yPos + 9);

      // Task Description
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const taskDescLines = doc.splitTextToSize(task.description, pageWidth - 2 * margin - 20);
      doc.text(taskDescLines, margin + 15, yPos + 16);

      // Task Meta
      doc.setTextColor(...secondaryColor);
      doc.setFontSize(8);
      doc.text(`⏱️ ${task.estimatedTime}`, margin + 15, yPos + 30);
      doc.text(`📢 ${task.channel}`, pageWidth - margin - 40, yPos + 30);

      doc.setTextColor(0, 0, 0);
      yPos += 40;
    });

    // Week Footer
    yPos += 10;
    checkPageBreak(15);
    doc.setFontSize(9);
    doc.setTextColor(...secondaryColor);
    doc.text(
      '💡 Pro Tip: Check off tasks as you complete them and adjust timing based on your results.',
      margin,
      yPos
    );
  });

  // Budget Allocation Page
  doc.addPage();
  yPos = margin;

  doc.setTextColor(...primaryColor);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Budget Allocation Guide', margin, yPos);

  yPos += 15;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Recommended budget distribution across channels:', margin, yPos);

  yPos += 15;

  timeline.budget.forEach((allocation) => {
    checkPageBreak(25);

    // Channel Bar
    const barWidth = (pageWidth - 2 * margin - 60) * (allocation.percentage / 100);
    doc.setFillColor(...primaryColor);
    doc.roundedRect(margin + 60, yPos, barWidth, 10, 2, 2, 'F');

    // Labels
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(allocation.channel.toUpperCase(), margin, yPos + 7);
    doc.setFont('helvetica', 'normal');
    doc.text(`${allocation.percentage}%`, margin + 60 + barWidth + 5, yPos + 7);

    if (allocation.amount > 0) {
      doc.text(`($${allocation.amount})`, margin + 60 + barWidth + 20, yPos + 7);
    }

    yPos += 15;
    doc.setFontSize(9);
    doc.setTextColor(...secondaryColor);
    const descLines = doc.splitTextToSize(allocation.description, pageWidth - 2 * margin - 10);
    doc.text(descLines, margin + 10, yPos);
    yPos += descLines.length * 5 + 8;
    doc.setTextColor(0, 0, 0);
  });

  // Channel Recommendations Page
  doc.addPage();
  yPos = margin;

  doc.setTextColor(...primaryColor);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Channel Recommendations', margin, yPos);

  yPos += 15;

  timeline.channels.slice(0, 5).forEach((channel, _index) => {
    checkPageBreak(50);

    // Channel Box
    doc.setFillColor(240, 240, 240);
    doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 45, 3, 3, 'F');

    // Priority Badge
    doc.setFillColor(...accentColor);
    doc.circle(margin + 10, yPos + 10, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`#${channel.priority}`, margin + 10, yPos + 12, { align: 'center' });

    // Channel Name
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text(channel.channel.toUpperCase(), margin + 25, yPos + 12);

    // Reasoning
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const reasonLines = doc.splitTextToSize(channel.reasoning, pageWidth - 2 * margin - 30);
    doc.text(reasonLines, margin + 25, yPos + 20);

    // Frequency
    doc.setTextColor(...secondaryColor);
    doc.setFontSize(8);
    doc.text(`Frequency: ${channel.postingFrequency}`, margin + 25, yPos + 35);

    if (channel.platforms) {
      doc.text(`Platforms: ${channel.platforms.join(', ')}`, margin + 25, yPos + 40);
    }

    yPos += 52;
    doc.setTextColor(0, 0, 0);
  });

  // Post-Event Checklist
  doc.addPage();
  yPos = margin;

  doc.setTextColor(...primaryColor);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Post-Event Checklist', margin, yPos);

  yPos += 15;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Don\'t forget these important follow-up tasks:', margin, yPos);

  yPos += 15;

  const postEventTasks = [
    'Send thank-you email to all attendees within 24 hours',
    'Share event photos and highlights on social media',
    'Collect feedback through a quick survey',
    'Thank sponsors, partners, and volunteers publicly',
    'Analyze what worked and what didn\'t for next time',
    'Export attendee data for future event marketing',
    'Write a recap blog post or press release',
    'Start planning your next event while momentum is high',
  ];

  postEventTasks.forEach((task) => {
    checkPageBreak(12);
    doc.rect(margin + 5, yPos - 3, 5, 5, 'S');
    doc.text(task, margin + 15, yPos);
    yPos += 10;
  });

  // Final Page - CTA
  doc.addPage();
  yPos = margin + 40;

  doc.setFillColor(...primaryColor);
  doc.rect(0, 60, pageWidth, 80, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('Ready to Reach 50K+', pageWidth / 2, 85, { align: 'center' });
  doc.text('Des Moines Locals?', pageWidth / 2, 100, { align: 'center' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('List your event on DesMoinesInsider.com', pageWidth / 2, 120, { align: 'center' });

  doc.setFontSize(11);
  yPos = 160;
  doc.setTextColor(0, 0, 0);

  const benefits = [
    '✓ Free event listing reaches our 50K+ subscriber base',
    '✓ Automatic email distribution to interested locals',
    '✓ Featured event boost for maximum visibility',
    '✓ SEO-optimized event page with easy RSVP',
    '✓ Social media amplification',
    '✓ Analytics to track your event\'s reach',
  ];

  benefits.forEach((benefit) => {
    doc.text(benefit, pageWidth / 2, yPos, { align: 'center' });
    yPos += 10;
  });

  yPos += 15;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text('DesMoinesInsider.com/advertise', pageWidth / 2, yPos, { align: 'center' });

  yPos += 20;
  doc.setFontSize(10);
  doc.setTextColor(...secondaryColor);
  doc.setFont('helvetica', 'normal');
  doc.text('Questions? Email us at hello@desmoinesinsider.com', pageWidth / 2, yPos, { align: 'center' });

  // Generate filename
  const eventType = timeline.eventData.eventType;
  const date = format(timeline.eventData.eventDate, 'yyyy-MM-dd');
  const filename = `Event-Promotion-Playbook-${eventType}-${date}.pdf`;

  // Save the PDF
  doc.save(filename);
}

/**
 * Generate a quick preview PDF with limited content (for free tier)
 */
export async function generatePreviewPDF(_timeline: PromotionTimeline): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let yPos = margin;

  const primaryColor: [number, number, number] = [59, 130, 246];

  // Cover
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 60, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('Event Promotion Timeline', pageWidth / 2, 30, { align: 'center' });
  doc.text('4-Week Preview', pageWidth / 2, 45, { align: 'center' });

  yPos = 80;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.text('This is a preview of your promotion timeline.', margin, yPos);

  yPos += 10;
  doc.setFontSize(11);
  doc.text('Enter your email to unlock the full 8-week playbook with:', margin, yPos);

  yPos += 15;
  const benefits = [
    '✓ Complete 8-week detailed timeline',
    '✓ Week-by-week email reminders',
    '✓ Content templates library',
    '✓ Budget tracking spreadsheet',
  ];

  benefits.forEach((benefit) => {
    doc.text(benefit, margin + 10, yPos);
    yPos += 8;
  });

  yPos += 20;
  doc.setFillColor(...primaryColor);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 15, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Unlock Full Playbook at DesMoinesInsider.com', pageWidth / 2, yPos + 10, { align: 'center' });

  doc.save('Event-Promotion-Preview.pdf');
}
