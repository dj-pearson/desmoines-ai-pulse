/**
 * Event Promotion Planner - Wizard Form Component
 * Step-by-step form to collect event data
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import type { EventFormData, EventType, BudgetRange, SocialFollowing } from '@/types/event-promotion';

const formSchema = z.object({
  eventType: z.enum(['concert', 'festival', 'fundraiser', 'sports', 'community', 'business', 'family']),
  eventDate: z.date({
    required_error: 'Please select an event date',
  }),
  expectedAttendance: z.number().min(25).max(5000),
  budget: z.enum(['$0', '$0-$100', '$100-$500', '$500-$1000', '$1000+']),
  socialFollowing: z.enum(['0-500', '500-2K', '2K-10K', '10K+']),
});

interface WizardFormProps {
  onComplete: (data: EventFormData) => void;
  onStepChange?: (step: number) => void;
}

const EVENT_TYPE_OPTIONS: { value: EventType; label: string; description: string }[] = [
  { value: 'concert', label: 'Concert', description: 'Music performances and shows' },
  { value: 'festival', label: 'Festival', description: 'Multi-day celebrations and gatherings' },
  { value: 'fundraiser', label: 'Fundraiser', description: 'Charity and nonprofit events' },
  { value: 'sports', label: 'Sports', description: 'Athletic competitions and games' },
  { value: 'community', label: 'Community', description: 'Local neighborhood events' },
  { value: 'business', label: 'Business', description: 'Professional networking and conferences' },
  { value: 'family', label: 'Family', description: 'Kid-friendly and family activities' },
];

const ATTENDANCE_MARKS = [25, 50, 100, 250, 500, 1000, 5000];

export function WizardForm({ onComplete, onStepChange }: WizardFormProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 5;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      expectedAttendance: 100,
    },
  });

  const goToStep = (step: number) => {
    setCurrentStep(step);
    onStepChange?.(step);
  };

  const nextStep = () => {
    if (currentStep < totalSteps) {
      goToStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      goToStep(currentStep - 1);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    const formData: EventFormData = {
      ...values,
    };
    onComplete(formData);
  };

  const progress = (currentStep / totalSteps) * 100;

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">
            Step {currentStep} of {totalSteps}
          </span>
          <span className="text-sm text-gray-500">{Math.round(progress)}% complete</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Step 1: Event Type */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div>
                <h2 className="text-2xl font-bold mb-2">What type of event are you hosting?</h2>
                <p className="text-gray-600">This helps us customize your promotion strategy.</p>
              </div>

              <FormField
                control={form.control}
                name="eventType"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {EVENT_TYPE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              field.onChange(option.value);
                              setTimeout(nextStep, 300);
                            }}
                            className={cn(
                              'p-4 border-2 rounded-lg text-left transition-all hover:border-primary hover:shadow-md',
                              field.value === option.value
                                ? 'border-primary bg-primary/5'
                                : 'border-gray-200'
                            )}
                          >
                            <div className="font-semibold text-lg mb-1">{option.label}</div>
                            <div className="text-sm text-gray-600">{option.description}</div>
                          </button>
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          {/* Step 2: Event Date */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div>
                <h2 className="text-2xl font-bold mb-2">When is your event?</h2>
                <p className="text-gray-600">We'll create a timeline counting down to this date.</p>
              </div>

              <FormField
                control={form.control}
                name="eventDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Event Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            field.onChange(date);
                            if (date) {
                              setTimeout(nextStep, 300);
                            }
                          }}
                          disabled={(date) => date < new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      Select a date at least 4 weeks from now for best results.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={prevStep} className="flex-1">
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Expected Attendance */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div>
                <h2 className="text-2xl font-bold mb-2">How many people do you expect?</h2>
                <p className="text-gray-600">Your target attendance helps us scale the promotion plan.</p>
              </div>

              <FormField
                control={form.control}
                name="expectedAttendance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expected Attendance</FormLabel>
                    <FormControl>
                      <div className="space-y-4">
                        <div className="text-4xl font-bold text-primary text-center py-6">
                          {field.value}
                          {field.value >= 5000 && '+'}
                        </div>
                        <Slider
                          min={0}
                          max={6}
                          step={1}
                          value={[ATTENDANCE_MARKS.indexOf(field.value) !== -1 ? ATTENDANCE_MARKS.indexOf(field.value) : 2]}
                          onValueChange={(vals) => {
                            field.onChange(ATTENDANCE_MARKS[vals[0]]);
                          }}
                          className="py-4"
                        />
                        <div className="flex justify-between text-xs text-gray-500">
                          {ATTENDANCE_MARKS.map((mark) => (
                            <span key={mark}>{mark >= 1000 ? `${mark / 1000}K+` : mark}</span>
                          ))}
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={prevStep} className="flex-1">
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button type="button" onClick={nextStep} className="flex-1">
                  Next
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Budget */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div>
                <h2 className="text-2xl font-bold mb-2">What's your promotion budget?</h2>
                <p className="text-gray-600">We'll optimize recommendations for your budget range.</p>
              </div>

              <FormField
                control={form.control}
                name="budget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Promotion Budget</FormLabel>
                    <Select onValueChange={(value) => {
                      field.onChange(value);
                      setTimeout(nextStep, 300);
                    }} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select your budget range" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="$0">$0 - No budget (organic only)</SelectItem>
                        <SelectItem value="$0-$100">$0 - $100</SelectItem>
                        <SelectItem value="$100-$500">$100 - $500</SelectItem>
                        <SelectItem value="$500-$1000">$500 - $1,000</SelectItem>
                        <SelectItem value="$1000+">$1,000+</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Don't worry - we'll show you free strategies too!
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={prevStep} className="flex-1">
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: Social Following */}
          {currentStep === 5 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div>
                <h2 className="text-2xl font-bold mb-2">What's your current social media reach?</h2>
                <p className="text-gray-600">This helps us tailor the social media strategy.</p>
              </div>

              <FormField
                control={form.control}
                name="socialFollowing"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Social Media Following</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select your following size" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="0-500">0 - 500 followers</SelectItem>
                        <SelectItem value="500-2K">500 - 2,000 followers</SelectItem>
                        <SelectItem value="2K-10K">2,000 - 10,000 followers</SelectItem>
                        <SelectItem value="10K+">10,000+ followers</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Combined total across all platforms (Facebook, Instagram, X, etc.)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={prevStep} className="flex-1">
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button type="submit" className="flex-1 bg-gradient-to-r from-primary to-blue-600">
                  Generate My Timeline 🚀
                </Button>
              </div>
            </div>
          )}
        </form>
      </Form>

      {/* Step Indicators */}
      <div className="flex justify-center gap-2 mt-8">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => goToStep(index + 1)}
            className={cn(
              'w-2 h-2 rounded-full transition-all',
              currentStep === index + 1 ? 'bg-primary w-6' : 'bg-gray-300 hover:bg-gray-400'
            )}
            aria-label={`Go to step ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
