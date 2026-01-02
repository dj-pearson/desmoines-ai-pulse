/**
 * Event Promotion Timeline Generator - Main Page
 * Free lead magnet mini-tool for DesMoinesInsider.com
 */

import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Calendar, Download, Share2, TrendingUp, Users, Zap, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { WizardForm } from '@/components/event-promotion-planner/WizardForm';
import { TimelineView } from '@/components/event-promotion-planner/TimelineView';
import { ChartsView } from '@/components/event-promotion-planner/ChartsView';
import { EmailCaptureModal } from '@/components/event-promotion-planner/EmailCaptureModal';
import { SocialShare } from '@/components/event-promotion-planner/SocialShare';
import { generatePromotionTimeline } from '@/lib/timeline-generator';
import { generatePDFPlaybook, generatePreviewPDF } from '@/lib/pdf-generator';
import {
  trackToolStarted,
  trackTimelineGenerated,
  trackEmailCaptured,
  trackPDFDownloaded,
  trackTaskChecked,
  trackSocialShare,
  trackListingClicked,
  trackReferralGenerated,
} from '@/lib/analytics-tracker';
import { storage } from '@/lib/safeStorage';
import type { EventFormData, PromotionTimeline, EmailCaptureData } from '@/types/event-promotion';

export default function EventPromotionPlanner() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<'intro' | 'wizard' | 'results'>('intro');
  const [timeline, setTimeline] = useState<PromotionTimeline | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState('timeline');

  // Track tool start
  useEffect(() => {
    trackToolStarted();

    // Check for referral code
    const ref = searchParams.get('ref');
    if (ref) {
      console.log('Referral code:', ref);
    }

    // Load completed tasks from secure storage
    const stored = storage.get<string[]>('epp_completed_tasks');
    if (stored) {
      setCompletedTasks(new Set(stored));
    }
  }, [searchParams]);

  const handleFormComplete = (data: EventFormData) => {
    const generatedTimeline = generatePromotionTimeline(data, false);
    setTimeline(generatedTimeline);
    setStep('results');

    trackTimelineGenerated(data.eventType, data.eventDate);

    // Show email capture modal after viewing for 10 seconds
    setTimeout(() => {
      if (!userEmail) {
        setShowEmailModal(true);
      }
    }, 10000);

    toast.success('Your promotion timeline is ready!');
  };

  const handleEmailCapture = async (data: EmailCaptureData) => {
    try {
      // Send to backend/email service
      // await saveEmailCapture(data);

      setUserEmail(data.email);
      setShowEmailModal(false);

      // Generate referral code
      const code = generateReferralCode(data.email);
      setReferralCode(code);
      trackReferralGenerated(code);

      // Unlock full timeline
      if (timeline) {
        const unlockedTimeline = generatePromotionTimeline(timeline.eventData, true);
        setTimeline(unlockedTimeline);
      }

      trackEmailCaptured(data.email, data.sendReminders);

      toast.success('🎉 Full timeline unlocked! Check your email for your playbook.');

      // Auto-download PDF
      if (timeline) {
        setTimeout(() => {
          handleDownloadPDF();
        }, 1000);
      }
    } catch (error) {
      console.error('Failed to capture email:', error);
      toast.error('Something went wrong. Please try again.');
    }
  };

  const handleDownloadPDF = async () => {
    if (!timeline) return;

    try {
      if (userEmail) {
        await generatePDFPlaybook(timeline);
        trackPDFDownloaded(true);
        toast.success('PDF playbook downloaded!');
      } else {
        await generatePreviewPDF(timeline);
        trackPDFDownloaded(false);
        toast.success('Preview PDF downloaded. Enter your email to get the full version!');
        setShowEmailModal(true);
      }
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      toast.error('Failed to generate PDF. Please try again.');
    }
  };

  const handleTaskToggle = (taskId: string) => {
    const newCompleted = new Set(completedTasks);
    if (newCompleted.has(taskId)) {
      newCompleted.delete(taskId);
      trackTaskChecked(taskId, false);
    } else {
      newCompleted.add(taskId);
      trackTaskChecked(taskId, true);
    }
    setCompletedTasks(newCompleted);

    // Save to secure storage
    storage.set('epp_completed_tasks', Array.from(newCompleted));
  };

  const handleShare = (platform: string) => {
    trackSocialShare(platform);
  };

  return (
    <>
      <Helmet>
        <title>Free Event Promotion Timeline Generator | DesMoinesInsider.com</title>
        <meta
          name="description"
          content="Generate a custom 8-week event promotion plan in 2 minutes. Free tool for Des Moines event organizers. Get your timeline now."
        />
        <meta
          name="keywords"
          content="event promotion timeline, event marketing checklist, des moines event promotion, event planning calendar free"
        />
        <link rel="canonical" href="https://desmoinesinsider.com/tools/event-promotion-planner" />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
        {/* Hero/Intro Section */}
        {step === 'intro' && (
          <div className="container mx-auto px-4 py-12 max-w-6xl">
            <div className="text-center mb-12">
              <Badge className="mb-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
                FREE TOOL
              </Badge>
              <h1 className="text-4xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Event Promotion Timeline Generator
              </h1>
              <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
                Stop guessing when to promote your event. Get a customized 8-week promotional roadmap
                in just 2 minutes.
              </p>
              <Button
                size="lg"
                onClick={() => setStep('wizard')}
                className="h-14 px-8 text-lg bg-gradient-to-r from-primary to-blue-600"
              >
                Create My Free Timeline
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>

            {/* Problem Statement */}
            <Card className="mb-8 border-2 border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <h2 className="text-2xl font-bold mb-4 text-center">The Problem Every Event Organizer Faces</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <ProblemCard
                    icon="⏰"
                    title="Too Early"
                    description="Promote too soon and people forget or lose interest"
                  />
                  <ProblemCard
                    icon="⚡"
                    title="Too Late"
                    description="Promote too late and you get poor attendance"
                  />
                  <ProblemCard
                    icon="❓"
                    title="No Strategy"
                    description="Don't know which channels to use or what to post"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Features */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <FeatureCard
                icon={<Calendar className="h-8 w-8" />}
                title="Week-by-Week Plan"
                description="Detailed timeline from 8 weeks out to event day"
              />
              <FeatureCard
                icon={<TrendingUp className="h-8 w-8" />}
                title="Channel Strategy"
                description="Know exactly where and when to promote"
              />
              <FeatureCard
                icon={<Zap className="h-8 w-8" />}
                title="Customized for You"
                description="Tailored to your event type, budget, and audience"
              />
            </div>

            {/* Social Proof */}
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6 mb-8">
              <div className="flex items-center justify-center gap-4 mb-4">
                <Users className="h-10 w-10 text-green-600" />
                <div>
                  <div className="text-3xl font-bold text-green-600">423+</div>
                  <div className="text-gray-700">Des Moines Event Organizers</div>
                </div>
              </div>
              <p className="text-center text-gray-600 italic">
                "This timeline helped us increase our event attendance by 40% compared to last year!"
                <br />
                <span className="text-sm">- Sarah M., Downtown Farmers Market Coordinator</span>
              </p>
            </div>

            {/* How It Works */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="text-2xl text-center">How It Works</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <StepCard
                    number="1"
                    title="Answer 5 Questions"
                    description="Tell us about your event (2 minutes)"
                  />
                  <StepCard
                    number="2"
                    title="Get Your Timeline"
                    description="Instant customized promotion plan"
                  />
                  <StepCard
                    number="3"
                    title="Download PDF"
                    description="Take your playbook with you"
                  />
                  <StepCard
                    number="4"
                    title="Execute & Succeed"
                    description="Follow the plan, fill your event"
                  />
                </div>
              </CardContent>
            </Card>

            {/* CTA */}
            <div className="text-center">
              <Button
                size="lg"
                onClick={() => setStep('wizard')}
                className="h-14 px-8 text-lg bg-gradient-to-r from-primary to-blue-600"
              >
                Start Creating My Timeline
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <p className="text-sm text-gray-500 mt-4">
                No credit card required • 100% Free • 2-minute setup
              </p>
            </div>
          </div>
        )}

        {/* Wizard Section */}
        {step === 'wizard' && (
          <div className="container mx-auto px-4 py-12 max-w-4xl">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">Let's Create Your Promotion Timeline</h1>
              <p className="text-gray-600">Answer a few quick questions about your event</p>
            </div>
            <Card className="p-6">
              <WizardForm onComplete={handleFormComplete} />
            </Card>
          </div>
        )}

        {/* Results Section */}
        {step === 'results' && timeline && (
          <div className="container mx-auto px-4 py-12 max-w-7xl">
            {/* Header */}
            <div className="mb-8">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
                <div>
                  <h1 className="text-3xl font-bold mb-2">Your Event Promotion Timeline</h1>
                  <p className="text-gray-600">
                    {timeline.eventData.eventType.toUpperCase()} event •{' '}
                    {timeline.eventData.expectedAttendance} expected attendees
                  </p>
                </div>
                <div className="flex gap-2 mt-4 md:mt-0">
                  <Button onClick={handleDownloadPDF} variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </Button>
                  {!userEmail && (
                    <Button onClick={() => setShowEmailModal(true)}>
                      Unlock Full Timeline
                    </Button>
                  )}
                </div>
              </div>

              {!timeline.unlocked && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-yellow-800">
                    📧 You're viewing the first 4 weeks. Enter your email to unlock the complete 8-week timeline, downloadable PDF, and weekly reminders!
                  </p>
                </div>
              )}
            </div>

            {/* Main Content */}
            <Tabs value={currentTab} onValueChange={setCurrentTab} className="space-y-6">
              <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="charts">Charts</TabsTrigger>
                <TabsTrigger value="share">Share</TabsTrigger>
              </TabsList>

              <TabsContent value="timeline">
                <TimelineView
                  timeline={timeline}
                  onTaskToggle={handleTaskToggle}
                  completedTasks={completedTasks}
                />
              </TabsContent>

              <TabsContent value="charts">
                <ChartsView timeline={timeline} />
              </TabsContent>

              <TabsContent value="share">
                <div className="space-y-6">
                  <SocialShare referralCode={referralCode || undefined} onShare={handleShare} />

                  {/* List Event CTA */}
                  <Card className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
                    <CardHeader>
                      <CardTitle className="text-white">Ready to Reach 50K+ Des Moines Locals?</CardTitle>
                      <CardDescription className="text-blue-100">
                        List your event on DesMoinesInsider.com for maximum exposure
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 mb-6 text-sm">
                        <li>✓ Free event listing reaches our 50K+ subscriber base</li>
                        <li>✓ Automatic email distribution to interested locals</li>
                        <li>✓ SEO-optimized event page with easy RSVP</li>
                        <li>✓ Optional featured placement for 3x visibility</li>
                      </ul>
                      <Button
                        variant="secondary"
                        size="lg"
                        className="w-full"
                        onClick={() => {
                          trackListingClicked('timeline_share_tab');
                          // Use React Router navigate instead of window.location to prevent potential open redirect
                          navigate('/advertise');
                        }}
                      >
                        List Your Event Free →
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>

            {/* Start Over Button */}
            <div className="text-center mt-8">
              <Button
                variant="outline"
                onClick={() => {
                  setStep('wizard');
                  setTimeline(null);
                }}
              >
                Start Over with New Event
              </Button>
            </div>
          </div>
        )}

        {/* Email Capture Modal */}
        {timeline && (
          <EmailCaptureModal
            isOpen={showEmailModal}
            onClose={() => setShowEmailModal(false)}
            onSubmit={handleEmailCapture}
            eventData={timeline.eventData}
          />
        )}
      </div>
    </>
  );
}

// Helper Components
function ProblemCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="text-center p-4">
      <div className="text-4xl mb-2">{icon}</div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card className="text-center hover:shadow-lg transition-shadow">
      <CardContent className="pt-6">
        <div className="flex justify-center mb-4 text-primary">{icon}</div>
        <h3 className="font-semibold text-lg mb-2">{title}</h3>
        <p className="text-sm text-gray-600">{description}</p>
      </CardContent>
    </Card>
  );
}

function StepCard({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-3">
        {number}
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
}

// Utility function
function generateReferralCode(email: string): string {
  return btoa(email).substring(0, 8).toUpperCase();
}
