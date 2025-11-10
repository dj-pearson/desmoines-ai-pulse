/**
 * Event Promotion Planner - Email Capture Modal
 * Captures user email to unlock full timeline and enable nurture sequence
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Mail, Gift, FileText, Bell, Zap, Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { EventFormData, EmailCaptureData } from '@/types/event-promotion';

const formSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  eventName: z.string().optional(),
  organizationName: z.string().optional(),
  sendReminders: z.boolean().default(true),
});

interface EmailCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: EmailCaptureData) => void;
  eventData: EventFormData;
}

export function EmailCaptureModal({ isOpen, onClose, onSubmit, eventData }: EmailCaptureModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sendReminders: true,
    },
  });

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const captureData: EmailCaptureData = {
        email: values.email,
        eventName: values.eventName,
        organizationName: values.organizationName,
        eventType: eventData.eventType,
        eventDate: eventData.eventDate,
        sendReminders: values.sendReminders,
      };
      await onSubmit(captureData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-primary to-blue-600 rounded-full flex items-center justify-center">
              <Gift className="h-8 w-8 text-white" />
            </div>
          </div>
          <DialogTitle className="text-2xl text-center">Get Your Complete 8-Week Playbook</DialogTitle>
          <DialogDescription className="text-center text-base">
            Unlock the full timeline, downloadable PDF, and weekly email reminders
          </DialogDescription>
        </DialogHeader>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
          <BenefitCard
            icon={<FileText className="h-5 w-5" />}
            title="Full 8-Week Timeline"
            description="Get the complete detailed plan, not just 4 weeks"
          />
          <BenefitCard
            icon={<Download className="h-5 w-5" />}
            title="Downloadable PDF"
            description="Professional playbook you can print and share"
          />
          <BenefitCard
            icon={<Bell className="h-5 w-5" />}
            title="Weekly Reminders"
            description="Email alerts keeping you on track to event day"
          />
          <BenefitCard
            icon={<Zap className="h-5 w-5" />}
            title="Content Templates"
            description="Ready-to-use social posts and email templates"
          />
        </div>

        {/* Social Proof */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-blue-600">423 organizers</Badge>
            <span className="text-sm text-gray-700">joined this week</span>
          </div>
          <p className="text-sm text-gray-600">
            "This timeline helped us sell out our fundraiser 2 weeks early!" - Sarah M., Community Organizer
          </p>
        </div>

        {/* Form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="you@example.com"
                      type="email"
                      {...field}
                      className="h-12"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="eventName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Name (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Summer Music Festival" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="organizationName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Your Organization" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="sendReminders"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="font-normal">
                      Send me weekly reminders with this timeline
                    </FormLabel>
                    <p className="text-sm text-gray-500">
                      Get email reminders at each milestone to stay on track
                    </p>
                  </div>
                </FormItem>
              )}
            />

            <Button
              type="submit"
              size="lg"
              className="w-full h-14 text-lg bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                  Unlocking...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-5 w-5" />
                  Unlock My Complete Timeline
                </>
              )}
            </Button>

            <p className="text-xs text-center text-gray-500">
              We respect your privacy. Unsubscribe anytime. By continuing, you agree to receive emails about your event promotion and occasional updates about DesMoinesInsider.com.
            </p>
          </form>
        </Form>

        {/* Additional CTA */}
        <div className="border-t pt-4 mt-4">
          <p className="text-sm text-center text-gray-600 mb-3">
            Want even more reach for your event?
          </p>
          <Button variant="outline" className="w-full" asChild>
            <a href="/advertise" target="_blank" rel="noopener noreferrer">
              List Your Event on DesMoinesInsider - Free →
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface BenefitCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function BenefitCard({ icon, title, description }: BenefitCardProps) {
  return (
    <div className="flex gap-3 p-3 border rounded-lg hover:shadow-md transition-shadow">
      <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
        {icon}
      </div>
      <div>
        <h4 className="font-semibold text-sm mb-1">{title}</h4>
        <p className="text-xs text-gray-600">{description}</p>
      </div>
    </div>
  );
}
